<script lang="ts">
	import type { SymbolId, WinningLine } from '$lib/game-engine/types';
	import { getSymbolDisplay, PAYLINE_PATTERNS } from '$lib/game-engine/utils/gameConstants';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		/** Current visible grid (5 reels x 3 symbols) */
		grid: SymbolId[][];
		/** Full reel data (5 reels x 100 symbols) */
		reels?: SymbolId[][];
		/** Whether reels are currently spinning */
		isSpinning: boolean;
		/** Whether we're waiting for the outcome (keeps symbols flipping) */
		waitingForOutcome?: boolean;
		/** Winning lines to highlight */
		winningLines?: WinningLine[];
		/** Callback when spin animation completes */
		onSpinComplete?: () => void;
	}

	let {
		grid,
		reels,
		isSpinning,
		waitingForOutcome = false,
		winningLines = [],
		onSpinComplete
	}: Props = $props();

	// Display grid - shows random symbols while waiting, final grid when outcome is known
	let displayGrid = $state<SymbolId[][]>([
		['_', '_', '_'],
		['_', '_', '_'],
		['_', '_', '_'],
		['_', '_', '_'],
		['_', '_', '_']
	]);

	let flipInterval: ReturnType<typeof setInterval> | null = null;
	let animationKey = $state(0); // Key to force animation restart
	const FLIP_SPEED = 100; // Milliseconds between flips (10 flips per second)

	// Available symbols for random flipping (including blanks)
	const SYMBOLS: SymbolId[] = ['A', 'B', 'C', 'D', '_'];

	/**
	 * Get a random symbol from available symbols
	 */
	function getRandomSymbol(): SymbolId {
		return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
	}

	/**
	 * Check if a position is part of a winning line
	 */
	function isWinningPosition(col: number, row: number): boolean {
		return winningLines.some((line) => {
			// Handle both postMessage API (no pattern) and internal API (with pattern)
			if ('pattern' in line && line.pattern) {
				// Internal API: pattern exists
				return line.pattern[col] === row;
			} else if (line.paylineIndex !== undefined) {
				// PostMessage API: look up pattern from PAYLINE_PATTERNS
				const pattern = PAYLINE_PATTERNS[line.paylineIndex];
				if (pattern && pattern[col] === row) {
					return true;
				}
			}
			return false;
		});
	}

	/**
	 * Start random symbol flipping
	 */
	function startFlipping() {
		if (flipInterval) {
			clearInterval(flipInterval);
		}

		// Initialize display grid with random symbols
		displayGrid = Array(5).fill(null).map(() => [
			getRandomSymbol(),
			getRandomSymbol(),
			getRandomSymbol()
		]);

		// Start flipping symbols at regular intervals
		flipInterval = setInterval(() => {
			if (!waitingForOutcome && !isSpinning) {
				stopFlipping();
				return;
			}

			// Update display grid with random symbols
			// Flip each position independently for a more dynamic effect
			displayGrid = displayGrid.map((column, colIndex) => {
				return column.map((_, rowIndex) => {
					// Flip most positions, but keep some occasionally for variety
					if (Math.random() > 0.25) {
						return getRandomSymbol();
					}
					return displayGrid[colIndex][rowIndex]; // Keep current symbol sometimes
				});
			});
			
			// Update animation key to force restart
			animationKey++;
		}, FLIP_SPEED);
	}

	/**
	 * Stop flipping and show final grid
	 */
	function stopFlipping() {
		if (flipInterval) {
			clearInterval(flipInterval);
			flipInterval = null;
		}

		// Update display grid to show final outcome
		if (grid && grid.length === 5) {
			displayGrid = grid.map((column) => [...column]);
		}

		// Call completion callback after a brief delay
		setTimeout(() => {
			onSpinComplete?.();
		}, 150);
	}

	/**
	 * React to isSpinning prop changes
	 */
	$effect(() => {
		if (isSpinning && waitingForOutcome) {
			// Start flipping when spin begins
			startFlipping();
		} else if (!isSpinning && !waitingForOutcome) {
			// Stop flipping when outcome is ready
			stopFlipping();
		}
	});

	/**
	 * React to waitingForOutcome changes
	 */
	$effect(() => {
		if (!waitingForOutcome && isSpinning) {
			// Outcome is ready - stop flipping
			stopFlipping();
		}
	});

	/**
	 * React to grid changes (when outcome is set)
	 */
	$effect(() => {
		// If we're not waiting for outcome anymore and have a valid grid, update display
		if (!waitingForOutcome && !isSpinning && grid && grid.length === 5) {
			displayGrid = grid.map((column) => [...column]);
		}
	});

	// Cleanup on destroy
	onDestroy(() => {
		if (flipInterval) {
			clearInterval(flipInterval);
		}
	});
</script>

<div class="reel-grid">
	{#each Array(5) as _, reelIndex}
		<div class="reel-container">
			<div class="reel-mask">
				<div class="reel-strip">
					{#each Array(3) as _, row}
						{@const symbol = displayGrid[reelIndex]?.[row] || '_'}
						{@const display = getSymbolDisplay(symbol)}
						{@const isWinner = isWinningPosition(reelIndex, row)}
						{@const isFlipping = waitingForOutcome || isSpinning}
						<div
							class="symbol"
							class:winning={isWinner}
							class:flipping={isFlipping}
							style="animation-delay: {row * 50}ms"
							data-key={animationKey}
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
	}

	.symbol:last-child {
		border-bottom: none;
	}

	.symbol.flipping {
		animation: flipAndSpin 0.15s ease-in-out;
		animation-iteration-count: infinite;
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

	@keyframes flipAndSpin {
		0% {
			opacity: 1;
			transform: rotateY(0deg) rotateX(0deg) scale(1);
		}
		25% {
			opacity: 0.6;
			transform: rotateY(45deg) rotateX(10deg) scale(0.9);
		}
		50% {
			opacity: 0.3;
			transform: rotateY(90deg) rotateX(20deg) scale(0.8);
		}
		75% {
			opacity: 0.6;
			transform: rotateY(135deg) rotateX(10deg) scale(0.9);
		}
		100% {
			opacity: 1;
			transform: rotateY(180deg) rotateX(0deg) scale(1);
		}
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
