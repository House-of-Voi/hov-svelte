<script lang="ts">
	/**
	 * UnlockGameAccount Component
	 *
	 * Handles unlocking a gaming wallet that has lost its keys (e.g., browser data cleared).
	 * For CDP accounts: Uses CDP's headless OTP API for a streamlined unlock experience.
	 * For mnemonic accounts: Delegates to UnlockMnemonicAccount for mnemonic re-import.
	 *
	 * The component uses the stored recovery hint (cdp_recovery_method, cdp_recovery_hint)
	 * to guide the user on which method to use for unlocking.
	 */
	import { browser } from '$app/environment';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import UnlockMnemonicAccount from './UnlockMnemonicAccount.svelte';
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

	type RecoveryMethod = 'email' | 'sms' | 'google' | 'mnemonic' | null;

	interface Props {
		/** The Voi address of the account to unlock */
		voiAddress: string;
		/** Optional nickname for display */
		nickname?: string | null;
		/** The recovery method used when this wallet was created */
		recoveryMethod?: RecoveryMethod;
		/** Obfuscated recovery hint (e.g., "j***@g***.com") */
		recoveryHint?: string | null;
		/** Show as modal or inline */
		modal?: boolean;
		/** Whether the modal is open (controlled) */
		open?: boolean;
		/** Callback when unlock succeeds */
		onSuccess?: () => void;
		/** Callback when modal closes or cancel */
		onClose?: () => void;
	}

	let {
		voiAddress,
		nickname = null,
		recoveryMethod = null,
		recoveryHint = null,
		modal = true,
		open = false,
		onSuccess,
		onClose
	}: Props = $props();

	// Flow state
	type Step = 'idle' | 'input' | 'sending' | 'sent' | 'verifying' | 'exporting' | 'saving' | 'done';
	let step = $state<Step>('idle');
	let error = $state<string | null>(null);
	let flowId = $state<string | null>(null);

	// Selected method (for when no recovery hint is available)
	let selectedMethod = $state<RecoveryMethod>(recoveryMethod);

	// Input values
	let emailValue = $state('');
	let phoneValue = $state('');
	let otpValue = $state('');
	let otpInputRef = $state<HTMLInputElement | null>(null);

	// Resend cooldown
	let resendCooldown = $state(0);
	let cooldownInterval: ReturnType<typeof setInterval> | null = null;

	const stepMessages: Record<Step, string> = {
		idle: '',
		input: '',
		sending: 'Sending verification code...',
		sent: 'Enter the 6-digit code',
		verifying: 'Verifying code...',
		exporting: 'Restoring wallet access...',
		saving: 'Finalizing...',
		done: 'Wallet unlocked!'
	};

	// Shortened address for display
	const shortAddress = $derived(
		voiAddress ? `${voiAddress.slice(0, 6)}...${voiAddress.slice(-4)}` : ''
	);

	// Display name for the account
	const displayName = $derived(nickname || shortAddress);

	// Recovery hint display text
	const recoveryHintText = $derived(() => {
		if (!recoveryMethod) return null;
		if (recoveryMethod === 'email' && recoveryHint) {
			return `Unlock with ${recoveryHint}`;
		} else if (recoveryMethod === 'sms' && recoveryHint) {
			return `Unlock with phone ${recoveryHint}`;
		} else if (recoveryMethod === 'google') {
			return recoveryHint ? `Unlock with Google (${recoveryHint})` : 'Unlock with Google';
		}
		return null;
	});

	/**
	 * Start unlock flow
	 */
	function handleStartUnlock() {
		error = null;

		// If we know the recovery method, use it directly
		if (recoveryMethod) {
			selectedMethod = recoveryMethod;
			if (recoveryMethod === 'google') {
				handleGoogleAuth();
			} else {
				step = 'input';
			}
		} else {
			// Show method selection
			step = 'input';
		}
	}

	/**
	 * Send OTP
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

				setTimeout(() => {
					if (!resolved) {
						resolved = true;
						reject(new Error('Authentication timed out'));
					}
				}, 300000);
			});

			await signInWithOAuth('google');
			const user = await authPromise;
			await completeUnlock(user);
		} catch (err) {
			console.error('Google auth error:', err);
			error = err instanceof Error ? err.message : 'Google sign-in failed';
			step = 'idle';
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

			await completeUnlock(user);
		} catch (err) {
			console.error('Verify error:', err);
			error = err instanceof Error ? err.message : 'Verification failed';
			step = 'sent';
			otpValue = '';
		}
	}

	/**
	 * Complete the unlock after CDP auth
	 */
	async function completeUnlock(user: CdpUser) {
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

			// Derive Voi address to verify it matches
			const derivedAccount = deriveAlgorandAccountFromEVM(privateKey);
			const derivedVoiAddress = derivedAccount.addr;

			// CRITICAL: Verify the derived address matches the expected address
			if (derivedVoiAddress !== voiAddress) {
				derivedAccount.sk.fill(0);
				await signOutCdpSession();

				throw new Error(
					"This account doesn't match. Please sign in with the same email/phone you used to create this gaming wallet."
				);
			}

			step = 'saving';

			// Convert secret key to hex
			const voiPrivateKey = Array.from(derivedAccount.sk)
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');

			// Store keys
			const baseAddressLower = (baseAddress as string).toLowerCase();
			const keys: GameAccountKeys = {
				basePrivateKey: privateKey,
				voiPrivateKey,
				baseAddress: baseAddressLower,
				voiAddress: derivedVoiAddress,
				storedAt: Date.now()
			};

			await storeGameAccountKeys(keys);
			derivedAccount.sk.fill(0);

			// Update last_unlocked_at on backend
			await fetch('/api/game-accounts', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					voiAddress,
					markUnlocked: true
				})
			}).catch(() => {
				// Non-critical, ignore errors
			});

			await signOutCdpSession();

			step = 'done';
			await new Promise((resolve) => setTimeout(resolve, 800));

			onSuccess?.();
		} catch (err) {
			console.error('Complete unlock error:', err);
			error = err instanceof Error ? err.message : 'Unlock failed';
			step = 'idle';
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

	function handleClose() {
		if (step !== 'verifying' && step !== 'exporting' && step !== 'saving') {
			resetState();
			onClose?.();
		}
	}

	function handleBack() {
		if (step === 'input' || step === 'sent') {
			step = 'idle';
			otpValue = '';
			emailValue = '';
			phoneValue = '';
		}
	}

	function resetState() {
		step = 'idle';
		selectedMethod = recoveryMethod;
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

{#snippet innerContent()}
	<div class="space-y-6">
		{#if error}
			<div
				class="rounded-xl border border-error-300 bg-error-100 p-4 text-center text-sm font-semibold text-error-600 dark:border-error-500/30 dark:bg-error-500/20 dark:text-error-400"
			>
				{error}
			</div>
		{/if}

		{#if step === 'idle'}
			<div class="space-y-4 text-center">
				<div class="mb-4 text-5xl">🔒</div>
				<h3 class="text-xl font-bold text-neutral-800 dark:text-neutral-200">
					Unlock Gaming Wallet
				</h3>
				<p class="text-sm text-neutral-600 dark:text-neutral-400">
					{#if nickname}
						<span class="font-semibold text-warning-500">{nickname}</span>
					{:else}
						Wallet <span class="font-mono text-xs">{shortAddress}</span>
					{/if}
					needs to be unlocked.
				</p>

				{#if recoveryHintText()}
					<div class="mx-auto max-w-xs rounded-lg bg-neutral-100 px-4 py-3 dark:bg-neutral-800">
						<p class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
							{recoveryHintText()}
						</p>
					</div>
				{/if}
			</div>

			<div class="space-y-3">
				<Button
					variant="primary"
					size="md"
					onclick={handleStartUnlock}
					disabled={isProcessing}
					loading={isProcessing}
					class="w-full"
				>
					{#if recoveryMethod === 'google'}
						Sign in with Google
					{:else if recoveryMethod}
						Send Verification Code
					{:else}
						Unlock Wallet
					{/if}
				</Button>

				<Button variant="ghost" size="md" onclick={handleClose} disabled={isProcessing} class="w-full">
					Cancel
				</Button>
			</div>
		{:else if step === 'input'}
			<div class="space-y-4 text-center">
				<div class="mb-4 text-5xl">{selectedMethod === 'email' ? '📧' : '📱'}</div>
				<h3 class="text-xl font-bold text-neutral-800 dark:text-neutral-200">
					{selectedMethod === 'email' ? 'Enter Your Email' : 'Enter Your Phone'}
				</h3>
				<p class="text-sm text-neutral-600 dark:text-neutral-400">
					Use the same {selectedMethod === 'email' ? 'email' : 'phone'} you used to create this wallet
				</p>
			</div>

			{#if !recoveryMethod}
				<!-- Method selection if no recovery hint -->
				<div class="flex gap-2">
					<button
						onclick={() => (selectedMethod = 'email')}
						class="flex-1 rounded-lg border-2 p-3 text-center transition-colors
							{selectedMethod === 'email'
							? 'border-warning-500 bg-warning-50 dark:bg-warning-900/20'
							: 'border-neutral-200 dark:border-neutral-700'}"
					>
						<span class="text-lg">📧</span>
						<p class="text-sm font-medium text-neutral-800 dark:text-neutral-200">Email</p>
					</button>
					<button
						onclick={() => (selectedMethod = 'sms')}
						class="flex-1 rounded-lg border-2 p-3 text-center transition-colors
							{selectedMethod === 'sms'
							? 'border-warning-500 bg-warning-50 dark:bg-warning-900/20'
							: 'border-neutral-200 dark:border-neutral-700'}"
					>
						<span class="text-lg">📱</span>
						<p class="text-sm font-medium text-neutral-800 dark:text-neutral-200">Phone</p>
					</button>
					<button
						onclick={() => {
							selectedMethod = 'google';
							handleGoogleAuth();
						}}
						class="flex-1 rounded-lg border-2 border-neutral-200 p-3 text-center transition-colors hover:border-warning-500 dark:border-neutral-700"
					>
						<span class="text-lg">🔵</span>
						<p class="text-sm font-medium text-neutral-800 dark:text-neutral-200">Google</p>
					</button>
				</div>
			{/if}

			{#if selectedMethod === 'email'}
				<input
					type="email"
					bind:value={emailValue}
					placeholder="your@email.com"
					class="w-full rounded-xl border-2 border-neutral-300 bg-white px-4 py-3 text-neutral-800 placeholder:text-neutral-400 focus:border-warning-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:border-warning-500"
				/>
			{:else if selectedMethod === 'sms'}
				<input
					type="tel"
					bind:value={phoneValue}
					placeholder="+1 555 123 4567"
					class="w-full rounded-xl border-2 border-neutral-300 bg-white px-4 py-3 text-neutral-800 placeholder:text-neutral-400 focus:border-warning-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:border-warning-500"
				/>
			{/if}

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
					{step === 'verifying' ? 'Verifying...' : 'Restoring Wallet...'}
				</h3>
				<p class="text-sm text-neutral-600 dark:text-neutral-400">
					{stepMessages[step]}
				</p>
			</div>
		{:else if step === 'done'}
			<div class="space-y-4 text-center">
				<div class="mb-4 text-5xl">🔓</div>
				<h3 class="text-xl font-bold text-success-600 dark:text-success-400">Wallet Unlocked!</h3>
				<p class="text-sm text-neutral-600 dark:text-neutral-400">
					You can now use this gaming wallet.
				</p>
			</div>
		{/if}
	</div>
{/snippet}

{#if recoveryMethod === 'mnemonic'}
	<!-- Delegate mnemonic accounts to the specialized component -->
	<UnlockMnemonicAccount
		{voiAddress}
		{nickname}
		modal={modal}
		open={open}
		showCard={true}
		onSuccess={onSuccess}
		onClose={onClose}
	/>
{:else if modal}
	<Modal isOpen={open} onClose={handleClose} title="">
		{@render innerContent()}
	</Modal>
{:else}
	{@render innerContent()}
{/if}
