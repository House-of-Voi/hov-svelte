<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		/** Current bet amount (40 or 60) */
		betAmount: number;
		/** Current mode (0=bonus, 1=credit/free-play, 2=VOI, 4=ARC200) */
		mode: number;
		/** Label to use when displaying ARC200 tokens */
		tokenLabel?: string;
		/** Whether spin button is disabled */
		disabled?: boolean;
		/** Whether currently spinning */
		isSpinning?: boolean;
		/** Callback when bet amount changes */
		onBetChange: (betAmount: number) => void;
		/** Callback when progressive mode changes */
		onProgressiveChange?: (enabled: boolean) => void;
		/** Callback when spin button is clicked */
		onSpin: () => void;
	}

	let {
		betAmount = 40,
		mode = 1,
		tokenLabel = 'ARC200',
		disabled = false,
		isSpinning = false,
		onBetChange,
		onProgressiveChange,
		onSpin
	}: Props = $props();

	// For queueing system, button should always be enabled
	// The disabled prop is kept for API compatibility but not used for queueing
	const buttonDisabled = $derived(false);

	const BASE_BET = 40;
	const KICKER_AMOUNT = 20;
	const progressiveEnabled = $derived(betAmount === BASE_BET + KICKER_AMOUNT);

	function handleProgressiveToggle(enabled: boolean) {
		const newBetAmount = enabled ? BASE_BET + KICKER_AMOUNT : BASE_BET;
		onBetChange(newBetAmount);
		if (onProgressiveChange) {
			onProgressiveChange(enabled);
		}
	}
</script>

<div class="betting-controls w2w">
	<div class="controls-grid">
		<!-- Bet Configuration -->
		<div class="control-section">
			<label class="control-label">Bet Configuration</label>
			<div class="bet-config">
				<div class="base-bet-display">
					<span class="base-bet-label">Base Bet:</span>
					<span class="base-bet-amount">{BASE_BET}</span>
					{#if mode === 1}
						<span class="bet-unit">credits</span>
					{:else if mode === 2}
						<span class="bet-unit">VOI</span>
					{:else if mode === 4}
						<span class="bet-unit">{tokenLabel}</span>
					{/if}
				</div>
				{#if mode !== 0}
					<label class="progressive-toggle">
						<input
							type="checkbox"
							checked={progressiveEnabled}
							onchange={(e) => handleProgressiveToggle(e.currentTarget.checked)}
							disabled={disabled || isSpinning}
							class="progressive-checkbox"
						/>
						<span class="progressive-label">
							<span class="progressive-icon">🎰</span>
							<span class="progressive-text">
								<span class="progressive-title">Progressive Mode</span>
								<span class="progressive-description">Enable for jackpot & bonus rounds (+{KICKER_AMOUNT})</span>
							</span>
						</span>
					</label>
				{:else}
					<div class="progressive-disabled">
						<span class="progressive-disabled-text">Bonus spins use fixed bet amount</span>
					</div>
				{/if}
			</div>
		</div>

		<!-- Spin Button -->
		<div class="control-section spin-section">
			<button
				class="spin-button w2w"
				class:spinning={isSpinning}
				onclick={(e) => {
					console.log('🔴 Button clicked', { target: e.target, currentTarget: e.currentTarget, timeStamp: e.timeStamp });
					onSpin();
				}}
				disabled={buttonDisabled}
				type="button"
			>
				{#if isSpinning}
					<span class="spinning-text">Spinning...</span>
				{:else}
					<span class="spin-text">SPIN</span>
				{/if}
			</button>
			<div class="total-bet-display">
				Total Bet: <strong>{betAmount}</strong>
				{#if mode === 1}
					<span class="bet-unit">credits</span>
				{:else if mode === 2}
					<span class="bet-unit">VOI</span>
				{:else if mode === 4}
					<span class="bet-unit">{tokenLabel}</span>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.betting-controls.w2w {
		@apply p-6 rounded-lg border-2 border-neutral-200 dark:border-neutral-700;
		@apply bg-white dark:bg-neutral-800;
	}

	.controls-grid {
		@apply grid grid-cols-1 md:grid-cols-2 gap-6;
	}

	.control-section {
		@apply flex flex-col gap-3;
	}

	.control-label {
		@apply text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide;
	}

	.bet-config {
		@apply flex flex-col gap-4;
	}

	.base-bet-display {
		@apply flex items-center gap-2 px-4 py-3 bg-neutral-100 dark:bg-neutral-700 rounded-lg;
		@apply border-2 border-neutral-300 dark:border-neutral-600;
	}

	.base-bet-label {
		@apply text-sm text-neutral-600 dark:text-neutral-400;
	}

	.base-bet-amount {
		@apply text-xl font-bold text-neutral-800 dark:text-neutral-200;
	}

	.progressive-toggle {
		@apply flex items-center gap-3 px-4 py-3 bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 rounded-lg cursor-pointer transition-colors;
		@apply border-2 border-neutral-300 dark:border-neutral-600;
	}

	.progressive-toggle:has(.progressive-checkbox:checked) {
		@apply bg-primary-50 dark:bg-primary-900/20 border-primary-400 dark:border-primary-500;
	}

	.progressive-checkbox {
		@apply w-5 h-5 rounded border-2 border-neutral-400 dark:border-neutral-500;
		@apply text-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2;
		@apply cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed;
	}

	.progressive-label {
		@apply flex items-center gap-3 flex-1;
	}

	.progressive-icon {
		@apply text-2xl;
	}

	.progressive-text {
		@apply flex flex-col;
	}

	.progressive-title {
		@apply text-sm font-semibold text-neutral-800 dark:text-neutral-200;
	}

	.progressive-description {
		@apply text-xs text-neutral-600 dark:text-neutral-400;
	}

	.progressive-disabled {
		@apply px-4 py-3 bg-neutral-100 dark:bg-neutral-700 rounded-lg;
		@apply border-2 border-neutral-300 dark:border-neutral-600;
		@apply text-sm text-neutral-500 dark:text-neutral-400 italic;
	}

	.progressive-disabled-text {
		@apply block;
	}


	.spin-section {
		@apply justify-center items-center;
	}

	.spin-button.w2w {
		@apply w-full px-8 py-4 bg-primary-500 hover:bg-primary-600 text-white font-black text-xl rounded-lg;
		@apply uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed;
		@apply shadow-lg shadow-primary-500/50 hover:shadow-primary-500/70;
	}

	.spin-button.w2w.spinning {
		@apply animate-pulse;
	}

	.total-bet-display {
		@apply mt-2 text-center text-sm font-medium text-neutral-700 dark:text-neutral-300;
	}

	.total-bet-display strong {
		@apply text-primary-600 dark:text-primary-400 font-bold;
	}

	.bet-unit {
		@apply ml-1 text-xs text-neutral-600 dark:text-neutral-400;
	}
</style>
