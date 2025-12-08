<script lang="ts">
	/**
	 * GameAccountLockedBanner Component
	 *
	 * A warning banner shown on the games browse page when the user's
	 * game account is locked. Prompts them to unlock before playing.
	 */
	import { browser } from '$app/environment';
	import Button from '$lib/components/ui/Button.svelte';
	import { canDecryptKeys, hasGameAccountKeys } from '$lib/auth/gameAccountStorage';
	import UnlockGameAccount from '$lib/components/gameAccounts/UnlockGameAccount.svelte';

	interface Props {
		/** The Voi address to check */
		voiAddress?: string;
		/** Recovery method for the account */
		recoveryMethod?: 'email' | 'sms' | 'google' | 'mnemonic' | null;
		/** Obfuscated recovery hint */
		recoveryHint?: string | null;
	}

	let { voiAddress, recoveryMethod = null, recoveryHint = null }: Props = $props();

	// Lock detection state
	let isAccountLocked = $state(false);
	let lockReason = $state<'no_keys' | 'cannot_decrypt' | 'cookie_expired' | undefined>(undefined);
	let showUnlockModal = $state(false);

	// Check lock status on mount and when voiAddress changes
	$effect(() => {
		if (browser && voiAddress) {
			checkLockStatus();
		}
	});

	function checkLockStatus() {
		if (!voiAddress) {
			isAccountLocked = false;
			return;
		}

		// Check if we have the cookie needed to decrypt
		if (!canDecryptKeys()) {
			isAccountLocked = true;
			lockReason = 'cookie_expired';
			return;
		}

		// Check if keys exist for this address
		if (!hasGameAccountKeys(voiAddress)) {
			isAccountLocked = true;
			lockReason = 'no_keys';
			return;
		}

		isAccountLocked = false;
		lockReason = undefined;
	}

	function handleUnlock() {
		showUnlockModal = true;
	}

	function handleUnlockSuccess() {
		showUnlockModal = false;
		// Re-check lock status
		checkLockStatus();
	}

	function handleUnlockClose() {
		showUnlockModal = false;
	}

	// Get user-friendly message based on reason
	const lockMessage = $derived(() => {
		switch (lockReason) {
			case 'cookie_expired':
				return 'Your session has expired. Please unlock your account to continue playing.';
			case 'no_keys':
				return 'Your game account keys are not available. Please unlock to play.';
			default:
				return 'Your game account needs to be unlocked before you can play.';
		}
	});
</script>

{#if isAccountLocked && voiAddress}
	<div
		class="relative overflow-hidden rounded-2xl border-2 border-warning-400 bg-gradient-to-br from-warning-50 to-warning-100 p-5 shadow-lg dark:border-warning-500/50 dark:from-warning-900/30 dark:to-warning-800/20"
	>
		<!-- Background decoration -->
		<div
			class="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-warning-200/50 blur-2xl dark:bg-warning-500/20"
		></div>

		<div class="relative flex flex-col items-center gap-4 sm:flex-row sm:items-center">
			<!-- Lock Icon -->
			<div class="flex-shrink-0">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="40"
					height="40"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="text-warning-600 dark:text-warning-400"
				>
					<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
					<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
				</svg>
			</div>

			<!-- Content -->
			<div class="flex-1 text-center sm:text-left">
				<h3 class="text-lg font-bold text-neutral-800 dark:text-neutral-100">
					Game Account Locked
				</h3>
				<p class="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
					{lockMessage()}
				</p>
			</div>

			<!-- Action button -->
			<div class="flex-shrink-0">
				<Button variant="primary" size="sm" onclick={handleUnlock}>
					Unlock Account
				</Button>
			</div>
		</div>
	</div>

	<!-- Unlock Modal -->
	<UnlockGameAccount
		{voiAddress}
		{recoveryMethod}
		{recoveryHint}
		modal={true}
		open={showUnlockModal}
		onSuccess={handleUnlockSuccess}
		onClose={handleUnlockClose}
	/>
{/if}
