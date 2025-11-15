<script lang="ts">
	interface QueuedSpin {
		clientSpinId: string;
		engineSpinId?: string;
		betAmount: number;
		mode: number;
		timestamp: number;
		completedAt?: number;
		status: 'pending' | 'submitted' | 'completed' | 'failed';
		outcome?: {
			totalPayout: number;
			waysWins?: any[];
			grid?: string[][];
			bonusSpinsAwarded?: number;
			jackpotHit?: boolean;
			jackpotAmount?: number;
			winLevel?: 'none' | 'small' | 'medium' | 'large' | 'jackpot';
		};
	}

	interface Props {
		spin: QueuedSpin | null;
		onClose?: () => void;
	}

	let { spin, onClose }: Props = $props();

	/**
	 * Format payout
	 */
	function formatPayout(amount: number): string {
		return amount.toLocaleString();
	}

	/**
	 * Get symbol name
	 */
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
			A: '9',
			B: 'Wild',
			C: 'Wild 2x',
			D: 'Wild 3x',
			E: 'HOV',
			F: 'Bonus'
		};
		return symbolNames[symbol] || symbol;
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
	 * Format timestamp
	 */
	function formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleString();
	}
</script>

{#if spin && spin.outcome}
	<div class="modal-overlay" onclick={onClose}>
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<!-- Header -->
			<div class="modal-header">
				<h2 class="modal-title">Spin Details</h2>
				<button class="close-icon" onclick={onClose}>&times;</button>
			</div>

			<!-- Spin Info -->
			<div class="spin-info">
				<div class="info-item">
					<span class="info-label">Bet Amount:</span>
					<span class="info-value"
						>{spin.betAmount}
						{getModeLabel(spin.mode)}</span
					>
				</div>
				<div class="info-item">
					<span class="info-label">Time:</span>
					<span class="info-value">{formatTimestamp(spin.timestamp)}</span>
				</div>
			</div>

			<!-- Grid Visualization (if available) -->
			{#if spin.outcome.grid}
				<div class="grid-section">
					<h3 class="section-title">Result Grid</h3>
					<div class="grid-display">
						{#each spin.outcome.grid as reel}
							<div class="grid-reel">
								{#each reel as symbol}
									<div class="grid-symbol">
										{getSymbolName(symbol)}
									</div>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Jackpot Banner -->
			{#if spin.outcome.jackpotHit}
				<div class="jackpot-banner">
					<h2 class="jackpot-title">🎰 JACKPOT! 🎰</h2>
					<div class="jackpot-amount">{formatPayout(spin.outcome.jackpotAmount || 0)}</div>
				</div>
			{/if}

			<!-- Ways Wins -->
			{#if spin.outcome.waysWins && spin.outcome.waysWins.length > 0}
				<div class="ways-wins-section">
					<h3 class="section-title">Ways to Win</h3>
					<div class="ways-list">
						{#each spin.outcome.waysWins as win}
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

			<!-- Bonus Spins -->
			{#if spin.outcome.bonusSpinsAwarded && spin.outcome.bonusSpinsAwarded > 0}
				<div class="bonus-spins-section">
					<div class="bonus-icon">🎁</div>
					<div class="bonus-text">
						<h3>Bonus Spins Awarded!</h3>
						<p class="bonus-count">{spin.outcome.bonusSpinsAwarded} free spins</p>
					</div>
				</div>
			{/if}

			<!-- Total Payout -->
			<div class="total-payout-section">
				<div class="total-label">Total Payout</div>
				<div
					class="total-amount"
					class:no-win={spin.outcome.totalPayout === 0}
				>
					{spin.outcome.totalPayout > 0 ? formatPayout(spin.outcome.totalPayout) : 'No Win'}
				</div>
			</div>

			<!-- Close Button -->
			<button class="close-button" onclick={onClose}>Close</button>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		@apply fixed inset-0 z-50 flex items-center justify-center;
		@apply bg-black/80 backdrop-blur-sm;
		@apply animate-fade-in;
	}

	.modal-content {
		@apply bg-surface-900 rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto;
		@apply border-2 border-primary-500;
		@apply shadow-2xl shadow-primary-500/50;
		scrollbar-width: thin;
		scrollbar-color: rgb(163, 163, 163) transparent;
	}

	.modal-content::-webkit-scrollbar {
		@apply w-1;
	}

	.modal-content::-webkit-scrollbar-track {
		@apply bg-transparent;
	}

	.modal-content::-webkit-scrollbar-thumb {
		@apply bg-neutral-400 dark:bg-neutral-600 rounded-full;
	}

	.modal-header {
		@apply flex items-center justify-between mb-6 pb-4 border-b border-surface-700;
	}

	.modal-title {
		@apply text-2xl font-bold text-primary-400 uppercase;
	}

	.close-icon {
		@apply text-3xl text-neutral-400 hover:text-white transition-colors;
		@apply w-8 h-8 flex items-center justify-center;
	}

	.spin-info {
		@apply grid grid-cols-2 gap-4 mb-6 p-4 bg-surface-800 rounded-lg;
	}

	.info-item {
		@apply flex flex-col gap-1;
	}

	.info-label {
		@apply text-xs text-neutral-600 dark:text-neutral-400 uppercase;
	}

	.info-value {
		@apply text-sm font-semibold text-white;
	}

	.grid-section {
		@apply mb-6;
	}

	.section-title {
		@apply text-lg font-bold text-primary-400 mb-3 uppercase;
	}

	.grid-display {
		@apply flex gap-2 justify-center p-4 bg-surface-800 rounded-lg;
	}

	.grid-reel {
		@apply flex flex-col gap-2;
	}

	.grid-symbol {
		@apply w-16 h-16 flex items-center justify-center;
		@apply bg-surface-700 border-2 border-primary-500/30 rounded-lg;
		@apply text-xs font-bold text-primary-400 text-center;
	}

	.jackpot-banner {
		@apply text-center mb-6 pb-6 border-b border-surface-700;
	}

	.jackpot-title {
		@apply text-3xl font-black text-warning-500 mb-2 uppercase tracking-wider;
	}

	.jackpot-amount {
		@apply text-4xl font-black text-warning-400;
	}

	.ways-wins-section {
		@apply mb-6;
	}

	.ways-list {
		@apply space-y-2;
	}

	.way-win-item {
		@apply flex items-center justify-between p-3 bg-surface-800 rounded-lg;
	}

	.way-symbol {
		@apply font-bold text-base text-primary-400 min-w-[80px];
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
		@apply font-bold text-base text-primary-400;
	}

	.bonus-spins-section {
		@apply flex items-center gap-4 p-4 bg-primary-500/20 rounded-lg mb-6;
	}

	.bonus-icon {
		@apply text-4xl;
	}

	.bonus-text h3 {
		@apply text-lg font-bold text-primary-400 mb-1;
	}

	.bonus-count {
		@apply text-base text-white;
	}

	.total-payout-section {
		@apply text-center pt-6 border-t border-surface-700;
	}

	.total-label {
		@apply text-sm text-neutral-600 dark:text-neutral-400 uppercase tracking-wide mb-2;
	}

	.total-amount {
		@apply text-3xl font-black text-primary-400;
	}

	.total-amount.no-win {
		@apply text-neutral-500 dark:text-neutral-400;
	}

	.close-button {
		@apply mt-6 w-full px-6 py-3 bg-primary-500 hover:bg-primary-400 text-white font-bold rounded-lg;
		@apply transition-colors;
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
