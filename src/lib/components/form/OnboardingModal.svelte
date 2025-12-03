<script lang="ts">
	import { onMount } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { signOutCdpSession } from '$lib/auth/cdpClient';
	import { clearAllGameAccountKeys } from '$lib/auth/gameAccountStorage';

	type Props = {
		isOpen: boolean;
		email: string;
		onComplete: () => void;
	};

	let { isOpen, email, onComplete }: Props = $props();

	type Step = 'name' | 'referral' | 'avatar';

	let step = $state<Step>('name');
	let displayName = $state('');
	let referralCode = $state('');
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	let showReferralBypass = $state(false);

	// Load referral code from cookie on mount
	onMount(() => {
		if (typeof window === 'undefined') return;

		const cookies = document.cookie.split(';');
		const refCookie = cookies.find((c) => c.trim().startsWith('hov_ref='));
		if (refCookie) {
			const code = refCookie.split('=')[1];
			referralCode = code.toUpperCase();
		}
	});

	const stepIndex = step === 'name' ? 0 : step === 'referral' ? 1 : 2;
	const totalSteps = 3;

	const canProceedFromName = displayName.trim().length > 0;

	async function handleNext() {
		if (step === 'name' && canProceedFromName) {
			step = 'referral';
			error = null;
			showReferralBypass = false;
		} else if (step === 'referral') {
			// Validate referral code if provided
			if (referralCode.trim()) {
				isSubmitting = true;
				error = null;
				showReferralBypass = false;

				try {
					const response = await fetch('/api/referrals/validate', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ code: referralCode.trim().toUpperCase() })
					});

					const result = await response.json();

					if (!response.ok || !result.valid) {
						error = result.error || 'Invalid referral code';
						showReferralBypass = true;
						isSubmitting = false;
						return;
					}

					// Valid code, proceed to avatar step
					step = 'avatar';
					error = null;
					showReferralBypass = false;
				} catch (err) {
					error = 'Failed to validate referral code';
					showReferralBypass = true;
					console.error('Referral validation error:', err);
				} finally {
					isSubmitting = false;
				}
			} else {
				// No code provided, skip validation
				step = 'avatar';
				error = null;
				showReferralBypass = false;
			}
		}
	}

	function handleBypassReferral() {
		referralCode = '';
		error = null;
		showReferralBypass = false;
		step = 'avatar';
	}

	function handleBack() {
		if (step === 'referral') {
			step = 'name';
		} else if (step === 'avatar') {
			step = 'referral';
		}
	}

	function handleSkipStep() {
		if (step === 'referral') {
			step = 'avatar';
		} else if (step === 'avatar') {
			handleComplete();
		}
	}

	async function handleComplete() {
		if (!displayName.trim()) {
			error = 'Please enter your name';
			return;
		}

		isSubmitting = true;
		error = null;

		try {
			// 1. Update profile with display name
			const profileResponse = await fetch('/api/profile/me', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					display_name: displayName.trim()
				})
			});

			if (!profileResponse.ok) {
				const result = await profileResponse.json();
				throw new Error(result.error || 'Failed to update profile');
			}

			const profileResult = await profileResponse.json();
			if (!profileResult.success) {
				throw new Error('Profile update failed');
			}

			// 2. Link referral code if provided
			if (referralCode.trim()) {
				const referralResponse = await fetch('/api/profile/link-referral', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						referralCode: referralCode.trim().toUpperCase()
					})
				});

				// Don't fail onboarding if referral linking fails, just log it
				if (!referralResponse.ok) {
					const result = await referralResponse.json();
					console.warn('Referral linking failed:', result.error);
				}
			}

			// Success! Clear referral cookie
			if (typeof window !== 'undefined') {
				document.cookie = 'hov_ref=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
			}

			// Complete onboarding
			onComplete();
		} catch (err) {
			console.error('Onboarding error:', err);
			error = err instanceof Error ? err.message : 'Failed to complete onboarding';
			isSubmitting = false;
		}
	}

	async function handleSignOut() {
		try {
			// Clear stored game account keys from browser storage
			clearAllGameAccountKeys();

			// Sign out from CDP (if still available)
			await signOutCdpSession();

			await fetch('/api/auth/logout', { method: 'POST' });
			window.location.href = '/auth';
		} catch (error) {
			console.error('Logout error:', error);
			// Still clear keys and redirect even if CDP signout fails
			clearAllGameAccountKeys();
			await fetch('/api/auth/logout', { method: 'POST' });
			window.location.href = '/auth';
		}
	}
</script>

