<script lang="ts">
	/**
	 * AddGameAccount Component
	 *
	 * Handles adding additional gaming wallets with multiple CDP access methods:
	 * - Email OTP (different email than primary)
	 * - SMS OTP (phone number)
	 * - Google OAuth
	 */
	import { browser } from '$app/environment';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import {
		sendEmailOtp,
		verifyEmailOtp,
		sendSmsOtp,
		verifySmsOtp,
		signInWithOAuth,
		onOAuthStateChange,
		verifyOAuth,
		exportEvmPrivateKey,
		signOutCdpSession,
		ensureCdpSignedOut,
		type CdpUser
	} from '$lib/auth/cdpClient';
	import { deriveAlgorandAccountFromEVM } from '$lib/chains/algorand-derive';
	import { storeGameAccountKeys, type GameAccountKeys } from '$lib/auth/gameAccountStorage';

	type AuthMethod = 'email' | 'sms' | 'google';

	interface Props {
		/** Whether the modal is open */
		open?: boolean;
		/** Pre-filled email address (optional) */
		defaultEmail?: string;
		/** Show as card (when true) or use Modal (when false) */
		showCard?: boolean;
		/** Callback when account is added */
		onSuccess?: (account: { id: string; baseAddress: string; voiAddress: string }) => void;
		/** Callback when modal closes or cancel */
		onClose?: () => void;
		/** Callback when user cancels (alias for onClose) */
		onCancel?: () => void;
		/** Callback when an error occurs */
		onError?: (message: string) => void;
	}

	let { open = false, defaultEmail = '', showCard = false, onSuccess, onClose, onCancel, onError }: Props = $props();

	// Combined close handler that calls both onClose and onCancel
	const handleCloseOrCancel = () => {
		onClose?.();
		onCancel?.();
	};

	// Auth method selection
	let selectedMethod = $state<AuthMethod>('email');

	// Flow state
	type Step = 'select' | 'input' | 'sending' | 'sent' | 'verifying' | 'exporting' | 'saving' | 'done';
	let step = $state<Step>('select');
	let error = $state<string | null>(null);
	let flowId = $state<string | null>(null);

	// Input values
	let emailValue = $state('');
	let phoneValue = $state('');
	let otpValue = $state('');
	let otpInputRef = $state<HTMLInputElement | null>(null);

	// Resend cooldown
	let resendCooldown = $state(0);
	let cooldownInterval: ReturnType<typeof setInterval> | null = null;

	const stepMessages: Record<Step, string> = {
		select: '',
		input: '',
		sending: 'Sending verification code...',
		sent: 'Enter the 6-digit code',
		verifying: 'Verifying code...',
		exporting: 'Securing your gaming wallet...',
		saving: 'Finalizing setup...',
		done: 'Gaming wallet added!'
	};

	/**
	 * Proceed with selected method
	 */
	function handleMethodSelect() {
		step = 'input';
	}

	/**
	 * Send OTP based on method
	 */
	async function handleSendCode() {
		if (!browser) return;

		error = null;
		step = 'sending';

		try {
			// Ensure we're signed out of any existing CDP session first
			// CDP doesn't allow signing into a new account if already signed in
			await ensureCdpSignedOut();

			if (selectedMethod === 'email') {
				if (!emailValue || !emailValue.includes('@')) {
					throw new Error('Please enter a valid email address');
				}
				const result = await sendEmailOtp(emailValue);
				flowId = result.flowId;
			} else if (selectedMethod === 'sms') {
				if (!phoneValue || phoneValue.length < 10) {
					throw new Error('Please enter a valid phone number');
				}
				const result = await sendSmsOtp(phoneValue);
				flowId = result.flowId;
			} else if (selectedMethod === 'google') {
				// OAuth flow - opens popup
				await handleGoogleAuth();
				return;
			}

			step = 'sent';
			startResendCooldown();
			setTimeout(() => otpInputRef?.focus(), 100);
		} catch (err) {
			console.error('Send OTP error:', err);
			error = err instanceof Error ? err.message : 'Failed to send verification code';
			step = 'input';
		}
	}

	/**
	 * Handle Google OAuth flow
	 */
	async function handleGoogleAuth() {
		step = 'verifying';

		try {
			// Ensure we're signed out of any existing CDP session first
			await ensureCdpSignedOut();

			// Set up listener for OAuth state
			let resolved = false;
			const authPromise = new Promise<CdpUser>((resolve, reject) => {
				onOAuthStateChange(async (state) => {
					if (resolved || !state) return;

					if (state.status === 'success' && state.flowId && state.code) {
						resolved = true;
						try {
							const result = await verifyOAuth(state.flowId, state.code, 'google');
							resolve(result.user);
						} catch (err) {
							reject(err);
						}
					} else if (state.status === 'error') {
						resolved = true;
						reject(new Error(state.error || 'OAuth failed'));
					}
				});

				// Timeout after 5 minutes
				setTimeout(() => {
					if (!resolved) {
						resolved = true;
						reject(new Error('Authentication timed out'));
					}
				}, 300000);
			});

			// Initiate OAuth
			await signInWithOAuth('google');

			// Wait for completion
			const user = await authPromise;

			// Complete the flow
			await completeActivation(user, 'google');
		} catch (err) {
			console.error('Google auth error:', err);
			error = err instanceof Error ? err.message : 'Google sign-in failed';
			step = 'select';
		}
	}

	/**
	 * Verify OTP code
	 */
	async function handleVerifyCode() {
		if (!browser || !flowId || otpValue.length !== 6) return;

		error = null;
		step = 'verifying';

		try {
			let user: CdpUser;

			if (selectedMethod === 'email') {
				const result = await verifyEmailOtp(flowId, otpValue);
				user = result.user;
			} else {
				const result = await verifySmsOtp(flowId, otpValue);
				user = result.user;
			}

			await completeActivation(user, selectedMethod);
		} catch (err) {
			console.error('Verify error:', err);
			error = err instanceof Error ? err.message : 'Verification failed';
			step = 'sent';
			otpValue = '';
		}
	}

	/**
	 * Complete the wallet activation after CDP auth
	 */
	async function completeActivation(user: CdpUser, method: AuthMethod) {
		step = 'exporting';

		try {
			// Get EVM address
			const baseAddress = user.evmAccounts?.[0] || user.evmSmartAccounts?.[0];
			if (!baseAddress) {
				throw new Error('No wallet found');
			}

			// Export private key
			const formattedAddress = baseAddress.startsWith('0x')
				? (baseAddress as `0x${string}`)
				: (`0x${baseAddress}` as `0x${string}`);

			const privateKey = await exportEvmPrivateKey(formattedAddress);

			if (!privateKey) {
				throw new Error('Unable to access wallet');
			}

			// Derive Voi address
			const derivedAccount = deriveAlgorandAccountFromEVM(privateKey);
			const voiAddress = derivedAccount.addr;

			const voiPrivateKey = Array.from(derivedAccount.sk)
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');

			step = 'saving';

			// Store keys
			const baseAddressLower = (baseAddress as string).toLowerCase();
			const keys: GameAccountKeys = {
				basePrivateKey: privateKey,
				voiPrivateKey,
				baseAddress: baseAddressLower,
				voiAddress,
				storedAt: Date.now()
			};

			await storeGameAccountKeys(keys);
			derivedAccount.sk.fill(0);

			// Create recovery hint
			let recoveryHint = '';
			if (method === 'email') {
				recoveryHint = obfuscateEmail(emailValue);
			} else if (method === 'sms') {
				recoveryHint = obfuscatePhone(phoneValue);
			} else if (method === 'google') {
				// Get email from user's auth methods
				const googleEmail = user.authenticationMethods?.google?.email;
				recoveryHint = googleEmail ? obfuscateEmail(googleEmail) : 'Google account';
			}

			// Register with backend
			const response = await fetch('/api/game-accounts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cdpUserId: user.userId || (user as any).id,
					baseAddress: baseAddressLower,
					voiAddress,
					cdpRecoveryMethod: method,
					cdpRecoveryHint: recoveryHint
				})
			});

			const result = await response.json();

			if (!response.ok || !result.ok) {
				// Sign out of CDP before throwing to clean up
				await signOutCdpSession();
				throw new Error(result.error || 'Failed to register wallet');
			}

			await signOutCdpSession();

			step = 'done';
			await new Promise((resolve) => setTimeout(resolve, 800));

			onSuccess?.({
				id: result.accountId,
				baseAddress: baseAddressLower,
				voiAddress
			});
		} catch (err) {
			console.error('Complete activation error:', err);
			const errorMessage = err instanceof Error ? err.message : 'Setup failed';
			error = errorMessage;
			step = 'select';
			// Also notify parent component of the error
			onError?.(errorMessage);
		}
	}

	/**
	 * Resend OTP
	 */
	async function handleResend() {
		if (resendCooldown > 0) return;
		otpValue = '';
		await handleSendCode();
	}

	function startResendCooldown() {
		resendCooldown = 60;
		if (cooldownInterval) clearInterval(cooldownInterval);
		cooldownInterval = setInterval(() => {
			resendCooldown--;
			if (resendCooldown <= 0 && cooldownInterval) {
				clearInterval(cooldownInterval);
				cooldownInterval = null;
			}
		}, 1000);
	}

	function handleOtpInput(e: Event) {
		const input = e.target as HTMLInputElement;
		otpValue = input.value.replace(/\D/g, '').slice(0, 6);
	}

	function handleOtpKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && otpValue.length === 6) {
			handleVerifyCode();
		}
	}

	function obfuscateEmail(email: string): string {
		const [local, domain] = email.split('@');
		if (!domain) return email;
		const [domainName, ...tld] = domain.split('.');
		const obfuscatedLocal = local.length > 1 ? local[0] + '***' : local;
		const obfuscatedDomain = domainName.length > 1 ? domainName[0] + '***' : domainName;
		return `${obfuscatedLocal}@${obfuscatedDomain}.${tld.join('.')}`;
	}

	function obfuscatePhone(phone: string): string {
		const digits = phone.replace(/\D/g, '');
		if (digits.length < 4) return phone;
		return '***-***-' + digits.slice(-4);
	}

	function handleClose() {
		if (step !== 'verifying' && step !== 'exporting' && step !== 'saving') {
			resetState();
			onClose?.();
		}
	}

	function handleBack() {
		if (step === 'input') {
			step = 'select';
		} else if (step === 'sent') {
			step = 'input';
			otpValue = '';
		}
	}

	function resetState() {
		step = 'select';
		selectedMethod = 'email';
		emailValue = '';
		phoneValue = '';
		otpValue = '';
		flowId = null;
		error = null;
		resendCooldown = 0;
		if (cooldownInterval) {
			clearInterval(cooldownInterval);
			cooldownInterval = null;
		}
	}

	$effect(() => {
		if (!open) {
			resetState();
		}
	});

	$effect(() => {
		return () => {
			if (cooldownInterval) clearInterval(cooldownInterval);
		};
	});

	const isProcessing = $derived(
		step === 'sending' || step === 'verifying' || step === 'exporting' || step === 'saving'
	);
