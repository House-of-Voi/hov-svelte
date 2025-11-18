<script lang="ts">
	import type { WinStep } from '$lib/game-engine/utils/w2wWinHighlighter';
	import { getSymbolDisplay } from '$lib/game-engine/utils/gameConstants';
	import { getSymbolName, formatPayoutAmount, getCumulativePayout } from '$lib/game-engine/utils/w2wWinHighlighter';

	interface Props {
		/** Current win step being displayed */
		currentStep: WinStep | null;
		/** Current step index in sequence */
		currentStepIndex: number;
		/** Full win sequence for cumulative total */
		winSequence: WinStep[];
		/** Game mode (for formatting) */
		mode?: number;
		/** Whether to show the breakdown */
		visible?: boolean;
	}

	let {
		currentStep,
		currentStepIndex,
		winSequence,
		mode = 1,
		visible = true
	}: Props = $props();

	// Animated counter for current payout
	let displayedPayout = $state(0);
	let displayedCumulative = $state(0);

	// Animate payout counter when step changes
	$effect(() => {
		if (!currentStep || !visible) {
			displayedPayout = 0;
			displayedCumulative = 0;
			return;
		}

		const targetPayout = currentStep.payout;
		const targetCumulative = getCumulativePayout(winSequence, currentStepIndex);
		const duration = 300; // Animation duration in ms
		const steps = 30; // Number of animation steps
		const increment = targetPayout / steps;
		const cumulativeIncrement = (targetCumulative - (targetCumulative - targetPayout)) / steps;

		let currentCount = 0;
		const interval = setInterval(() => {
			currentCount++;
			displayedPayout = Math.min(Math.floor(increment * currentCount), targetPayout);
			displayedCumulative = Math.min(
				Math.floor((targetCumulative - targetPayout) + cumulativeIncrement * currentCount),
				targetCumulative
			);

			if (currentCount >= steps) {
				displayedPayout = targetPayout;
				displayedCumulative = targetCumulative;
				clearInterval(interval);
			}
		}, duration / steps);

		return () => clearInterval(interval);
	});
</script>

