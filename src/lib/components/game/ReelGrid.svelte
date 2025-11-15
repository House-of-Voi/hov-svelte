<script lang="ts">
	import type { SymbolId, WinningLine } from '$lib/game-engine/types';
	import type { WaysWin } from '$lib/game-engine/types/results';
	import { getSymbolDisplay, PAYLINE_PATTERNS } from '$lib/game-engine/utils/gameConstants';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		/** Current visible grid (5 reels x 3 symbols) */
		grid: SymbolId[][];
		/** Full reel data (5 reels x 100 symbols) - 5reel only */
		reels?: SymbolId[][];
		/** Whether reels are currently spinning */
		isSpinning: boolean;
		/** Whether we're waiting for the outcome (keeps symbols flipping) */
		waitingForOutcome?: boolean;
		/** Winning lines to highlight (5reel only) */
		winningLines?: WinningLine[];
		/** Ways-to-win results (W2W only) */
		waysWins?: WaysWin[];
		/** Game type: '5reel' or 'w2w' */
		gameType?: '5reel' | 'w2w';
		/** Callback when spin animation completes */
		onSpinComplete?: () => void;
	}

	let {
		grid,
		reels,
		isSpinning,
		waitingForOutcome = false,
		winningLines = [],
		waysWins = [],
		gameType = '5reel',
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

	// Available symbols for random flipping
	const SYMBOLS_5REEL: SymbolId[] = ['A', 'B', 'C', 'D', '_'];
	const SYMBOLS_W2W: SymbolId[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'] as SymbolId[];
	const SYMBOLS = gameType === 'w2w' ? SYMBOLS_W2W : SYMBOLS_5REEL;

	/**
	 * Get a random symbol from available symbols
	 */
	function getRandomSymbol(): SymbolId {
		return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
	}

	/**
	 * Check if a position is part of a winning line (5reel) or ways-to-win (W2W)
	 */
	function isWinningPosition(col: number, row: number): boolean {
		if (gameType === 'w2w') {
			// For W2W, highlight symbols that are part of ways-to-win
			// Ways-to-win: consecutive matching symbols left-to-right
			if (!waysWins || waysWins.length === 0) return false;
			
			const symbol = displayGrid[col]?.[row];
			if (!symbol) return false;

			// Check if this symbol is part of any way win
			return waysWins.some(win => {
				// Check if symbol matches and is in consecutive reels from left
				if (win.symbol !== symbol) return false;
				
				// For ways-to-win, highlight all matching symbols in consecutive reels
				// Starting from reel 0, check if this position is part of the match
				let matchReel = 0;
				for (let reel = 0; reel <= col; reel++) {
					const reelSymbols = displayGrid[reel] || [];
					const hasMatch = reelSymbols.includes(win.symbol) || 
						reelSymbols.includes('B') || // Wild
						reelSymbols.includes('C') || // Wild 2x
						reelSymbols.includes('D');   // Wild 3x
					
					if (!hasMatch) break;
					if (reel === col) {
						// This reel is part of the match - check if this row has the symbol
						return reelSymbols[row] === win.symbol || 
							reelSymbols[row] === 'B' ||
							reelSymbols[row] === 'C' ||
							reelSymbols[row] === 'D';
					}
					matchReel++;
				}
				return false;
			});
		} else {
			// 5reel: check paylines
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
	}

	/**
	 * Check if a symbol is a wild (W2W only)
	 */
	function isWild(symbol: SymbolId): boolean {
		return symbol === 'B' || symbol === 'C' || symbol === 'D';
	}

	/**
	 * Get wild multiplier indicator (W2W only)
	 */
	function getWildMultiplier(symbol: SymbolId): number {
		if (symbol === 'D') return 3;
		if (symbol === 'C') return 2;
		if (symbol === 'B') return 1;
		return 0;
	}

	/**
	 * Check if symbol is bonus or HOV (W2W only)
	 */
	function isSpecialSymbol(symbol: SymbolId): boolean {
		return symbol === 'E' || symbol === 'F'; // HOV or Bonus
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

	// Track last grid to avoid duplicate logs
	let lastGridHash = $state<string>('');

	/**
	 * React to grid changes (when outcome is set)
	 */
	$effect(() => {
		// If we're not waiting for outcome anymore and have a valid grid, update display
		if (!waitingForOutcome && !isSpinning && grid && grid.length === 5) {
			// Create a hash of the grid to detect actual changes
			const gridHash = JSON.stringify(grid);
			
			if (gridHash !== lastGridHash) {
				const firstRow = grid.map(reel => reel[0]).join(' ');
				const secondRow = grid.map(reel => reel[1]).join(' ');
				const thirdRow = grid.map(reel => reel[2]).join(' ');
				
				console.log('🎰 ReelGrid: Grid updated', {
					gridHash: gridHash.substring(0, 50) + '...',
					gridStructure: grid.map((reel, idx) => `Reel ${idx}: [${reel.join(', ')}]`),
					visualRows: {
						row1: firstRow,
						row2: secondRow,
						row3: thirdRow
					},
					waitingForOutcome,
					isSpinning
				});
				
				displayGrid = grid.map((column) => [...column]);
				
				// Log what we set displayGrid to
				const displayFirstRow = displayGrid.map(reel => reel[0]).join(' ');
				if (displayFirstRow !== firstRow) {
					console.warn('🎰 ReelGrid: MISMATCH after update!', {
						expected: firstRow,
						actual: displayFirstRow,
						displayGrid: displayGrid.map((reel, idx) => `Reel ${idx}: [${reel.join(', ')}]`)
					});
				}
				
				lastGridHash = gridHash;
			}
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
						{@const display = getSymbolDisplay(symbol, gameType)}
						{@const isWinner = isWinningPosition(reelIndex, row)}
						{@const isFlipping = waitingForOutcome || isSpinning}
						{@const isWildSymbol = gameType === 'w2w' && isWild(symbol)}
						{@const wildMultiplier = gameType === 'w2w' ? getWildMultiplier(symbol) : 0}
						{@const isSpecial = gameType === 'w2w' && isSpecialSymbol(symbol)}
						<div
							class="symbol"
							class:winning={isWinner}
							class:flipping={isFlipping}
							class:wild={isWildSymbol}
							class:special={isSpecial}
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
								{#if wildMultiplier > 0}
									<div class="wild-multiplier">×{wildMultiplier}</div>
								{/if}
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
		background: linear-gradient(135deg, rgba(250, 250, 252, 0.95), rgba(245, 245, 250, 0.95));
		border-radius: 1rem;
		border: 2px solid rgba(251, 191, 36, 0.3);
	}

	.dark .reel-grid {
		background: linear-gradient(135deg, rgba(38, 38, 50, 0.95), rgba(28, 28, 40, 0.95));
		border-color: rgba(251, 191, 36, 0.2);
	}

	.reel-container {
		position: relative;
		background: rgba(255, 255, 255, 0.9);
		border-radius: 0.5rem;
		border: 1px solid rgba(251, 191, 36, 0.2);
		overflow: hidden;
		perspective: 800px;
	}

	.dark .reel-container {
		background: rgba(23, 23, 33, 0.9);
		border-color: rgba(251, 191, 36, 0.15);
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
		border-bottom: 1px solid rgba(251, 191, 36, 0.15);
		transform-style: preserve-3d;
		background: rgba(250, 250, 252, 0.6);
	}

	.dark .symbol {
		border-bottom-color: rgba(251, 191, 36, 0.08);
		background: rgba(30, 30, 40, 0.5);
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

	.symbol.wild {
		border: 2px solid rgba(255, 215, 0, 0.5);
	}

	.symbol.special {
		animation: specialPulse 1s ease-in-out infinite;
	}

	.wild-multiplier {
		position: absolute;
		top: 4px;
		right: 4px;
		background: rgba(255, 215, 0, 0.9);
		color: #000;
		font-size: 0.75rem;
		font-weight: bold;
		padding: 2px 6px;
		border-radius: 4px;
		line-height: 1;
	}

	@keyframes specialPulse {
		0%, 100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.1);
			opacity: 0.9;
		}
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