</script>

<Modal isOpen={open} onClose={handleClose} title="">
	<div class="space-y-6">
		{#if error}
			<div
				class="rounded-xl border border-error-300 bg-error-100 p-4 text-center text-sm font-semibold text-error-600 dark:border-error-500/30 dark:bg-error-500/20 dark:text-error-400"
			>
				{error}
			</div>
		{/if}

		{#if step === 'select'}
			<div class="space-y-4 text-center">
				<div class="mb-4 text-5xl">➕</div>
				<h3 class="text-xl font-bold text-neutral-800 dark:text-neutral-200">
					Add Gaming Wallet
				</h3>
				<p class="text-sm text-neutral-600 dark:text-neutral-400">
					Choose how you'd like to set up this wallet
				</p>
			</div>

			<div class="space-y-3">
				<button
					onclick={() => {
						selectedMethod = 'email';
						handleMethodSelect();
					}}
					class="flex w-full items-center gap-4 rounded-xl border-2 border-neutral-200 p-4 transition-colors hover:border-warning-500 hover:bg-warning-50 dark:border-neutral-700 dark:hover:border-warning-500 dark:hover:bg-warning-900/20"
				>
					<span class="text-2xl">📧</span>
					<div class="text-left">
						<p class="font-semibold text-neutral-800 dark:text-neutral-200">Email</p>
						<p class="text-sm text-neutral-500 dark:text-neutral-400">
							Use a different email address
						</p>
					</div>
				</button>

				<button
					onclick={() => {
						selectedMethod = 'sms';
						handleMethodSelect();
					}}
					class="flex w-full items-center gap-4 rounded-xl border-2 border-neutral-200 p-4 transition-colors hover:border-warning-500 hover:bg-warning-50 dark:border-neutral-700 dark:hover:border-warning-500 dark:hover:bg-warning-900/20"
				>
					<span class="text-2xl">📱</span>
					<div class="text-left">
						<p class="font-semibold text-neutral-800 dark:text-neutral-200">Phone</p>
						<p class="text-sm text-neutral-500 dark:text-neutral-400">
							Receive code via SMS
						</p>
					</div>
				</button>

				<button
					onclick={() => {
						selectedMethod = 'google';
						handleSendCode();
					}}
					class="flex w-full items-center gap-4 rounded-xl border-2 border-neutral-200 p-4 transition-colors hover:border-warning-500 hover:bg-warning-50 dark:border-neutral-700 dark:hover:border-warning-500 dark:hover:bg-warning-900/20"
				>
					<span class="text-2xl">🔵</span>
					<div class="text-left">
						<p class="font-semibold text-neutral-800 dark:text-neutral-200">Google</p>
						<p class="text-sm text-neutral-500 dark:text-neutral-400">
							Sign in with Google account
						</p>
					</div>
				</button>
			</div>

			<Button variant="ghost" size="md" onclick={handleClose} class="w-full">
				Cancel
			</Button>
		{:else if step === 'input'}
			<div class="space-y-4 text-center">
				<div class="mb-4 text-5xl">{selectedMethod === 'email' ? '📧' : '📱'}</div>
				<h3 class="text-xl font-bold text-neutral-800 dark:text-neutral-200">
					{selectedMethod === 'email' ? 'Enter Email' : 'Enter Phone Number'}
				</h3>
			</div>

			<div>
				{#if selectedMethod === 'email'}
					<input
						type="email"
						bind:value={emailValue}
						placeholder="your@email.com"
						class="w-full rounded-xl border-2 border-neutral-300 bg-white px-4 py-3 text-neutral-800 placeholder:text-neutral-400 focus:border-warning-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:border-warning-500"
					/>
				{:else}
					<input
						type="tel"
						bind:value={phoneValue}
						placeholder="+1 555 123 4567"
						class="w-full rounded-xl border-2 border-neutral-300 bg-white px-4 py-3 text-neutral-800 placeholder:text-neutral-400 focus:border-warning-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:border-warning-500"
					/>
				{/if}
			</div>

			<div class="space-y-3">
				<Button
					variant="primary"
					size="md"
					onclick={handleSendCode}
					disabled={isProcessing || (selectedMethod === 'email' ? !emailValue : !phoneValue)}
					loading={isProcessing}
					class="w-full"
				>
					Send Code
				</Button>

				<Button variant="ghost" size="md" onclick={handleBack} disabled={isProcessing} class="w-full">
					Back
				</Button>
			</div>
		{:else if step === 'sending'}
			<div class="space-y-4 text-center">
				<div class="flex justify-center">
					<div
						class="h-12 w-12 animate-spin rounded-full border-3 border-warning-500 border-t-transparent"
					></div>
				</div>
				<p class="text-neutral-600 dark:text-neutral-400">{stepMessages.sending}</p>
			</div>
		{:else if step === 'sent'}
			<div class="space-y-4 text-center">
				<div class="mb-4 text-5xl">{selectedMethod === 'email' ? '📧' : '📱'}</div>
				<h3 class="text-xl font-bold text-neutral-800 dark:text-neutral-200">
					Check Your {selectedMethod === 'email' ? 'Email' : 'Phone'}
				</h3>
				<p class="text-sm text-neutral-600 dark:text-neutral-400">
					Enter the 6-digit code sent to{' '}
					<span class="font-medium">
						{selectedMethod === 'email' ? emailValue : phoneValue}
					</span>
				</p>

				<div class="mx-auto max-w-[200px]">
					<input
						bind:this={otpInputRef}
						type="text"
						inputmode="numeric"
						pattern="[0-9]*"
						maxlength="6"
						value={otpValue}
						oninput={handleOtpInput}
						onkeydown={handleOtpKeydown}
						placeholder="000000"
						class="w-full rounded-xl border-2 border-neutral-300 bg-white px-4 py-3 text-center text-2xl font-bold tracking-widest text-neutral-800 placeholder:text-neutral-300 focus:border-warning-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:border-warning-500"
					/>
				</div>

				<p class="text-xs text-neutral-500">
					{#if resendCooldown > 0}
						Resend code in {resendCooldown}s
					{:else}
						<button
							onclick={handleResend}
							class="text-warning-600 underline hover:text-warning-700 dark:text-warning-400"
						>
							Resend code
						</button>
					{/if}
				</p>
			</div>

			<div class="space-y-3">
				<Button
					variant="primary"
					size="md"
					onclick={handleVerifyCode}
					disabled={otpValue.length !== 6 || isProcessing}
					loading={isProcessing}
					class="w-full"
				>
					Verify Code
				</Button>

				<Button variant="ghost" size="md" onclick={handleBack} disabled={isProcessing} class="w-full">
					Back
				</Button>
			</div>
		{:else if step === 'verifying' || step === 'exporting' || step === 'saving'}
			<div class="space-y-4 text-center">
				<div class="flex justify-center">
					<div
						class="h-12 w-12 animate-spin rounded-full border-3 border-warning-500 border-t-transparent"
					></div>
				</div>
				<h3 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
					{step === 'verifying' ? 'Verifying...' : 'Setting Up Wallet...'}
				</h3>
				<p class="text-sm text-neutral-600 dark:text-neutral-400">
					{stepMessages[step]}
				</p>
			</div>
		{:else if step === 'done'}
			<div class="space-y-4 text-center">
				<div class="mb-4 text-5xl">✅</div>
				<h3 class="text-xl font-bold text-success-600 dark:text-success-400">
					Gaming Wallet Added!
				</h3>
				<p class="text-sm text-neutral-600 dark:text-neutral-400">
					Your new wallet is ready to use.
				</p>
			</div>
		{/if}
	</div>
</Modal>
