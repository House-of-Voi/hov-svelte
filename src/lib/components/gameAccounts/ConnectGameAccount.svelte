<script lang="ts">
  /**
   * ConnectGameAccount Component
   *
   * Handles the flow of connecting a new CDP wallet as a "game account".
   * This triggers CDP authentication, exports the private key, derives the Voi address,
   * stores the keys encrypted in localStorage, and registers the account with the backend.
   *
   * After completion, it immediately signs out of CDP (we only needed the key).
   */
  import { browser } from '$app/environment';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import { getInitializedCdp } from '$lib/auth/cdpClient';
  import { deriveAlgorandAccountFromEVM } from '$lib/chains/algorand-derive';
  import { storeGameAccountKeys, type GameAccountKeys } from '$lib/auth/gameAccountStorage';

  interface Props {
    onSuccess?: (account: { id: string; baseAddress: string; voiAddress: string }) => void;
    onCancel?: () => void;
    showCard?: boolean;
  }

  let { onSuccess, onCancel, showCard = true }: Props = $props();

  // State
  let isConnecting = $state(false);
  let error = $state<string | null>(null);
  let step = $state<'idle' | 'authenticating' | 'exporting' | 'deriving' | 'saving' | 'done'>(
    'idle'
  );

  const stepMessages: Record<typeof step, string> = {
    idle: '',
    authenticating: 'Signing in to your game account...',
    exporting: 'Securing your account...',
    deriving: 'Setting up your player...',
    saving: 'Finalizing...',
    done: 'Game account ready!',
  };

  /**
   * Main flow: Connect a CDP wallet as a game account
   */
  async function connectGameAccount() {
    if (!browser) return;

    isConnecting = true;
    error = null;
    step = 'authenticating';

    try {
      // Get CDP SDK
      const cdp = await getInitializedCdp();

      // Check if already signed in, or trigger sign-in
      let user = await cdp.getCurrentUser();

      if (!user) {
        // Wait for user to sign in via CDP
        // CDP will show its own UI for email/phone/social
        user = await waitForCdpAuth(cdp);
      }

      if (!user) {
        throw new Error('Authentication was cancelled');
      }

      step = 'exporting';

      // Get the EVM (Base) address
      const baseAddress = user.evmAccounts?.[0] || user.evmSmartAccounts?.[0];
      if (!baseAddress) {
        throw new Error('No wallet found. Please try again.');
      }

      // Export the private key
      const formatted = baseAddress.startsWith('0x')
        ? (baseAddress as `0x${string}`)
        : (`0x${baseAddress}` as `0x${string}`);

      const { privateKey } = await cdp.exportEvmAccount({ evmAccount: formatted });

      if (!privateKey) {
        throw new Error('Unable to access account. Please approve the request and try again.');
      }

      step = 'deriving';

      // Derive Voi address from Base private key
      const derivedAccount = deriveAlgorandAccountFromEVM(privateKey);
      const voiAddress = derivedAccount.addr;

      // Convert secret key (Uint8Array) to hex string
      const voiPrivateKey = Array.from(derivedAccount.sk)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      step = 'saving';

      // Store keys encrypted in localStorage
      const baseAddressLower = (baseAddress as string).toLowerCase();
      const keys: GameAccountKeys = {
        basePrivateKey: privateKey,
        voiPrivateKey,
        baseAddress: baseAddressLower,
        voiAddress,
        storedAt: Date.now(),
      };

      await storeGameAccountKeys(keys);

      // Clear sensitive data from memory
      derivedAccount.sk.fill(0);

      // Register with backend
      const response = await fetch('/api/game-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cdpUserId: user.userId || (user as any).id,
          baseAddress: baseAddressLower,
          voiAddress,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to register game account');
      }

      // Sign out of CDP immediately - we only needed the key
      try {
        await cdp.signOut();
      } catch {
        // Ignore sign-out errors
      }

      step = 'done';

      // Brief pause to show success
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Callback with success
      onSuccess?.({
        id: result.accountId,
        baseAddress: baseAddressLower,
        voiAddress,
      });
    } catch (err) {
      console.error('Connect game account error:', err);
      error = err instanceof Error ? err.message : 'Failed to connect game account';
      step = 'idle';
    } finally {
      isConnecting = false;
    }
  }

  /**
   * Waits for CDP authentication to complete
   */
  async function waitForCdpAuth(cdp: any): Promise<any> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      // Set up listener for auth state change
      const unsubscribe = cdp.onAuthStateChange((user: any) => {
        if (user && !resolved) {
          resolved = true;
          unsubscribe?.();
          resolve(user);
        }
      });

      // Set up timeout
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          unsubscribe?.();
          reject(new Error('Authentication timed out'));
        }
      }, 300000); // 5 minute timeout

      // Clean up on cancel
      if (onCancel) {
        // User can cancel, which will trigger cleanup
      }
    });
  }

  function handleCancel() {
    if (!isConnecting) {
      onCancel?.();
    }
  }

  // Render content
  const content = $derived.by(() => {
    return {
      title:
        step === 'idle'
          ? 'Create Game Account'
          : step === 'done'
            ? 'Success!'
            : 'Setting Up Your Account',
      message: stepMessages[step],
      showSpinner: isConnecting && step !== 'done',
    };
  });
</script>

{#snippet innerContent()}
  <div class="space-y-6">
    {#if error}
      <div
        class="p-4 rounded-xl text-center font-semibold bg-error-100 dark:bg-error-500/20 text-error-600 dark:text-error-400 border border-error-300 dark:border-error-500/30"
      >
        {error}
      </div>
    {/if}

    <div class="text-center space-y-4">
      {#if step === 'idle'}
        <div class="text-5xl mb-4">🎮</div>
        <h3 class="text-xl font-bold text-neutral-800 dark:text-neutral-200">
          Create Your Game Account
        </h3>
        <p class="text-neutral-600 dark:text-neutral-400 text-sm">
          Set up a new game account to start playing. You can add multiple accounts later.
        </p>
      {:else if step === 'done'}
        <div class="text-5xl mb-4">✅</div>
        <h3 class="text-xl font-bold text-success-600 dark:text-success-400">
          Game Account Ready!
        </h3>
        <p class="text-neutral-600 dark:text-neutral-400 text-sm">
          Your account has been set up successfully.
        </p>
      {:else}
        {#if content.showSpinner}
          <div class="flex justify-center">
            <div
              class="w-12 h-12 border-3 border-warning-500 border-t-transparent rounded-full animate-spin"
            ></div>
          </div>
        {/if}
        <h3 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
          {content.title}
        </h3>
        <p class="text-neutral-600 dark:text-neutral-400 text-sm">
          {content.message}
        </p>
      {/if}
    </div>

    {#if step === 'idle'}
      <div class="space-y-3">
        <Button
          variant="primary"
          size="md"
          onclick={connectGameAccount}
          disabled={isConnecting}
          loading={isConnecting}
          class="w-full"
        >
          Create Game Account
        </Button>

        {#if onCancel}
          <Button
            variant="ghost"
            size="md"
            onclick={handleCancel}
            disabled={isConnecting}
            class="w-full"
          >
            Cancel
          </Button>
        {/if}
      </div>

      <p class="text-center text-xs text-neutral-500 dark:text-neutral-600">
        You'll sign in with your email, phone, or social account to secure your game account.
      </p>
    {/if}
  </div>
{/snippet}

{#if showCard}
  <Card glow>
    <CardContent class="p-8">
      {@render innerContent()}
    </CardContent>
  </Card>
{:else}
  {@render innerContent()}
{/if}
