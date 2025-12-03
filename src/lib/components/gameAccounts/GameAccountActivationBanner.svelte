<script lang="ts">
	/**
	 * GameAccountActivationBanner Component
	 *
	 * A gentle, non-blocking banner that prompts users to activate their gaming wallet.
	 * Shown on all /app pages when the user has no gaming wallets.
	 *
	 * Features:
	 * - Can be dismissed (stored in localStorage, reappears after 24 hours)
	 * - Clean, non-intrusive design
	 * - Clear call-to-action
	 */
	import { browser } from '$app/environment';
	import Button from '$lib/components/ui/Button.svelte';

	const DISMISS_KEY = 'hov_activation_dismissed_at';
	const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

	interface Props {
		/** User's email for display */
		email?: string;
		/** Callback when user clicks to activate */
		onActivate?: () => void;
		/** Callback when user dismisses the banner */
		onDismiss?: () => void;
	}

	let { email, onActivate, onDismiss }: Props = $props();

	// Check if banner was recently dismissed
	let isDismissed = $state(false);

	$effect(() => {
		if (browser) {
			const dismissedAt = localStorage.getItem(DISMISS_KEY);
			if (dismissedAt) {
				const dismissedTime = parseInt(dismissedAt, 10);
				if (Date.now() - dismissedTime < DISMISS_DURATION_MS) {
					isDismissed = true;
				} else {
					// Dismissal expired, remove it
					localStorage.removeItem(DISMISS_KEY);
				}
			}
		}
	});

	function handleDismiss() {
		if (browser) {
			localStorage.setItem(DISMISS_KEY, Date.now().toString());
		}
		isDismissed = true;
		onDismiss?.();
	}

	function handleActivate() {
		onActivate?.();
	}
</script>

{#if !isDismissed}
	<div
		class="relative overflow-hidden rounded-2xl border-2 border-warning-300 bg-gradient-to-br from-warning-50 to-warning-100 p-6 shadow-lg dark:border-warning-600/50 dark:from-warning-900/30 dark:to-warning-800/20"
	>
		<!-- Background decoration -->
		<div
			class="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-warning-200/50 blur-2xl dark:bg-warning-500/20"
		></div>
		<div
			class="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-warning-300/30 blur-xl dark:bg-warning-600/10"
		></div>

		<div class="relative flex flex-col items-center gap-4 sm:flex-row sm:items-start">
			<!-- Icon -->
			<div class="flex-shrink-0 text-5xl sm:text-4xl">🎮</div>

			<!-- Content -->
			<div class="flex-1 text-center sm:text-left">
				<h3 class="text-lg font-bold text-neutral-800 dark:text-neutral-100">
					Activate Your Gaming Wallet
				</h3>
				<p class="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
					Set up your gaming wallet to start playing. We'll send a quick verification code to
					{#if email}
						<span class="font-medium">{email}</span>
					{:else}
						your email
					{/if}
					to get you started.
				</p>

				<!-- Action buttons -->
				<div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
					<Button variant="primary" size="sm" onclick={handleActivate} class="sm:w-auto">
						Activate Now
					</Button>
					<button
						onclick={handleDismiss}
						class="text-sm text-neutral-500 underline hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
					>
						Maybe later
					</button>
				</div>
			</div>

			<!-- Close button (mobile-friendly) -->
			<button
				onclick={handleDismiss}
				class="absolute right-2 top-2 rounded-full p-1 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300 sm:right-4 sm:top-4"
				aria-label="Dismiss"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>
	</div>
{/if}
