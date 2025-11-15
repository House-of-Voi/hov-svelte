<script lang="ts">
	import type { WaysWin } from '$lib/game-engine/types/results';

	interface Props {
		/** Ways-to-win results */
		waysWins: WaysWin[];
		/** Total payout */
		totalPayout: number;
		/** Bonus spins awarded */
		bonusSpinsAwarded?: number;
		/** Whether jackpot was hit */
		jackpotHit?: boolean;
		/** Jackpot amount */
		jackpotAmount?: number;
		/** Win level */
		winLevel: 'none' | 'small' | 'medium' | 'large' | 'jackpot';
		/** Callback when display should be closed */
		onClose?: () => void;
	}

	let {
		waysWins = [],
		totalPayout = 0,
		bonusSpinsAwarded = 0,
		jackpotHit = false,
		jackpotAmount = 0,
		winLevel = 'none',
		onClose
	}: Props = $props();

	const isWin = totalPayout > 0 || jackpotHit || bonusSpinsAwarded > 0;

	// Get win level duration for auto-close
	function getWinLevelDuration(level: 'none' | 'small' | 'medium' | 'large' | 'jackpot'): number {
		switch (level) {
			case 'jackpot':
				return 6000;
			case 'large':
				return 4000;
			case 'medium':
				return 2500;
			case 'small':
				return 1500;
			default:
				return 2000;
		}
	}

	// Auto-close after duration based on win level
	$effect(() => {
		if (isWin && onClose) {
			const duration = getWinLevelDuration(winLevel);
			const timeout = setTimeout(() => {
				onClose();
			}, duration);

			return () => clearTimeout(timeout);
		}
	});

	function formatPayout(amount: number): string {
		return amount.toLocaleString();
	}

	function getSymbolName(symbol: string): string {
		const symbolNames: Record<string, string> = {
			'0': 'Buffalo',
			'1': 'Eagle',
			'2': 'Cougar',
			'3': 'Elk',
			'4': 'Wolf',
			'5': 'A',
			'6': 'K',
			'7': 'Q',
			'8': 'J',
			'9': '10',
			'A': '9',
			'B': 'Wild',
			'C': 'Wild 2x',
			'D': 'Wild 3x',
			'E': 'HOV',
			'F': 'Bonus'
		};
		return symbolNames[symbol] || symbol;
	}
</script>

{#if isWin}
	<div 
		class="win-display w2w" 
		class:jackpot={jackpotHit} 
		class:big-win={winLevel === 'large' || winLevel === 'jackpot'}
		role="dialog"
		aria-live="polite"
		aria-label="Win celebration"
	>
		<div class="win-content">
			{#if jackpotHit}
				<div class="jackpot-banner">
					<h2 class="jackpot-title">🎰 JACKPOT! 🎰</h2>
					<div class="jackpot-amount">{formatPayout(jackpotAmount)}</div>
				</div>
			{/if}

			{#if waysWins.length > 0}
				<div class="ways-wins-section">
					<h3 class="section-title">Ways to Win</h3>
					<div class="ways-list">
						{#each waysWins as win}
							<div class="way-win-item">
								<div class="way-symbol">{getSymbolName(win.symbol)}</div>
								<div class="way-details">
									<div class="way-info">
										<span class="way-count">{win.ways} ways</span>
										<span class="way-matches">{win.matchLength} matches</span>
										{#if win.wildMultiplier > 1}
											<span class="wild-multiplier">×{win.wildMultiplier}</span>
										{/if}
									</div>
									<div class="way-payout">{formatPayout(win.payout)}</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if bonusSpinsAwarded > 0}
				<div class="bonus-spins-section">
					<div class="bonus-icon">🎁</div>
					<div class="bonus-text">
						<h3>Bonus Spins Awarded!</h3>
						<p class="bonus-count">{bonusSpinsAwarded} free spins</p>
					</div>
				</div>
			{/if}

			<div class="total-payout-section">
				<div class="total-label">Total Payout</div>
				<div class="total-amount">{formatPayout(totalPayout)}</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.win-display.w2w {
		@apply fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm;
		@apply animate-fade-in;
	}

	.win-content {
		@apply bg-surface-900 rounded-2xl p-8 max-w-2xl w-full mx-4 border-2 border-primary-500;
		@apply shadow-2xl shadow-primary-500/50;
	}

	.win-display.jackpot .win-content {
		@apply border-warning-500 shadow-warning-500/50;
		@apply animate-pulse;
	}

	.jackpot-banner {
		@apply text-center mb-6 pb-6 border-b border-surface-700;
	}

	.jackpot-title {
		@apply text-4xl font-black text-warning-500 mb-2 uppercase tracking-wider;
		@apply animate-bounce;
	}

	.jackpot-amount {
		@apply text-5xl font-black text-warning-400;
	}

	.ways-wins-section {
		@apply mb-6;
	}

	.section-title {
		@apply text-lg font-bold text-primary-400 mb-3 uppercase;
	}

	.ways-list {
		@apply space-y-2;
	}

	.way-win-item {
		@apply flex items-center justify-between p-3 bg-surface-800 rounded-lg;
	}

	.way-symbol {
		@apply font-bold text-lg text-primary-400 min-w-[80px];
	}

	.way-details {
		@apply flex-1 flex items-center justify-between ml-4;
	}

	.way-info {
		@apply flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400;
	}

	.way-count {
		@apply font-medium text-white;
	}

	.way-matches {
		@apply text-neutral-700 dark:text-neutral-300;
	}

	.wild-multiplier {
		@apply px-2 py-1 bg-warning-500/20 text-warning-400 rounded text-xs font-bold;
	}

	.way-payout {
		@apply font-bold text-lg text-primary-400;
	}

	.bonus-spins-section {
		@apply flex items-center gap-4 p-4 bg-primary-500/20 rounded-lg mb-6;
	}

	.bonus-icon {
		@apply text-4xl;
	}

	.bonus-text h3 {
		@apply text-xl font-bold text-primary-400 mb-1;
	}

	.bonus-count {
		@apply text-lg text-white;
	}

	.total-payout-section {
		@apply text-center pt-6 border-t border-surface-700;
	}

	.total-label {
		@apply text-sm text-neutral-600 dark:text-neutral-400 uppercase tracking-wide mb-2;
	}

	.total-amount {
		@apply text-4xl font-black text-primary-400;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.animate-fade-in {
		animation: fade-in 0.3s ease-out;
	}
</style>

