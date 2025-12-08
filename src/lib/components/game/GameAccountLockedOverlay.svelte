<script lang="ts">
	/**
	 * GameAccountLockedOverlay Component
	 *
	 * Displayed over the game UI when the user's game account is locked.
	 * Provides a clear message and unlock button to allow the user to unlock their account.
	 */
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		/** The Voi address that is locked */
		voiAddress?: string;
		/** Reason for the lock */
		reason?: 'no_keys' | 'cannot_decrypt' | 'cookie_expired';
		/** Callback when user clicks unlock button */
		onRequestUnlock?: () => void;
	}

	let { voiAddress, reason, onRequestUnlock }: Props = $props();

	function handleUnlock() {
		onRequestUnlock?.();
	}

	function handleBackToGames() {
		window.location.href = '/games';
	}

	// Get user-friendly reason message
	const reasonMessage = $derived(() => {
		switch (reason) {
			case 'cookie_expired':
				return 'Your session has expired. Please unlock your account to continue playing.';
			case 'no_keys':
				return 'Your game account keys are not available. Please unlock your account to continue playing.';
			case 'cannot_decrypt':
				return 'Unable to access your game account keys. Please unlock your account to continue playing.';
			default:
				return 'Your game account needs to be unlocked before you can play.';
		}
	});
</script>

<div class="locked-overlay">
	<div class="locked-content">
		<!-- Lock Icon -->
		<div class="lock-icon">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="64"
				height="64"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
				<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
			</svg>
		</div>

		<!-- Title -->
		<h2 class="locked-title">Account Locked</h2>

		<!-- Message -->
		<p class="locked-message">{reasonMessage()}</p>

		<!-- Address (truncated) -->
		{#if voiAddress}
			<p class="locked-address">
				Account: {voiAddress.slice(0, 8)}...{voiAddress.slice(-6)}
			</p>
		{/if}

		<!-- Actions -->
		<div class="locked-actions">
			<Button variant="primary" size="lg" onclick={handleUnlock}>
				Unlock Account
			</Button>
			<button class="back-link" onclick={handleBackToGames}>
				Back to Games
			</button>
		</div>
	</div>
</div>

<style>
	.locked-overlay {
		@apply fixed inset-0 z-50 flex items-center justify-center;
		@apply bg-black/80 backdrop-blur-sm;
	}

	.locked-content {
		@apply flex flex-col items-center text-center;
		@apply max-w-md w-full mx-4 p-8;
		@apply bg-neutral-900 rounded-2xl border-2 border-warning-500/50;
		@apply shadow-xl shadow-warning-500/10;
	}

	.lock-icon {
		@apply text-warning-400 mb-6;
		@apply animate-pulse;
	}

	.locked-title {
		@apply text-2xl font-bold text-white mb-4;
	}

	.locked-message {
		@apply text-neutral-300 mb-4;
	}

	.locked-address {
		@apply text-xs text-neutral-500 font-mono mb-6;
	}

	.locked-actions {
		@apply flex flex-col items-center gap-3 w-full;
	}

	.back-link {
		@apply text-sm text-neutral-400 hover:text-neutral-200;
		@apply underline transition-colors;
	}
</style>