<Modal {isOpen} onClose={() => {}} title="Welcome to House of Voi" size="lg" hideCloseButton={true}>
	<div class="space-y-6">
		<!-- Sign Out Button -->
		<div class="flex justify-end -mt-2 mb-2">
			<button
				onclick={handleSignOut}
				disabled={isSubmitting}
				class="text-xs text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline transition-colors"
			>
				Sign Out
			</button>
		</div>

		<!-- Progress indicator -->
		<div class="flex items-center justify-between">
			{#each ['Name', 'Referral', 'Avatar'] as label, index}
				<div class="flex items-center flex-1">
					<div
						class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm {index <=
						stepIndex
							? 'bg-warning-500 text-white'
							: 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-500'}"
					>
						{index + 1}
					</div>
					<div class="ml-2 flex-1">
						<p
							class="text-sm font-semibold {index <= stepIndex
								? 'text-warning-500 dark:text-warning-400'
								: 'text-neutral-600 dark:text-neutral-500'}"
						>
							{label}
						</p>
					</div>
					{#if index < totalSteps - 1}
						<div
							class="h-1 flex-1 mx-2 rounded {index < stepIndex
								? 'bg-warning-500'
								: 'bg-neutral-200 dark:bg-neutral-800'}"
						/>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Error display -->
		{#if error}
			<div
				class="p-3 bg-error-100 dark:bg-error-500/20 border border-error-300 dark:border-error-500/30 rounded-lg space-y-2"
			>
				<p class="text-sm text-error-600 dark:text-error-400">{error}</p>
				{#if showReferralBypass}
					<button
						onclick={handleBypassReferral}
						class="text-sm text-error-700 dark:text-error-300 underline hover:no-underline font-medium"
					>
						Proceed without referral code
					</button>
				{/if}
			</div>
		{/if}

		<!-- Step content -->
		<div class="min-h-[400px] max-h-[500px] overflow-y-auto">
			{#if step === 'name'}
				<div class="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
					<div class="text-center mb-6">
						<h3 class="text-2xl font-bold text-warning-500 dark:text-warning-400 mb-2">
							What should we call you?
						</h3>
						<p class="text-neutral-400 text-sm">This will be your display name on House of Voi</p>
					</div>

					<Input
						label="Display Name"
						bind:value={displayName}
						placeholder="Enter your name"
						onKeyDown={(e) => {
							if (e.key === 'Enter' && canProceedFromName) handleNext();
						}}
					/>

					<div class="text-xs text-neutral-600 dark:text-neutral-500">
						{email.includes('@') ? 'Email' : 'Phone'}: {email}
					</div>
				</div>
			{:else if step === 'referral'}
				<div class="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
					<div class="text-center mb-6">
						<h3 class="text-2xl font-bold text-warning-500 dark:text-warning-400 mb-2">
							Have a referral code?
						</h3>
						<p class="text-neutral-400 text-sm">
							Enter your code to connect with the person who invited you
						</p>
					</div>

					<Input
						label="Referral Code (Optional)"
						bind:value={referralCode}
						placeholder="Enter code"
						maxlength={7}
						onKeyDown={(e) => {
							if (e.key === 'Enter') handleNext();
						}}
					/>

					{#if referralCode}
						<p class="text-xs text-warning-500 dark:text-warning-400">
							Code will be validated when you click Next
						</p>
					{/if}
				</div>
			{:else if step === 'avatar'}
				<div class="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
					<div class="text-center mb-4">
						<h3 class="text-xl font-bold text-warning-500 dark:text-warning-400 mb-1">
							Choose your avatar
						</h3>
						<p class="text-neutral-400 text-sm">
							Avatar selection will be available in a future update
						</p>
					</div>

					<!-- TODO: Port AvatarSelector component -->
					<div class="text-center p-8 border border-neutral-300 dark:border-neutral-700 rounded-lg">
						<p class="text-neutral-500 dark:text-neutral-400">Avatar selector coming soon</p>
					</div>
				</div>
			{/if}
		</div>

		<!-- Navigation buttons -->
		<div class="flex gap-3 pt-4 border-t border-neutral-800">
			{#if step !== 'name'}
				<Button variant="ghost" size="md" onclick={handleBack} disabled={isSubmitting}> Back </Button>
			{/if}

			{#if step === 'name'}
				<Button
					variant="primary"
					size="md"
					onclick={handleNext}
					disabled={!canProceedFromName}
					className="flex-1"
				>
					Next
				</Button>
			{:else if step === 'referral'}
				<Button variant="ghost" size="md" onclick={handleSkipStep} disabled={isSubmitting}>
					Skip
				</Button>
				<Button
					variant="primary"
					size="md"
					onclick={handleNext}
					disabled={isSubmitting}
					className="flex-1"
				>
					{isSubmitting ? 'Validating...' : 'Next'}
				</Button>
			{:else}
				<Button variant="ghost" size="md" onclick={handleSkipStep} disabled={isSubmitting}>
					Skip
				</Button>
				<Button
					variant="primary"
					size="md"
					onclick={handleComplete}
					disabled={isSubmitting}
					className="flex-1"
				>
					{isSubmitting ? 'Completing...' : 'Complete Setup'}
				</Button>
			{/if}
		</div>
	</div>
</Modal>