{#if visible && currentStep}
	<!-- Background overlay with radial gradient -->
	<div class="payout-overlay">
		<div class="payout-backdrop"></div>

		<div class="payout-celebration" class:jackpot={currentStep.type === 'jackpot'} class:bonus={currentStep.type === 'bonus'}>
			{#if currentStep.type === 'symbol' && currentStep.breakdown && currentStep.waysWin}
				{@const { symbol, basePayout: rawBasePayout, ways: rawWays, wildMultiplier: rawWildMultiplier } = currentStep.breakdown}
				{@const display = getSymbolDisplay(symbol, 'w2w')}
				
				{@const basePayout = (Number.isFinite(rawBasePayout) && rawBasePayout >= 0) ? rawBasePayout : 0}
				{@const ways = (Number.isFinite(rawWays) && rawWays > 0) ? rawWays : 1}
				{@const wildMultiplier = (Number.isFinite(rawWildMultiplier) && rawWildMultiplier > 0) ? rawWildMultiplier : 1}

				<!-- Large symbol icon -->
				<div class="hero-symbol" style="color: {display.color}; text-shadow: 0 0 40px {display.glowColor}">
					{display.emoji}
				</div>

				<!-- Win announcement -->
				<div class="win-announcement">
					<div class="symbol-title">{getSymbolName(symbol)}</div>
					<div class="match-badge">{currentStep.waysWin.matchLength} in a row!</div>
				</div>

				<!-- Calculation breakdown with flashy style -->
				<div class="breakdown-formula">
					<div class="formula-part">
						<div class="formula-label">Base</div>
						<div class="formula-value">{basePayout.toLocaleString()}</div>
					</div>
					<div class="formula-operator">×</div>
					<div class="formula-part">
						<div class="formula-label">Ways</div>
						<div class="formula-value">{ways.toLocaleString()}</div>
					</div>
					<div class="formula-operator">×</div>
					<div class="formula-part">
						<div class="formula-label">Multiplier</div>
						<div class="formula-value multiplier" class:wild2={wildMultiplier === 2} class:wild3={wildMultiplier === 3}>
							{wildMultiplier}x
						</div>
					</div>
				</div>

				<!-- Big payout display -->
				<div class="win-amount">
					<div class="amount-label">WIN</div>
					<div class="amount-value">
						{displayedPayout.toLocaleString()}
					</div>
				</div>

			{:else if currentStep.type === 'jackpot'}
				<div class="special-celebration jackpot-celebration">
					<div class="special-burst">
						<div class="burst-icon">💎</div>
						<div class="burst-icon">🎰</div>
						<div class="burst-icon">💎</div>
					</div>
					<div class="special-title">JACKPOT!</div>
					<div class="special-subtitle">{currentStep.message}</div>
					<div class="special-payout">
						{formatPayoutAmount(displayedPayout, mode)}
					</div>
				</div>

			{:else if currentStep.type === 'bonus'}
				<div class="special-celebration bonus-celebration">
					<div class="special-burst">
						<div class="burst-icon">🎁</div>
						<div class="burst-icon">✨</div>
						<div class="burst-icon">🎁</div>
					</div>
					<div class="special-title">BONUS!</div>
					<div class="special-subtitle">{currentStep.message}</div>
				</div>
			{/if}

			<!-- Running total at bottom -->
			<div class="running-total">
				<div class="total-bar">
					<span class="total-label">TOTAL WIN</span>
					<span class="total-value">
						{formatPayoutAmount(displayedCumulative, mode)}
					</span>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Full screen overlay */
	.payout-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		pointer-events: none;
		animation: fadeIn 0.3s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.payout-backdrop {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			circle at center,
			rgba(0, 0, 0, 0.4) 0%,
			rgba(0, 0, 0, 0.7) 100%
		);
		backdrop-filter: blur(4px);
	}

	/* Main celebration container */
	.payout-celebration {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		padding: 3rem 2rem 2rem;
		max-width: 600px;
		animation: scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes scaleIn {
		from {
			transform: scale(0.8);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	/* Hero symbol - massive and glowing */
	.hero-symbol {
		font-size: 8rem;
		line-height: 1;
		animation: symbolPulse 1s ease-in-out infinite;
		filter: drop-shadow(0 0 60px currentColor);
	}

	@keyframes symbolPulse {
		0%, 100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.15);
		}
	}

	/* Win announcement */
	.win-announcement {
		text-align: center;
		margin-top: -1rem;
	}

	.symbol-title {
		font-size: 2.5rem;
		font-weight: 900;
		color: #fbbf24;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		text-shadow:
			0 0 20px rgba(251, 191, 36, 0.8),
			0 4px 8px rgba(0, 0, 0, 0.5);
		margin-bottom: 0.5rem;
	}

	.match-badge {
		display: inline-block;
		font-size: 1.25rem;
		font-weight: 700;
		color: #fff;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		padding: 0.5rem 1.5rem;
		border-radius: 2rem;
		box-shadow:
			0 4px 12px rgba(251, 191, 36, 0.4),
			inset 0 1px 0 rgba(255, 255, 255, 0.3);
	}

	/* Formula breakdown */
	.breakdown-formula {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem 2rem;
		background: rgba(0, 0, 0, 0.4);
		border-radius: 1rem;
		border: 2px solid rgba(251, 191, 36, 0.3);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	}

	.formula-part {
		text-align: center;
	}

	.formula-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.6);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.25rem;
	}

	.formula-value {
		font-size: 1.75rem;
		font-weight: 700;
		color: #fff;
		font-variant-numeric: tabular-nums;
	}

	.formula-value.multiplier {
		color: #fbbf24;
		text-shadow: 0 0 10px rgba(251, 191, 36, 0.6);
	}

	.formula-value.multiplier.wild2 {
		color: #fb923c;
		text-shadow: 0 0 10px rgba(251, 146, 60, 0.6);
	}

	.formula-value.multiplier.wild3 {
		color: #ef4444;
		text-shadow: 0 0 10px rgba(239, 68, 68, 0.6);
		animation: wildPulse 0.5s ease-in-out infinite;
	}

	@keyframes wildPulse {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.1); }
	}

	.formula-operator {
		font-size: 2rem;
		font-weight: 700;
		color: #fbbf24;
		opacity: 0.8;
	}

	/* Big win amount */
	.win-amount {
		text-align: center;
		margin-top: 0.5rem;
	}

	.amount-label {
		font-size: 1.5rem;
		font-weight: 900;
		color: rgba(255, 255, 255, 0.6);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		margin-bottom: 0.5rem;
	}

	.amount-value {
		font-size: 4rem;
		font-weight: 900;
		color: #fbbf24;
		text-shadow:
			0 0 30px rgba(251, 191, 36, 0.8),
			0 0 60px rgba(251, 191, 36, 0.4),
			0 4px 12px rgba(0, 0, 0, 0.5);
		font-variant-numeric: tabular-nums;
		animation: amountGlow 1.5s ease-in-out infinite;
	}

	@keyframes amountGlow {
		0%, 100% {
			text-shadow:
				0 0 30px rgba(251, 191, 36, 0.8),
				0 0 60px rgba(251, 191, 36, 0.4),
				0 4px 12px rgba(0, 0, 0, 0.5);
		}
		50% {
			text-shadow:
				0 0 40px rgba(251, 191, 36, 1),
				0 0 80px rgba(251, 191, 36, 0.6),
				0 4px 12px rgba(0, 0, 0, 0.5);
		}
	}

	/* Special celebrations (Jackpot/Bonus) */
	.special-celebration {
		text-align: center;
		padding: 2rem;
	}

	.special-burst {
		display: flex;
		gap: 2rem;
		justify-content: center;
		margin-bottom: 2rem;
	}

	.burst-icon {
		font-size: 5rem;
		animation: burstSpin 2s linear infinite;
	}

	.burst-icon:nth-child(2) {
		animation-delay: 0.3s;
		font-size: 6rem;
	}

	.burst-icon:nth-child(3) {
		animation-delay: 0.6s;
	}

	@keyframes burstSpin {
		0% {
			transform: rotate(0deg) scale(1);
		}
		25% {
			transform: rotate(10deg) scale(1.1);
		}
		50% {
			transform: rotate(0deg) scale(1);
		}
		75% {
			transform: rotate(-10deg) scale(1.1);
		}
		100% {
			transform: rotate(0deg) scale(1);
		}
	}

	.special-title {
		font-size: 5rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin-bottom: 1rem;
		animation: textShake 0.5s ease-in-out infinite;
	}

	.jackpot-celebration .special-title {
		color: #ffd700;
		text-shadow:
			0 0 40px rgba(255, 215, 0, 1),
			0 0 80px rgba(255, 215, 0, 0.6),
			0 8px 16px rgba(0, 0, 0, 0.5);
	}

	.bonus-celebration .special-title {
		color: #a855f7;
		text-shadow:
			0 0 40px rgba(168, 85, 247, 1),
			0 0 80px rgba(168, 85, 247, 0.6),
			0 8px 16px rgba(0, 0, 0, 0.5);
	}

	@keyframes textShake {
		0%, 100% { transform: translateX(0); }
		25% { transform: translateX(-2px); }
		75% { transform: translateX(2px); }
	}

	.special-subtitle {
		font-size: 1.5rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.9);
		margin-bottom: 1.5rem;
	}

	.special-payout {
		font-size: 3rem;
		font-weight: 900;
		color: #ffd700;
		text-shadow:
			0 0 30px rgba(255, 215, 0, 0.8),
			0 4px 12px rgba(0, 0, 0, 0.5);
		font-variant-numeric: tabular-nums;
	}

	/* Running total bar at bottom */
	.running-total {
		position: fixed;
		bottom: 2rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 101;
	}

	.total-bar {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 1rem 2.5rem;
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.95), rgba(245, 158, 11, 0.95));
		border-radius: 3rem;
		border: 3px solid rgba(255, 215, 0, 0.8);
		box-shadow:
			0 8px 32px rgba(0, 0, 0, 0.4),
			0 0 40px rgba(251, 191, 36, 0.6),
			inset 0 2px 0 rgba(255, 255, 255, 0.3);
		animation: totalPulse 2s ease-in-out infinite;
	}

	@keyframes totalPulse {
		0%, 100% {
			transform: scale(1);
			box-shadow:
				0 8px 32px rgba(0, 0, 0, 0.4),
				0 0 40px rgba(251, 191, 36, 0.6),
				inset 0 2px 0 rgba(255, 255, 255, 0.3);
		}
		50% {
			transform: scale(1.05);
			box-shadow:
				0 12px 48px rgba(0, 0, 0, 0.5),
				0 0 60px rgba(251, 191, 36, 0.8),
				inset 0 2px 0 rgba(255, 255, 255, 0.3);
		}
	}

	.total-label {
		font-size: 1.125rem;
		font-weight: 900;
		color: rgba(0, 0, 0, 0.8);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.total-value {
		font-size: 2rem;
		font-weight: 900;
		color: #000;
		font-variant-numeric: tabular-nums;
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.payout-celebration {
			padding: 2rem 1rem;
		}

		.hero-symbol {
			font-size: 5rem;
		}

		.symbol-title {
			font-size: 1.75rem;
		}

		.match-badge {
			font-size: 1rem;
			padding: 0.375rem 1rem;
		}

		.breakdown-formula {
			flex-wrap: wrap;
			gap: 0.5rem;
			padding: 1rem;
		}

		.formula-value {
			font-size: 1.25rem;
		}

		.formula-operator {
			font-size: 1.5rem;
		}

		.amount-value {
			font-size: 2.5rem;
		}

		.special-title {
			font-size: 3rem;
		}

		.burst-icon {
			font-size: 3rem;
		}

		.burst-icon:nth-child(2) {
			font-size: 4rem;
		}

		.running-total {
			bottom: 1rem;
		}

		.total-bar {
			gap: 1rem;
			padding: 0.75rem 1.5rem;
		}

		.total-label {
			font-size: 0.875rem;
		}

		.total-value {
			font-size: 1.5rem;
		}
	}
</style>
