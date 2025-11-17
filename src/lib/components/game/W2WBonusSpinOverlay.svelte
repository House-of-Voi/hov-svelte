<script lang="ts">
	interface Props {
		/** Number of remaining bonus spins */
		bonusSpins: number;
		/** Whether auto bonus mode is active */
		isAutoMode?: boolean;
		/** Callback to exit bonus spin mode (optional) */
		onExit?: () => void;
	}

	let {
		bonusSpins,
		isAutoMode = false,
		onExit
	}: Props = $props();
</script>

{#if bonusSpins > 0}
	<div class="bonus-spin-overlay">
		<div class="bonus-spin-content">
			<div class="bonus-spin-icon">🎰</div>
			<div class="bonus-spin-info">
				<div class="bonus-spin-label">BONUS SPIN MODE</div>
				<div class="bonus-spin-count">
					{bonusSpins} {bonusSpins === 1 ? 'SPIN' : 'SPINS'} REMAINING
				</div>
			</div>
			{#if onExit}
				<button
					class="exit-button"
					onclick={onExit}
					title="Exit bonus spin mode"
				>
					✕
				</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.bonus-spin-overlay {
		@apply fixed top-4 left-1/2 transform -translate-x-1/2 z-40;
		@apply pointer-events-none;
	}

	.bonus-spin-content {
		@apply flex items-center gap-3 px-4 py-2;
		@apply bg-gradient-to-r from-warning-500/90 via-warning-400/90 to-warning-500/90;
		@apply border-2 border-warning-300/50 rounded-lg;
		@apply shadow-lg shadow-warning-500/30;
		@apply backdrop-blur-sm;
		@apply pointer-events-auto;
		animation: pulse-glow 2s ease-in-out infinite;
	}

	.bonus-spin-icon {
		@apply text-2xl;
		animation: spin-slow 3s linear infinite;
	}

	.bonus-spin-info {
		@apply flex flex-col;
	}

	.bonus-spin-label {
		@apply text-xs font-bold text-warning-900 uppercase tracking-wider;
		@apply dark:text-warning-100;
	}

	.bonus-spin-count {
		@apply text-sm font-semibold text-warning-900;
		@apply dark:text-warning-100;
	}

	.exit-button {
		@apply ml-2 w-6 h-6 flex items-center justify-center;
		@apply text-warning-900 dark:text-warning-100;
		@apply hover:bg-warning-300/30 dark:hover:bg-warning-700/30;
		@apply rounded-full transition-colors;
		@apply font-bold text-sm;
		cursor: pointer;
	}

	@keyframes pulse-glow {
		0%, 100% {
			box-shadow: 0 0 10px rgba(251, 191, 36, 0.3), 0 0 20px rgba(251, 191, 36, 0.2);
		}
		50% {
			box-shadow: 0 0 20px rgba(251, 191, 36, 0.5), 0 0 30px rgba(251, 191, 36, 0.3);
		}
	}

	@keyframes spin-slow {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>



