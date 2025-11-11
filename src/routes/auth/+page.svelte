<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import AuthLoadingOverlay from '$lib/components/AuthLoadingOverlay.svelte';
  import algosdk from 'algosdk';
  import { buildProofOfOwnershipTransaction } from '$lib/chains/algorand-browser';
  import { deriveAlgorandAccountFromEVM } from '$lib/chains/algorand-derive';
  import { getInitializedCdp } from '$lib/auth/cdpClient';
  import { storeKeys } from '$lib/auth/keyStorage';

  // Note: CDP SDK must be initialized on client side only
  let cdpReady = $state(false);
  type CdpCoreModule = typeof import('@coinbase/cdp-core');
  let cdpModule: CdpCoreModule | null = $state(null);

  // CDP Hooks equivalents - we'll use the SDK directly
  let currentUser: any = $state(null);
  let evmAddress: string | null = $state(null);
  let oauthState: any = $state(null);

  const E164_PHONE_REGEX = /^\+\d{8,15}$/;

  // State
  let email = $state('');
  let phone = $state('');
  let otpCode = $state('');
  let flowId = $state<string | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let isSuccess = $state(false);
  let authMethod = $state<'email' | 'sms' | 'oauth' | null>(null);
  let otpSent = $state(false);
  let oauthProcessed = $state(false);
  let inputMode = $state<'email' | 'phone'>('email');

  // Phone normalization function
  function normalizeE164Phone(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    const digitsOnly = trimmed.replace(/[^\d]/g, '');

    if (!digitsOnly) {
      return null;
    }

    let normalizedDigits = digitsOnly;

    if (trimmed.startsWith('+')) {
      // Already includes a plus; ensure it falls within valid length.
      if (normalizedDigits.length < 8 || normalizedDigits.length > 15) {
        return null;
      }
      return `+${normalizedDigits}`;
    }

    if (normalizedDigits.length === 11 && normalizedDigits.startsWith('1')) {
      // Already includes the US country code prefix.
    } else if (normalizedDigits.length === 10) {
      normalizedDigits = `1${normalizedDigits}`;
    } else {
      // Unable to infer country code reliably
      return null;
    }

    const normalized = `+${normalizedDigits}`;
    return E164_PHONE_REGEX.test(normalized) ? normalized : null;
  }

  function extractEvmAddress(user: any): string | null {
    if (!user) return null;
    const smart = Array.isArray(user.evmSmartAccounts) ? user.evmSmartAccounts[0] : null;
    if (smart) return smart;
    const eoa = Array.isArray(user.evmAccounts) ? user.evmAccounts[0] : null;
    return eoa ?? null;
  }

  function updateAuthState(user: any) {
    currentUser = user;
    evmAddress = extractEvmAddress(user);
  }

  async function ensureCdpModule(): Promise<CdpCoreModule> {
    if (!browser) {
      throw new Error('Authentication is only available in the browser.');
    }

    if (!cdpModule) {
      cdpModule = await getInitializedCdp();
    }

    return cdpModule;
  }

  // Initialize CDP SDK on client side
  onMount(async () => {
    if (browser) {
      try {
        const cdp = await ensureCdpModule();

        cdp.onAuthStateChange(updateAuthState);
        cdp.onOAuthStateChange((state) => {
          oauthState = state;
        });

        updateAuthState(await cdp.getCurrentUser());

        cdpReady = true;

        checkExistingSession();
      } catch (err) {
        console.error('Failed to load CDP SDK:', err);
        error =
          err instanceof Error && err.message
            ? err.message
            : 'Failed to initialize authentication system';
      }
    }
  });

  async function checkExistingSession() {
    // Check if user already has a valid CDP session (not just HTTP session cookie)
    // CDP session is the source of truth
    try {
      const cdp = await ensureCdpModule();
      const user = await cdp.getCurrentUser();
      
      // Only redirect if CDP is actually signed in
      if (user) {
        const response = await fetch('/api/profile/me');
        if (response.ok) {
          // User has valid CDP session and HTTP session, redirect to app
          goto('/app');
        }
      }
      // If no CDP user, don't redirect - let them sign in
    } catch (err) {
      // No existing session or CDP not signed in, continue with auth flow
    }
  }

  /**
   * Handles email authentication flow
   */
  async function handleEmailAuth() {
    if (!email) {
      error = 'Please enter your email address';
      return;
    }

    loading = true;
    error = null;

    try {
      const sdk = await ensureCdpModule();

      const result = await sdk.signInWithEmail({ email });
      flowId = result.flowId;
      authMethod = 'email';
      otpSent = true;
    } catch (err) {
      console.error('Email auth error:', err);
      error = 'Failed to send verification code. Please try again.';
    } finally {
      loading = false;
    }
  }

  /**
   * Handles SMS authentication flow
   */
  async function handleSmsAuth() {
    if (!phone) {
      error = 'Please enter your phone number';
      return;
    }

    const normalizedPhone = normalizeE164Phone(phone);

    if (!normalizedPhone) {
      error = 'Please enter a valid phone number (10 digits for US numbers or full international format).';
      return;
    }

    loading = true;
    error = null;

    try {
      const sdk = await ensureCdpModule();
      const result = await sdk.signInWithSms({ phoneNumber: normalizedPhone });
      flowId = result.flowId;
      authMethod = 'sms';
      otpSent = true;
      phone = normalizedPhone;
    } catch (err) {
      console.error('SMS auth error:', err);
      error = 'Failed to send verification code. Please try again.';
    } finally {
      loading = false;
    }
  }

  /**
   * Verifies OTP and completes authentication
   */
  async function handleVerifyOtp() {
    if (!otpCode || !flowId || !authMethod) {
      error = 'Please enter the verification code';
      return;
    }

    loading = true;
    error = null;

    try {
      const sdk = await ensureCdpModule();
      let user;

      // Verify based on auth method
      if (authMethod === 'email') {
        const result = await sdk.verifyEmailOTP({ otp: otpCode, flowId });
        user = result.user;
      } else if (authMethod === 'sms') {
        const result = await sdk.verifySmsOTP({ otp: otpCode, flowId });
        user = result.user;
      } else {
        throw new Error('Invalid authentication method');
      }

      // Complete backend session creation
      await completeAuthentication(user);
    } catch (err) {
      console.error('OTP verification error:', err);
      error = 'Verification failed. Please check your code and try again.';
      loading = false;
    }
  }

  /**
   * Handles social login (Google, Apple, etc.)
   */
  async function handleSocialLogin(provider: 'google' | 'apple') {
    loading = true;
    error = null;

    try {
      const sdk = await ensureCdpModule();
      await sdk.signInWithOAuth(provider);
      // OAuth flow will redirect and come back with user authenticated
    } catch (err) {
      console.error('Social login error:', err);
      error = `Failed to connect with ${provider}. Please try again.`;
      loading = false;
    }
  }

  async function completeAuthentication(user: any) {
    loading = true;
    error = null;

    let sdk: CdpCoreModule;
    try {
      sdk = await ensureCdpModule();
    } catch (initError) {
      error =
        initError instanceof Error && initError.message
          ? initError.message
          : 'Authentication is not initialized. Please refresh and try again.';
      loading = false;
      return;
    }

    async function linkAlgorandWallet({
      serverBaseAddress,
      walletAddress,
    }: {
      serverBaseAddress: string;
      walletAddress: string;
    }) {
      const candidateAccounts = Array.from(
        new Set(
          [walletAddress, serverBaseAddress, evmAddress]
            .filter(
              (value): value is string => typeof value === 'string' && value.length > 0
            )
            .flatMap((value) => {
              const normalized = value.toLowerCase();
              return normalized === value ? [value] : [value, normalized];
            })
        )
      );

      if (candidateAccounts.length === 0) {
        throw new Error('Unable to determine your Base wallet address for export.');
      }

      let exportedPrivateKey: string | null = null;
      for (const candidate of candidateAccounts) {
        try {
          const { privateKey } = await sdk.exportEvmAccount({ evmAccount: candidate as `0x${string}` });
          if (privateKey) {
            exportedPrivateKey = privateKey;
            break;
          }
        } catch (exportError) {
          console.warn('Failed to export Base key for address', candidate, exportError);
        }
      }

      if (!exportedPrivateKey) {
        throw new Error(
          'Failed to export Base private key from Coinbase. Please approve the export prompt and try again.'
        );
      }

      const derivedAccount = deriveAlgorandAccountFromEVM(exportedPrivateKey);

      // Best-effort cleanup of EVM private key string
      exportedPrivateKey = '';

      const challengeResponse = await fetch('/api/auth/algorand/challenge', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => null);

      if (!challengeResponse) {
        throw new Error('Failed to contact Algorand challenge endpoint.');
      }

      const challengeResult = await challengeResponse.json();

      if (!challengeResponse.ok || !challengeResult.challenge) {
        throw new Error(challengeResult.error || 'Failed to obtain Algorand challenge.');
      }
      const { challenge, baseAddress: challengeBaseAddress } = challengeResult;
      const normalizedBase = serverBaseAddress.toLowerCase();

      if (
        typeof challengeBaseAddress === 'string' &&
        challengeBaseAddress.toLowerCase() !== normalizedBase
      ) {
        throw new Error('Challenge response did not match your Base wallet address.');
      }

      const proofTxn = buildProofOfOwnershipTransaction(derivedAccount.address, challenge);
      const signedTxn = algosdk.signTransaction(proofTxn, derivedAccount.secretKey);
      const signedTxnBase64 = algosdk.bytesToBase64(signedTxn.blob);

      // Overwrite the secret key in memory after signing
      derivedAccount.secretKey.fill(0);

      const linkResponse = await fetch('/api/auth/algorand/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          algorandAddress: derivedAccount.address,
          signedTransaction: signedTxnBase64,
          challenge,
        }),
      });

      const linkResult = await linkResponse.json();

      if (!linkResponse.ok || !linkResult.ok) {
        throw new Error(linkResult.error || 'Failed to verify Algorand ownership.');
      }
    }

    try {
      const walletAddress = user.evmAccounts?.[0];

      if (!walletAddress) {
        throw new Error('No Coinbase EVM account found for this user.');
      }

      let accessToken: string | null = null;
      try {
        accessToken = await sdk.getAccessToken();
      } catch (tokenError) {
        console.error('Failed to fetch CDP access token:', tokenError);
      }

      if (!accessToken) {
        throw new Error('Unable to retrieve Coinbase session token. Please try signing in again.');
      }

      const verifyResponse = await fetch('/api/auth/coinbase-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          cdpUserId:
            user.userId || (user as any).id || undefined,
          walletAddress,
        }),
      });

      const verifyResult = await verifyResponse.json();

      if (!verifyResponse.ok || !verifyResult.ok) {
        throw new Error(verifyResult.error || 'Failed to verify Coinbase authentication.');
      }

      const baseAddress: string | undefined = verifyResult.baseWalletAddress;

      if (!baseAddress) {
        throw new Error('Backend did not return a Base wallet address.');
      }

      if (!verifyResult.hasLinkedAlgorand) {
        await linkAlgorandWallet({
          serverBaseAddress: baseAddress,
          walletAddress,
        });
      }

      // Export and store keys immediately after authentication
      // This is a one-time operation - keys are stored encrypted in browser storage
      try {
        console.log('🔐 Exporting and storing keys...');
        
        // Export Base private key from CDP (one-time)
        let exportedBaseKey: string | null = null;
        for (const candidate of [walletAddress, baseAddress].filter(Boolean)) {
          try {
            const formatted = candidate.startsWith('0x')
              ? (candidate as `0x${string}`)
              : (`0x${candidate.replace(/^0x/, '')}` as `0x${string}`);
            
            const { privateKey } = await sdk.exportEvmAccount({ evmAccount: formatted });
            if (privateKey) {
              exportedBaseKey = privateKey;
              break;
            }
          } catch (exportError) {
            console.warn('Failed to export Base key for address', candidate, exportError);
          }
        }

        if (!exportedBaseKey) {
          throw new Error('Failed to export Base private key for storage');
        }

        // Derive Voi private key immediately
        const derivedAccount = deriveAlgorandAccountFromEVM(exportedBaseKey);
        // Convert secret key (Uint8Array) to hex string
        const voiPrivateKey = Array.from(derivedAccount.sk)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        // Get addresses
        const baseAddr = baseAddress.toLowerCase();
        const voiAddr = derivedAccount.addr;

        // Store keys encrypted in browser storage
        await storeKeys(exportedBaseKey, voiPrivateKey, baseAddr, voiAddr);

        // Clear keys from memory immediately
        exportedBaseKey = '';
        derivedAccount.sk.fill(0);

        console.log('✅ Keys stored successfully');
      } catch (keyStorageError) {
        console.error('⚠️ Failed to store keys:', keyStorageError);
        // Don't block login if key storage fails - user can still use the app
        // but will need to export keys from CDP for each operation
      }

      isSuccess = true;

      // Emit login success event for UserNav to refresh
      if (browser && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hov:login-success'));
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      goto('/app');
    } catch (authError) {
      console.error('Complete auth error:', authError);
      const errorMessage = authError instanceof Error ? authError.message : 'Failed to complete authentication. Please try again.';

      // If token expired, clear state and prompt for re-auth
      if (errorMessage.includes('expired') || errorMessage.includes('Invalid or expired CDP')) {
        error = 'Session expired. Please sign in again.';
        otpSent = false;
        otpCode = '';
        email = '';
        phone = '';
        authMethod = null;
        oauthProcessed = false;
        // Clear any stale cookies
        if (browser) {
          document.cookie = 'hov_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        }
      } else {
        error = errorMessage;
      }

      loading = false;
    }
  }

  // Handle existing CDP sessions (OAuth or returning users)
  $effect(() => {
    if (cdpReady && currentUser && !oauthProcessed && !loading) {
      oauthProcessed = true;

      // Determine auth method from OAuth state or default to email
      const method = oauthState?.status === 'success' ? 'oauth' : 'email';
      authMethod = method;

      completeAuthentication(currentUser);
    }
  });

  function handleKeyDown(e: KeyboardEvent, handler: () => void, condition: boolean) {
    if (e.key === 'Enter' && condition) {
      handler();
    }
  }
