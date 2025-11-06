<script lang="ts">
	import type { WinningLine } from '$lib/game-engine/types';
	import { getSymbolDisplay } from '$lib/game-engine/utils/gameConstants';

	interface Props {
		/** Current visible grid (5 reels x 3 symbols) */
		grid: string[][];
		/** Winning lines to highlight */
		winningLines?: WinningLine[];
	}

	let { grid, winningLines = [] }: Props = $props();

	/**
	 * Check if a position is part of a winning line
	 */
	function isWinningPosition(col: number, row: number): boolean {
		return winningLines.some((line) => line.pattern[col] === row);
	}

	/**
	 * Get symbol emoji from symbol ID
	 */
	function getSymbolEmoji(symbolId: string): string {
		const symbolIdStr = String(symbolId);
		const symbolMap: Record<string, string> = {
			// Letter-based IDs (from game engine)
			A: '💎', // Diamond
			B: '⭐', // Star
			C: '👑', // Crown
			D: '🍀', // Clover
			_: '　', // Blank
		};
		return symbolMap[symbolIdStr] || symbolIdStr || '?';
	}
</script>

<div class="reel-grid">
	{#each Array(5) as _, reelIndex}
		<div class="reel-container">
			<div class="reel-mask">
				<div class="reel-strip">
					{#each Array(3) as _, row}
						{@const symbol = grid[reelIndex]?.[row] || '_'}
						{@const display = getSymbolDisplay(symbol as any)}
						{@const isWinner = isWinningPosition(reelIndex, row)}
						<div
							class="symbol"
							class:winning={isWinner}
						>
							<div class="symbol-content">
								<span
									class="symbol-emoji"
									style="color: {display.color}; text-shadow: {isWinner
										? `0 0 20px ${display.glowColor}`
										: 'none'}"
								>
									{display.emoji}
								</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/each}
</div>

<style>
	.reel-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.5rem;
		padding: 1rem;
		background: linear-gradient(135deg, rgba(30, 30, 50, 0.9), rgba(20, 20, 40, 0.9));
		border-radius: 1rem;
		border: 2px solid rgba(59, 130, 246, 0.3);
	}

	.reel-container {
		position: relative;
		background: rgba(15, 15, 25, 0.8);
		border-radius: 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		overflow: hidden;
		perspective: 800px;
	}

	.reel-mask {
		height: calc(120px * 3); /* 3 visible symbols */
		overflow: hidden;
		position: relative;
	}

	.reel-strip {
		display: flex;
		flex-direction: column;
	}

	.symbol {
		height: 120px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		transform-style: preserve-3d;
		transition: all 0.2s ease;
	}

	.symbol:last-child {
		border-bottom: none;
	}

	.symbol.winning {
		animation: winPulse 0.6s ease-in-out infinite;
		background: radial-gradient(
			circle,
			rgba(255, 215, 0, 0.1),
			transparent
		);
	}

	.symbol-content {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		transform-style: preserve-3d;
		backface-visibility: hidden;
	}

	.symbol-emoji {
		font-size: 4rem;
		line-height: 1;
		transition: all 0.2s ease;
	}

	.symbol.winning .symbol-emoji {
		transform: scale(1.1);
	}

	@keyframes winPulse {
		0%,
		100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.05);
			opacity: 0.9;
		}
	}

	/* Responsive */
	@media (max-width: 768px) {
		.reel-grid {
			gap: 0.25rem;
			padding: 0.5rem;
		}

		.symbol {
			height: 80px;
		}

		.reel-mask {
			height: calc(80px * 3);
		}

		.symbol-emoji {
			font-size: 2.5rem;
		}
	}
</style>

