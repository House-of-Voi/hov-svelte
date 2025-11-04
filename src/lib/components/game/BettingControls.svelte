<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { BETTING_CONSTANTS, formatVoi, calculateTotalBet } from '$lib/game-engine/utils/gameConstants';

	interface Props {
		/** Current bet per line in microVOI */
		betPerLine: number;
		/** Number of selected paylines (1-20) */
		paylines: number;
		/** Whether spin button is disabled */
		disabled?: boolean;
		/** Whether currently spinning */
		isSpinning?: boolean;
		/** Whether auto-spin is active */
		isAutoSpinning?: boolean;
		/** Remaining auto-spin count */
		autoSpinCount?: number;
		/** Callback when bet per line changes */
		onBetChange: (betPerLine: number) => void;
		/** Callback when paylines change */
		onPaylinesChange: (paylines: number) => void;
		/** Callback when spin button is clicked */
		onSpin: () => void;
		/** Callback when auto-spin is toggled */
		onAutoSpin?: (count: number) => void;
		/** Callback when stop auto-spin is clicked */
		onStopAutoSpin?: () => void;
	}

	let {
		betPerLine,
		paylines,
		disabled = false,
		isSpinning = false,
		isAutoSpinning = false,
		autoSpinCount = 0,
		onBetChange,
		onPaylinesChange,
		onSpin,
		onAutoSpin,
		onStopAutoSpin
	}: Props = $props();

	// Quick bet amounts (in microVOI)
	const quickBets = BETTING_CONSTANTS.QUICK_BET_AMOUNTS.map((voi) => voi * 1_000_000);

	// Auto-spin options
	const autoSpinOptions = [10, 25, 50, 100];
	let selectedAutoSpinCount = $state(10);
	let showAutoSpinOptions = $state(false);

	// Computed total bet
	let totalBet = $derived(calculateTotalBet(betPerLine, paylines));

	function handleQuickBet(amount: number) {
		onBetChange(amount);
	}

	function handlePaylinesChange(delta: number) {
		const newPaylines = Math.max(
			BETTING_CONSTANTS.MIN_PAYLINES,
			Math.min(BETTING_CONSTANTS.MAX_PAYLINES, paylines + delta)
		);
		onPaylinesChange(newPaylines);
	}

	function handleAutoSpinStart() {
		onAutoSpin?.(selectedAutoSpinCount);
		showAutoSpinOptions = false;
	}
</script>

