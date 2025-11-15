<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';

	interface QueuedSpin {
		clientSpinId: string;
		engineSpinId?: string;
		betAmount: number;
		mode: number;
		timestamp: number;
		completedAt?: number;
		status: 'pending' | 'submitted' | 'completed' | 'failed';
		fadingOut?: boolean; // Flag to trigger fade-out animation
		outcome?: {
			totalPayout: number;
			waysWins?: any[];
			grid?: string[][];
			bonusSpinsAwarded?: number;
			jackpotHit?: boolean;
			jackpotAmount?: number;
			winLevel?: 'none' | 'small' | 'medium' | 'large' | 'jackpot';
		};
		error?: string;
	}

	interface Props {
		spinQueue: QueuedSpin[];
		onSpinClick?: (spin: QueuedSpin) => void;
	}

	let { spinQueue, onSpinClick }: Props = $props();

	// Separate active and completed spins
	let activeSpins = $derived(
		spinQueue.filter((s) => s.status === 'pending' || s.status === 'submitted')
	);
	let completedSpins = $derived(
		spinQueue.filter((s) => s.status === 'completed' || s.status === 'failed')
	);
	let pendingCount = $derived(activeSpins.length);

	/**
	 * Format elapsed time since spin was queued
	 */
	function formatElapsedTime(timestamp: number): string {
		const now = Date.now();
		const diffMs = now - timestamp;
		const diffSecs = Math.floor(diffMs / 1000);

		if (diffSecs < 1) return 'Just now';
		if (diffSecs < 60) return `${diffSecs}s ago`;

		const diffMins = Math.floor(diffSecs / 60);
		if (diffMins < 60) return `${diffMins}m ago`;

		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;

		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}d ago`;
	}

	/**
	 * Get mode label
	 */
	function getModeLabel(mode: number): string {
		switch (mode) {
			case 0:
				return 'Bonus';
			case 1:
				return 'Credits';
			case 2:
				return 'VOI';
			case 4:
				return 'ARC200';
			default:
				return 'Unknown';
		}
	}

	/**
	 * Handle spin click
	 */
	function handleSpinClick(spin: QueuedSpin): void {
		if (spin.status === 'completed' && onSpinClick) {
			onSpinClick(spin);
		}
	}

	/**
	 * Format number with commas
	 */
	function formatNumber(num: number): string {
		return num.toLocaleString();
	}
</script>

<Card>
	<CardHeader>
		<h3 class="text-lg font-bold text-warning-500 dark:text-warning-400 uppercase">
			Spin Queue {#if pendingCount > 0}<span class="text-sm">({pendingCount} pending)</span
				>{/if}
		</h3>
	</CardHeader>
	<CardContent>
		<div class="queue-container">
			{#if spinQueue.length === 0}
				<div class="text-center py-8 text-neutral-500 dark:text-neutral-400 text-sm">
					No spins yet. Place a bet to get started!
				</div>
			{:else}
				<!-- Active Spins (Pending/Submitted) -->
				{#if activeSpins.length > 0}
					<div class="space-y-2 mb-3">
						{#each activeSpins as spin (spin.clientSpinId)}
							<div class="queue-item active">
								<div class="flex items-start justify-between gap-3">
									<div class="flex-1">
										<!-- Status Badge -->
										{#if spin.status === 'pending'}
											<span class="status-badge pending">Pending</span>
										{:else if spin.status === 'submitted'}
											<span class="status-badge processing">Processing</span>
										{/if}

										<!-- Spin Info -->
										<div class="mt-2 text-sm">
											<div class="font-semibold text-neutral-900 dark:text-white">
												{spin.mode === 0 ? 'Bonus Spin' : `${spin.betAmount} ${getModeLabel(spin.mode)}`}
											</div>
											<div class="text-xs text-neutral-500 dark:text-neutral-400">
												{formatElapsedTime(spin.timestamp)}
											</div>
										</div>
									</div>

									<!-- Spinner for active spins -->
									<div class="spinner"></div>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Completed/Failed Spins -->
				{#if completedSpins.length > 0}
					<div class="space-y-2">
						{#each completedSpins as spin (spin.clientSpinId)}
							<button
								type="button"
								class="queue-item completed {spin.status === 'completed'
									? 'clickable'
									: ''} {spin.fadingOut ? 'fading-out' : ''}"
								onclick={() => handleSpinClick(spin)}
								disabled={spin.status !== 'completed'}
							>
								<div class="flex items-start justify-between gap-3 w-full">
									<div class="flex-1 text-left">
										<!-- Status Badge -->
										{#if spin.status === 'completed'}
											<span class="status-badge success">Completed</span>
										{:else if spin.status === 'failed'}
											<span class="status-badge error">Failed</span>
										{/if}

										<!-- Spin Info -->
										<div class="mt-2 text-sm">
											<div class="font-semibold text-neutral-900 dark:text-white">
												{spin.mode === 0 ? 'Bonus Spin' : `${spin.betAmount} ${getModeLabel(spin.mode)}`}
											</div>
											<div class="text-xs text-neutral-500 dark:text-neutral-400">
												{formatElapsedTime(spin.timestamp)}
											</div>
										</div>
									</div>

									<!-- Result -->
									<div class="text-right">
										{#if spin.status === 'completed' && spin.outcome}
											{#if spin.outcome.totalPayout > 0}
												<div class="text-success-600 dark:text-success-400 font-bold text-sm">
													+{formatNumber(spin.outcome.totalPayout)}
												</div>
												{#if spin.outcome.waysWins && spin.outcome.waysWins.length > 0}
													<div class="text-xs text-neutral-500 dark:text-neutral-400">
														{spin.outcome.waysWins.length} win{spin.outcome.waysWins
															.length !== 1
															? 's'
															: ''}
													</div>
												{/if}
											{:else}
												<div class="text-neutral-500 dark:text-neutral-400 text-sm">No win</div>
											{/if}
										{:else if spin.status === 'failed'}
											<div class="text-error-600 dark:text-error-400 text-xs">
												{spin.error || 'Error'}
											</div>
										{/if}
									</div>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</CardContent>
</Card>

<style>
	.queue-container {
		@apply max-h-96 overflow-y-auto;
		scrollbar-width: thin;
		scrollbar-color: rgb(163, 163, 163) transparent;
	}

	.queue-container::-webkit-scrollbar {
		@apply w-1;
	}

	.queue-container::-webkit-scrollbar-track {
		@apply bg-transparent;
	}

	.queue-container::-webkit-scrollbar-thumb {
		@apply bg-neutral-400 dark:bg-neutral-600 rounded-full;
	}

	.queue-item {
		@apply p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg;
		@apply bg-white dark:bg-neutral-800;
		opacity: 1;
		transition: opacity 1s ease-out, background-color 200ms, border-color 200ms, transform 200ms;
	}

	.queue-item.active {
		@apply border-primary-300 dark:border-primary-700;
		@apply bg-primary-50/50 dark:bg-primary-900/10;
	}

	.queue-item.completed {
		@apply w-full text-left;
	}

	.queue-item.completed.clickable {
		@apply cursor-pointer;
		@apply hover:bg-neutral-50 dark:hover:bg-neutral-700/50;
		@apply hover:border-primary-400 dark:hover:border-primary-600;
	}

	.queue-item.completed.clickable:active {
		@apply scale-[0.98];
	}

	.queue-item.fading-out {
		opacity: 0;
	}

	.status-badge {
		@apply inline-block px-2 py-0.5 text-xs font-medium rounded-full border;
	}

	.status-badge.pending {
		@apply bg-warning-100 dark:bg-warning-900/30;
		@apply text-warning-700 dark:text-warning-300;
		@apply border-warning-300 dark:border-warning-700;
	}

	.status-badge.processing {
		@apply bg-primary-100 dark:bg-primary-900/30;
		@apply text-primary-700 dark:text-primary-300;
		@apply border-primary-300 dark:border-primary-700;
	}

	.status-badge.success {
		@apply bg-success-100 dark:bg-success-900/30;
		@apply text-success-700 dark:text-success-300;
		@apply border-success-300 dark:border-success-700;
	}

	.status-badge.error {
		@apply bg-error-100 dark:bg-error-900/30;
		@apply text-error-700 dark:text-error-300;
		@apply border-error-300 dark:border-error-700;
	}

	.spinner {
		@apply w-5 h-5 border-2 border-primary-200 dark:border-primary-800;
		@apply border-t-primary-500 dark:border-t-primary-400;
		@apply rounded-full;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