</script>

<svelte:head>
  <title>Sign In - House of Voi</title>
</svelte:head>

<!-- Full-page loading overlay -->
<AuthLoadingOverlay isLoading={loading} {isSuccess} error={null} />

<div class="min-h-[80vh] flex items-center justify-center py-12">
  <div class="w-full max-w-md space-y-8">
    <!-- Header -->
    <div class="text-center space-y-2">
      <h1 class="text-4xl font-black text-warning-500 dark:text-warning-400 neon-text uppercase">
        Welcome
      </h1>
      <p class="text-neutral-600 dark:text-neutral-400">
        Sign in or create your account
      </p>
    </div>

    <!-- Error Display -->
    {#if error}
      <div class="p-4 rounded-xl text-center font-semibold bg-error-100 dark:bg-error-500/20 text-error-600 dark:text-error-400 border border-error-300 dark:border-error-500/30">
        {error}
      </div>
    {/if}

    <!-- Main Auth Card -->
    <Card glow>
      <CardContent class="p-8">
        {#if !otpSent}
          <div class="space-y-6">
            <!-- Social Login First (Most friction-free) -->
            <div class="space-y-3">
              <Button
                variant="secondary"
                size="md"
                onclick={() => handleSocialLogin('google')}
                disabled={loading || !cdpReady}
                class="w-full text-base py-3"
              >
                <svg class="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </Button>
            </div>

            <!-- Divider -->
            <div class="relative">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-warning-200 dark:border-warning-900/30"></div>
              </div>
              <div class="relative flex justify-center text-sm">
                <span class="px-4 bg-white dark:bg-neutral-950 text-neutral-600 dark:text-neutral-500">or</span>
              </div>
            </div>

            <!-- Email/Phone Inputs -->
            <div class="space-y-4">
              {#if inputMode === 'email'}
                <Input
                  label="Email"
                  type="email"
                  bind:value={email}
                  placeholder="you@example.com"
                  onkeydown={(e) => handleKeyDown(e, handleEmailAuth, !!email)}
                />

                <Button
                  variant="primary"
                  size="md"
                  onclick={handleEmailAuth}
                  disabled={loading || !email || !cdpReady}
                  class="w-full"
                >
                  Continue with Email
                </Button>
              {:else}
                <Input
                  label="Phone Number"
                  type="tel"
                  bind:value={phone}
                  placeholder="+1 (555) 123-4567"
                  onkeydown={(e) => handleKeyDown(e, handleSmsAuth, !!phone)}
                />
                <Button
                  variant="primary"
                  size="md"
                  onclick={handleSmsAuth}
                  disabled={loading || !phone || !cdpReady}
                  class="w-full"
                >
                  Continue with Phone
                </Button>
              {/if}

              <!-- Toggle between email and phone -->
              <button
                onclick={() => inputMode = inputMode === 'email' ? 'phone' : 'email'}
                disabled={loading}
                class="w-full text-center text-sm text-neutral-600 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-400 underline"
              >
                {inputMode === 'email' ? 'Use phone number instead' : 'Use email instead'}
              </button>
            </div>
          </div>
        {:else}
          <!-- OTP Verification -->
          <div class="space-y-6">
            <div class="text-center space-y-2">
              <div class="text-5xl mb-4">📧</div>
              <h2 class="text-xl font-bold text-warning-500 dark:text-warning-400">Check your {authMethod === 'email' ? 'email' : 'phone'}</h2>
              <p class="text-neutral-600 dark:text-neutral-400 text-sm">
                We sent a verification code to
              </p>
              <p class="text-warning-500 dark:text-warning-400 font-semibold">
                {authMethod === 'email' ? email : phone}
              </p>
            </div>

            <Input
              label="Verification Code"
              type="text"
              bind:value={otpCode}
              oninput={(e: Event) => {
                const target = e.target as HTMLInputElement;
                otpCode = target.value.replace(/\D/g, '');
              }}
              placeholder="000000"
              maxlength={6}
              class="text-center text-2xl tracking-widest"
              onkeydown={(e) => handleKeyDown(e, handleVerifyOtp, otpCode.length === 6)}
            />

            <Button
              variant="primary"
              size="md"
              onclick={handleVerifyOtp}
              disabled={loading || otpCode.length !== 6}
              class="w-full"
            >
              Verify & Continue
            </Button>

            <button
              onclick={() => {
                otpSent = false;
                otpCode = '';
                error = null;
              }}
              disabled={loading}
              class="w-full text-center text-sm text-neutral-600 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-400 underline"
            >
              ← Use a different method
            </button>
          </div>
        {/if}
      </CardContent>
    </Card>

    <!-- Footer Info -->
    <p class="text-center text-xs text-neutral-600 dark:text-neutral-500">
      By continuing, you agree to our Terms of Service and Privacy Policy
    </p>
  </div>
</div>
