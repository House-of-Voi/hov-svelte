<script lang="ts">
	/**
	 * ActivateGameAccount Component
	 *
	 * Handles first-time gaming wallet activation using the user's Supabase email.
	 * Uses CDP's headless OTP API for a streamlined experience:
	 * 1. User sees their email pre-filled
	 * 2. Clicks "Send Code" to trigger OTP
	 * 3. Enters 6-digit code
	 * 4. Keys are exported, derived, and stored
	 */
	import { browser } from '$app/environment';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import {
		sendEmailOtp,
		verifyEmailOtp,
		exportEvmPrivateKey,
		signOutCdpSession,
		ensureCdpSignedOut,
		type CdpUser
	} from '$lib/auth/cdpClient';
	import { deriveAlgorandAccountFromEVM } from '$lib/chains/algorand-derive';
	import { storeGameAccountKeys, type GameAccountKeys } from '$lib/auth/gameAccountStorage';

	interface Props {
		/** User's email from Supabase Auth (pre-filled, read-only) */
		email: string;
		/** Callback when activation succeeds */
		onSuccess?: (account: { id: string; baseAddress: string; voiAddress: string }) => void;
		/** Callback when user cancels */
		onCancel?: () => void;
		/** Show as card or raw content */
		showCard?: boolean;
	}

	let { email, onSuccess, onCancel, showCard = true }: Props = $props();

	// Flow state
	type Step = 'idle' | 'sending' | 'sent' | 'verifying' | 'exporting' | 'saving' | 'done';
	let step = $state<Step>('idle');
	let error = $state<string | null>(null);
	let flowId = $state<string | null>(null);

	// OTP input
	let otpValue = $state('');
	let otpInputRef = $state<HTMLInputElement | null>(null);

	// Resend cooldown
	let resendCooldown = $state(0);
	let cooldownInterval: ReturnType<typeof setInterval> | null = null;

	const stepMessages: Record<Step, string> = {
		idle: '',
		sending: 'Sending verification code...',
		sent: 'Enter the 6-digit code sent to your email',
		verifying: 'Verifying code...',
		exporting: 'Securing your gaming wallet...',
		saving: 'Finalizing setup...',
		done: 'Gaming wallet activated!'
	};

	/**
	 * Send OTP to the user's email
	 */
	async function handleSendCode() {
		if (!browser || !email) return;

		error = null;
		step = 'sending';

		try {
			// Ensure we're signed out of any existing CDP session first
			// CDP doesn't allow signing into a new account if already signed in
			await ensureCdpSignedOut();

			const result = await sendEmailOtp(email);
			flowId = result.flowId;
			step = 'sent';
			startResendCooldown();

			// Focus OTP input after a short delay
			setTimeout(() => otpInputRef?.focus(), 100);
		} catch (err) {
			console.error('Send OTP error:', err);
			error = err instanceof Error ? err.message : 'Failed to send verification code';
			step = 'idle';
		}
	}

	/**
	 * Verify the OTP and complete activation
	 */
	async function handleVerifyCode() {
		if (!browser || !flowId || otpValue.length !== 6) return;

		error = null;
		step = 'verifying';

		try {
			// Verify OTP
			const { user } = await verifyEmailOtp(flowId, otpValue);

			step = 'exporting';

			// Get the EVM address
			const baseAddress = user.evmAccounts?.[0] || user.evmSmartAccounts?.[0];
			if (!baseAddress) {
				throw new Error('No wallet found. Please try again.');
			}

			// Export private key
			const formattedAddress = baseAddress.startsWith('0x')
				? (baseAddress as `0x${string}`)
				: (`0x${baseAddress}` as `0x${string}`);

			const privateKey = await exportEvmPrivateKey(formattedAddress);

			if (!privateKey) {
				throw new Error('Unable to access wallet. Please try again.');
			}

			// Derive Voi address
			const derivedAccount = deriveAlgorandAccountFromEVM(privateKey);
			const voiAddress = derivedAccount.addr;

			// Convert secret key to hex
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
				storedAt: Date.now()
			};

			await storeGameAccountKeys(keys);

			// Clear sensitive data
			derivedAccount.sk.fill(0);

			// Create obfuscated email hint
			const emailHint = obfuscateEmail(email);

			// Register with backend
			const response = await fetch('/api/game-accounts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cdpUserId: user.userId || (user as any).id,
					baseAddress: baseAddressLower,
					voiAddress,
					cdpRecoveryMethod: 'email',
					cdpRecoveryHint: emailHint
				})
			});

			const result = await response.json();

			if (!response.ok || !result.ok) {
				throw new Error(result.error || 'Failed to register gaming wallet');
			}

			// Sign out of CDP (we only needed the key)
			await signOutCdpSession();

			step = 'done';

			// Brief pause to show success
			await new Promise((resolve) => setTimeout(resolve, 800));

			onSuccess?.({
				id: result.accountId,
				baseAddress: baseAddressLower,
				voiAddress
			});
		} catch (err) {
			console.error('Verify OTP error:', err);
			error = err instanceof Error ? err.message : 'Verification failed';
			step = 'sent'; // Go back to OTP input
			otpValue = '';
		}
	}

	/**
	 * Resend OTP code
	 */
	async function handleResend() {
		if (resendCooldown > 0) return;
		otpValue = '';
		await handleSendCode();
	}

	/**
	 * Start 60-second resend cooldown
	 */
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

	/**
	 * Handle OTP input
	 */
	function handleOtpInput(e: Event) {
		const input = e.target as HTMLInputElement;
		// Only allow digits, max 6
		otpValue = input.value.replace(/\D/g, '').slice(0, 6);
	}

	/**
	 * Handle OTP keydown for enter
	 */
	function handleOtpKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && otpValue.length === 6) {
			handleVerifyCode();
		}
	}

	/**
	 * Obfuscate email for display (j***@g***.com)
	 */
	function obfuscateEmail(email: string): string {
		const [local, domain] = email.split('@');
		if (!domain) return email;

		const [domainName, ...tld] = domain.split('.');
		const obfuscatedLocal = local.length > 1 ? local[0] + '***' : local;
		const obfuscatedDomain = domainName.length > 1 ? domainName[0] + '***' : domainName;

		return `${obfuscatedLocal}@${obfuscatedDomain}.${tld.join('.')}`;
	}

	function handleCancel() {
		if (step !== 'verifying' && step !== 'exporting' && step !== 'saving') {
			if (cooldownInterval) clearInterval(cooldownInterval);
			onCancel?.();
		}
	}

	// Cleanup on unmount
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

		<div class="space-y-4 text-center">
			{#if step === 'idle'}
				<div class="mb-4 text-5xl">🎮</div>
				<h3 class="text-xl font-bold text-neutral-800 dark:text-neutral-200">
					Activate Your Gaming Wallet
				</h3>
				<p class="text-sm text-neutral-600 dark:text-neutral-400">
					We'll send a verification code to your email to set up your gaming wallet.
				</p>

				<div class="mx-auto max-w-xs rounded-lg bg-neutral-100 px-4 py-3 dark:bg-neutral-800">
					<p class="text-sm text-neutral-500 dark:text-neutral-400">Sending code to:</p>
					<p class="font-medium text-neutral-800 dark:text-neutral-200">{email}</p>
				</div>
			{:else if step === 'sending'}
				<div class="flex justify-center">
					<div
						class="h-12 w-12 animate-spin rounded-full border-3 border-warning-500 border-t-transparent"
					></div>
				</div>
				<p class="text-neutral-600 dark:text-neutral-400">{stepMessages.sending}</p>
			{:else if step === 'sent'}
				<div class="mb-4 text-5xl">📧</div>
				<h3 class="text-xl font-bold text-neutral-800 dark:text-neutral-200">
					Check Your Email
				</h3>
				<p class="text-sm text-neutral-600 dark:text-neutral-400">
					Enter the 6-digit code sent to <span class="font-medium">{email}</span>
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
						class="w-full rounded-xl border-2 border-neutral-300 bg-white px-4 py-3 text-center text-2xl font-bold tracking-widest text-neutral-800 placeholder:text-neutral-300 focus:border-warning-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:placeholder:text-neutral-600 dark:focus:border-warning-500"
					/>
				</div>

				<p class="text-xs text-neutral-500">
					{#if resendCooldown > 0}
						Resend code in {resendCooldown}s
					{:else}
						<button
							onclick={handleResend}
							class="text-warning-600 underline hover:text-warning-700 dark:text-warning-400 dark:hover:text-warning-300"
						>
							Resend code
						</button>
					{/if}
				</p>
			{:else if step === 'verifying' || step === 'exporting' || step === 'saving'}
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
			{:else if step === 'done'}
				<div class="mb-4 text-5xl">✅</div>
				<h3 class="text-xl font-bold text-success-600 dark:text-success-400">
					Gaming Wallet Activated!
				</h3>
				<p class="text-sm text-neutral-600 dark:text-neutral-400">
					Your wallet is ready. You can now play games!
				</p>
			{/if}
		</div>

		{#if step === 'idle'}
			<div class="space-y-3">
				<Button
					variant="primary"
					size="md"
					onclick={handleSendCode}
					disabled={isProcessing}
					loading={isProcessing}
					class="w-full"
				>
					Send Verification Code
				</Button>

				{#if onCancel}
					<Button
						variant="ghost"
						size="md"
						onclick={handleCancel}
						disabled={isProcessing}
						class="w-full"
					>
						Maybe Later
					</Button>
				{/if}
			</div>
		{:else if step === 'sent'}
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

				{#if onCancel}
					<Button
						variant="ghost"
						size="md"
						onclick={handleCancel}
						disabled={isProcessing}
						class="w-full"
					>
						Cancel
					</Button>
				{/if}
			</div>
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
