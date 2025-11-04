<script lang="ts">
	import type { SymbolId, WinningLine, ReelConfig } from '$lib/game-engine/types';
	import { getSymbolDisplay, GAME_DEFAULTS } from '$lib/game-engine/utils/gameConstants';
	import { onMount } from 'svelte';

	interface Props {
		/** Current visible grid (5 reels x 3 symbols) */
		grid: SymbolId[][];
		/** Full reel data (5 reels x 100 symbols) */
		reels?: SymbolId[][];
		/** Whether reels are currently spinning */
		isSpinning: boolean;
		/** Winning lines to highlight */
		winningLines?: WinningLine[];
		/** Callback when spin animation completes */
		onSpinComplete?: () => void;
	}

	let {
		grid,
		reels,
		isSpinning,
		winningLines = [],
		onSpinComplete
	}: Props = $props();

	// Reel positions for animation (in pixels)
	let reelPositions = $state<number[]>([0, 0, 0, 0, 0]);
	let spinning = $state(false);

	const SYMBOL_HEIGHT = 120; // Height of each symbol in pixels
	const VISIBLE_SYMBOLS = 3;

	/**
	 * Check if a position is part of a winning line
	 */
	function isWinningPosition(col: number, row: number): boolean {
		return winningLines.some((line) => line.pattern[col] === row);
	}

	/**
	 * Get the symbol at a specific position in a reel
	 */
	function getReelSymbol(reelIndex: number, position: number): SymbolId {
		if (!reels || !reels[reelIndex]) {
			return grid[reelIndex]?.[position % VISIBLE_SYMBOLS] || '_';
		}

		const reel = reels[reelIndex];
		return reel[position % reel.length];
	}

	/**
	 * Start spin animation
	 */
	function startSpin() {
		spinning = true;

		// Animate each reel with staggered timing
		reelPositions.forEach((_, index) => {
			setTimeout(() => {
				animateReel(index);
			}, index * 100); // Stagger start by 100ms per reel
		});
	}

	/**
	 * Animate a single reel
	 */
	function animateReel(reelIndex: number) {
		const duration = 2000 + reelIndex * 200; // Staggered stop times
		const startTime = Date.now();
		const spinSpeed = 20; // Pixels per frame

		const animate = () => {
			if (!spinning) return;

			const elapsed = Date.now() - startTime;

			if (elapsed < duration) {
				// Continue spinning
				reelPositions[reelIndex] = (reelPositions[reelIndex] + spinSpeed) % (SYMBOL_HEIGHT * 100);
				requestAnimationFrame(animate);
			} else {
				// Stop at final position
				stopReel(reelIndex);
			}
		};

		requestAnimationFrame(animate);
	}

	/**
	 * Stop a reel at the correct position to show the target grid
	 */
	function stopReel(reelIndex: number) {
		// Calculate position to show the target symbols from grid
		// We want the middle row to show grid[reelIndex][1]
		// Find where that symbol appears in the full reel
		const targetSymbol = grid[reelIndex][1]; // Middle symbol

		if (reels && reels[reelIndex]) {
			const reel = reels[reelIndex];
			// Find first occurrence of target symbol
			let targetIndex = reel.findIndex((s) => s === targetSymbol);
			if (targetIndex === -1) targetIndex = 0;

			// Position so that targetIndex is in the middle (row 1)
			reelPositions[reelIndex] = targetIndex * SYMBOL_HEIGHT;
		} else {
			// No full reel data, just reset to 0
			reelPositions[reelIndex] = 0;
		}

		// Check if all reels have stopped
		if (reelPositions.every((_, i) => i === reelIndex || !spinning)) {
			setTimeout(() => {
				spinning = false;
				onSpinComplete?.();
			}, 100);
		}
	}

	/**
	 * React to isSpinning prop changes
	 */
	$effect(() => {
		if (isSpinning && !spinning) {
			startSpin();
		} else if (!isSpinning && spinning) {
			spinning = false;
			reelPositions = [0, 0, 0, 0, 0];
		}
	});
</script>

<div class="reel-grid">
	{#each Array(5) as _, reelIndex}
		<div class="reel-container">
			<div class="reel-mask">
				<div
					class="reel-strip"
					class:spinning
					style="transform: translateY(-{reelPositions[reelIndex]}px)"
				>
					{#if spinning}
						<!-- Show extended reel during spin -->
						{#each Array(20) as _, symbolIndex}
							{@const symbol = getReelSymbol(reelIndex, symbolIndex)}
							{@const display = getSymbolDisplay(symbol)}
							<div class="symbol">
								<div class="symbol-content">
									<span class="symbol-emoji" style="color: {display.color}">
										{display.emoji}
									</span>
								</div>
							</div>
						{/each}
					{:else}
						<!-- Show visible grid when not spinning -->
						{#each Array(VISIBLE_SYMBOLS) as _, row}
							{@const symbol = grid[reelIndex]?.[row] || '_'}
							{@const display = getSymbolDisplay(symbol)}
							{@const isWinner = isWinningPosition(reelIndex, row)}
							<div
								class="symbol"
								class:winning={isWinner}
								style="animation-delay: {row * 100}ms"
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
					{/if}
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
	}

	.reel-mask {
		height: calc(120px * 3); /* 3 visible symbols */
		overflow: hidden;
		position: relative;
	}

	.reel-strip {
		display: flex;
		flex-direction: column;
		transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
		will-change: transform;
	}

	.reel-strip.spinning {
		transition: none;
	}

	.symbol {
		height: 120px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
	}

	.symbol-emoji {
		font-size: 4rem;
		line-height: 1;
		transition: all 0.3s ease;
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