<div class="betting-controls">
	<!-- Bet Amount Section -->
	<div class="control-section">
		<label class="control-label">Bet Per Line</label>
		<div class="bet-amount-display">
			<span class="amount-value">{formatVoi(betPerLine)}</span>
		</div>
		<div class="quick-bets">
			{#each quickBets as amount}
				<button
					class="quick-bet-btn"
					class:active={betPerLine === amount}
					onclick={() => handleQuickBet(amount)}
					disabled={disabled || isSpinning}
				>
					{formatVoi(amount, false)}
				</button>
			{/each}
		</div>
	</div>

	<!-- Paylines Section -->
	<div class="control-section">
		<label class="control-label">Paylines</label>
		<div class="paylines-control">
			<button
				class="payline-btn"
				onclick={() => handlePaylinesChange(-1)}
				disabled={disabled || isSpinning || paylines <= BETTING_CONSTANTS.MIN_PAYLINES}
			>
				−
			</button>
			<div class="paylines-display">
				<span class="paylines-value">{paylines}</span>
				<span class="paylines-max">/ 20</span>
			</div>
			<button
				class="payline-btn"
				onclick={() => handlePaylinesChange(1)}
				disabled={disabled || isSpinning || paylines >= BETTING_CONSTANTS.MAX_PAYLINES}
			>
				+
			</button>
		</div>
	</div>

	<!-- Total Bet Display -->
	<div class="total-bet">
		<span class="total-label">Total Bet:</span>
		<span class="total-value">{formatVoi(totalBet)}</span>
	</div>

	<!-- Spin Buttons -->
	<div class="spin-buttons">
		<Button
			variant="primary"
			size="lg"
			onclick={onSpin}
			disabled={disabled || isSpinning || isAutoSpinning}
			class="spin-btn"
		>
			{#if isSpinning}
				Spinning...
			{:else}
				Spin
			{/if}
		</Button>

		{#if isAutoSpinning}
			<Button
				variant="secondary"
				size="lg"
				onclick={onStopAutoSpin}
				class="auto-spin-btn"
			>
				Stop ({autoSpinCount > 0 ? autoSpinCount : '∞'})
			</Button>
		{:else if onAutoSpin}
			<div class="auto-spin-container">
				<Button
					variant="outline"
					size="lg"
					onclick={() => (showAutoSpinOptions = !showAutoSpinOptions)}
					disabled={disabled || isSpinning}
					class="auto-spin-btn"
				>
					Auto Spin
				</Button>

				{#if showAutoSpinOptions}
					<div class="auto-spin-dropdown">
						{#each autoSpinOptions as count}
							<button
								class="auto-spin-option"
								onclick={() => {
									selectedAutoSpinCount = count;
									handleAutoSpinStart();
								}}
							>
								{count} Spins
							</button>
						{/each}
						<button
							class="auto-spin-option"
							onclick={() => {
								selectedAutoSpinCount = -1;
								handleAutoSpinStart();
							}}
						>
							∞ Unlimited
						</button>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.betting-controls {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1.5rem;
		background: rgba(20, 20, 35, 0.8);
		border-radius: 1rem;
		border: 1px solid rgba(59, 130, 246, 0.2);
	}

	.control-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.control-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.bet-amount-display {
		padding: 1rem;
		background: rgba(59, 130, 246, 0.1);
		border: 1px solid rgba(59, 130, 246, 0.3);
		border-radius: 0.5rem;
		text-align: center;
	}

	.amount-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #3b82f6;
	}

	.quick-bets {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
		gap: 0.5rem;
	}

	.quick-bet-btn {
		padding: 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.375rem;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.quick-bet-btn:hover:not(:disabled) {
		background: rgba(59, 130, 246, 0.2);
		border-color: rgba(59, 130, 246, 0.4);
		color: #3b82f6;
	}

	.quick-bet-btn.active {
		background: rgba(59, 130, 246, 0.3);
		border-color: #3b82f6;
		color: #3b82f6;
	}

	.quick-bet-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.paylines-control {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.payline-btn {
		width: 3rem;
		height: 3rem;
		background: rgba(59, 130, 246, 0.2);
		border: 1px solid rgba(59, 130, 246, 0.4);
		border-radius: 0.5rem;
		color: #3b82f6;
		font-size: 1.5rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.payline-btn:hover:not(:disabled) {
		background: rgba(59, 130, 246, 0.3);
		transform: scale(1.05);
	}

	.payline-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.paylines-display {
		flex: 1;
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 0.5rem;
	}

	.paylines-value {
		font-size: 2rem;
		font-weight: 700;
		color: #ffffff;
	}

	.paylines-max {
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.total-bet {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(167, 139, 250, 0.1));
		border: 1px solid rgba(59, 130, 246, 0.3);
		border-radius: 0.5rem;
	}

	.total-label {
		font-size: 1rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
	}

	.total-value {
		font-size: 1.25rem;
		font-weight: 700;
		color: #a78bfa;
	}

	.spin-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	:global(.spin-btn) {
		width: 100%;
		font-size: 1.125rem;
		font-weight: 700;
		padding: 1rem;
	}

	:global(.auto-spin-btn) {
		width: 100%;
	}

	.auto-spin-container {
		position: relative;
	}

	.auto-spin-dropdown {
		position: absolute;
		bottom: 100%;
		left: 0;
		right: 0;
		margin-bottom: 0.5rem;
		background: rgba(20, 20, 35, 0.95);
		border: 1px solid rgba(59, 130, 246, 0.3);
		border-radius: 0.5rem;
		overflow: hidden;
		z-index: 10;
	}

	.auto-spin-option {
		width: 100%;
		padding: 0.75rem;
		background: transparent;
		border: none;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.9);
		font-size: 0.875rem;
		text-align: left;
		cursor: pointer;
		transition: all 0.2s;
	}

	.auto-spin-option:last-child {
		border-bottom: none;
	}

	.auto-spin-option:hover {
		background: rgba(59, 130, 246, 0.2);
		color: #3b82f6;
	}
</style>
