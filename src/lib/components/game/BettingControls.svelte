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

	// Quick bet amounts (in microVOI) - Only show first 4 options
	const quickBets = BETTING_CONSTANTS.QUICK_BET_AMOUNTS.slice(0, 4).map((voi) => voi * 1_000_000);

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
	<!-- Grid: Bet & Paylines | Total Bet + Spin Buttons -->
	<div class="controls-grid">
		<!-- Left Column: Bet Amount + Paylines -->
		<div class="control-section">
			<!-- Bet Per Line -->
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

			<!-- Paylines -->
			<label class="control-label" style="margin-top: 1rem;">Paylines</label>
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

		<!-- Right Column: Total Bet + Spin Buttons -->
		<div class="control-section">
			<label class="control-label">Total Bet</label>
			<div class="total-bet">
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
	</div>
</div>

<style>
	.betting-controls {
		padding: 2rem;
		background: rgba(20, 20, 35, 0.8);
		border-radius: 1rem;
		border: 1px solid rgba(59, 130, 246, 0.25);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	}

	/* Grid Layout - 2 columns: Bet & Paylines | Total & Spin */
	.controls-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
		align-items: start;
	}

	/* Control Sections */
	.control-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.control-label {
		font-size: 0.75rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.6);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		text-align: center;
	}

	/* Bet Section - Left */
	.bet-amount-display {
		padding: 1rem;
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.05));
		border: 2px solid rgba(59, 130, 246, 0.4);
		border-radius: 0.75rem;
		text-align: center;
		box-shadow: 0 4px 16px rgba(59, 130, 246, 0.2);
		min-height: 70px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.amount-value {
		font-size: 1.5rem;
		font-weight: 800;
		color: #60a5fa;
		text-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
	}

	.quick-bets {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	.quick-bet-btn {
		padding: 0.5rem 0.625rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 0.375rem;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		white-space: nowrap;
	}

	.quick-bet-btn:hover:not(:disabled) {
		background: rgba(59, 130, 246, 0.2);
		border-color: rgba(59, 130, 246, 0.5);
		color: #60a5fa;
		transform: translateY(-1px);
	}

	.quick-bet-btn.active {
		background: rgba(59, 130, 246, 0.35);
		border-color: #60a5fa;
		color: #60a5fa;
		box-shadow: 0 0 12px rgba(59, 130, 246, 0.4);
	}

	.quick-bet-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Paylines Control - Now in Left Column */
	.paylines-control {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
	}

	.payline-btn {
		width: 3rem;
		height: 3rem;
		background: rgba(59, 130, 246, 0.15);
		border: 2px solid rgba(59, 130, 246, 0.4);
		border-radius: 0.5rem;
		color: #60a5fa;
		font-size: 1.5rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.payline-btn:hover:not(:disabled) {
		background: rgba(59, 130, 246, 0.3);
		border-color: #60a5fa;
		transform: scale(1.05);
		box-shadow: 0 0 16px rgba(59, 130, 246, 0.4);
	}

	.payline-btn:disabled {
		opacity: 0.25;
		cursor: not-allowed;
	}

	.paylines-display {
		padding: 0.75rem 1.25rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 0.5rem;
		text-align: center;
		flex: 1;
		min-height: 70px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.paylines-value {
		font-size: 1.75rem;
		font-weight: 800;
		color: #ffffff;
		line-height: 1;
		display: block;
	}

	.paylines-max {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		font-weight: 600;
		margin-top: 0.25rem;
		display: block;
	}

	/* Total Bet Section - Right */
	.total-bet {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		padding: 1rem;
		background: linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(168, 85, 247, 0.05));
		border: 2px solid rgba(168, 85, 247, 0.4);
		border-radius: 0.75rem;
		box-shadow: 0 4px 16px rgba(168, 85, 247, 0.2);
		min-height: 70px;
	}

	.total-label {
		font-size: 0.75rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.6);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.total-value {
		font-size: 1.5rem;
		font-weight: 800;
		color: #c084fc;
		text-shadow: 0 0 20px rgba(168, 85, 247, 0.5);
		white-space: nowrap;
	}

	/* Spin Buttons - In Right Column */
	.spin-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
	}

	:global(.spin-btn) {
		width: 100%;
		font-size: 1.125rem;
		font-weight: 800;
		padding: 1rem 2rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	:global(.auto-spin-btn) {
		width: 100%;
	}

	.auto-spin-container {
		position: relative;
		width: 100%;
	}

	.auto-spin-dropdown {
		position: absolute;
		bottom: calc(100% + 0.5rem);
		left: 0;
		right: 0;
		background: rgba(20, 20, 35, 0.98);
		border: 1px solid rgba(59, 130, 246, 0.4);
		border-radius: 0.75rem;
		overflow: hidden;
		z-index: 50;
		box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.5);
	}

	.auto-spin-option {
		width: 100%;
		padding: 1rem;
		background: transparent;
		border: none;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.9);
		font-size: 0.875rem;
		font-weight: 600;
		text-align: center;
		cursor: pointer;
		transition: all 0.2s;
	}

	.auto-spin-option:last-child {
		border-bottom: none;
	}

	.auto-spin-option:hover {
		background: rgba(59, 130, 246, 0.25);
		color: #60a5fa;
	}

	/* Responsive Design */
	@media (max-width: 1024px) {
		.betting-controls {
			padding: 1.5rem;
		}

		.controls-grid {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}
	}

	@media (max-width: 640px) {
		.betting-controls {
			padding: 1rem;
		}

		.quick-bet-btn {
			font-size: 0.7rem;
			padding: 0.5rem;
		}

		.payline-btn {
			width: 2.5rem;
			height: 2.5rem;
			font-size: 1.25rem;
		}
	}
</style>
