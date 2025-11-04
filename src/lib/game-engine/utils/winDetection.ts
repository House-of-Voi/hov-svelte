/**
 * Win Detection Utility
 *
 * Analyzes spin outcomes to detect winning paylines and calculate payouts.
 * This mirrors the logic from the Voi contract to ensure client-side validation.
 */

import type {
	SymbolId,
	PaylinePattern,
	WinningLine,
	SpinOutcome,
	SymbolPayouts
} from '../types';

/**
 * Detect all winning paylines in a grid
 */
export function detectWinningPaylines(
	grid: SymbolId[][],
	paylinePatterns: PaylinePattern[],
	paytable: SymbolPayouts[],
	selectedPaylines: number,
	betPerLine: number
): WinningLine[] {
	const winningLines: WinningLine[] = [];

	// Check each selected payline
	for (let i = 0; i < Math.min(selectedPaylines, paylinePatterns.length); i++) {
		const pattern = paylinePatterns[i];
		const result = checkPayline(grid, pattern, paytable, betPerLine, i);

		if (result) {
			winningLines.push(result);
		}
	}

	return winningLines;
}

/**
 * Check a single payline for wins
 */
function checkPayline(
	grid: SymbolId[][],
	pattern: PaylinePattern,
	paytable: SymbolPayouts[],
	betPerLine: number,
	paylineIndex: number
): WinningLine | null {
	// Get symbols along this payline
	const symbols: SymbolId[] = [];
	for (let col = 0; col < 5; col++) {
		const row = pattern[col];
		symbols.push(grid[col][row]);
	}

	// Count occurrences of each symbol across all 5 positions
	const symbolCounts: Map<SymbolId, number> = new Map();

	for (const symbol of symbols) {
		if (symbol !== '_') {
			// Ignore blank symbols
			symbolCounts.set(symbol, (symbolCounts.get(symbol) || 0) + 1);
		}
	}

	// Find the symbol with the highest count (must be at least 3)
	let bestSymbol: SymbolId | null = null;
	let bestCount = 0;

	for (const [symbol, count] of symbolCounts.entries()) {
		if (count >= 3 && count > bestCount) {
			bestSymbol = symbol;
			bestCount = count;
		}
	}

	// If we have a winning combination, calculate payout
	if (bestSymbol && bestCount >= 3) {
		const symbolConfig = paytable.find((s) => s.symbol === bestSymbol);
		if (!symbolConfig) return null;

		// Get the multiplier for this match count
		let multiplier = 0;
		if (bestCount === 3) multiplier = symbolConfig.match3;
		else if (bestCount === 4) multiplier = symbolConfig.match4;
		else if (bestCount === 5) multiplier = symbolConfig.match5;

		const payout = betPerLine * multiplier;

		return {
			paylineIndex,
			pattern,
			symbol: bestSymbol,
			matchCount: bestCount,
			payout
		};
	}

	return null;
}

/**
 * Calculate total winnings from all winning lines
 */
export function calculateTotalWinnings(winningLines: WinningLine[]): number {
	return winningLines.reduce((total, line) => total + line.payout, 0);
}

/**
 * Create a complete spin outcome from grid and payline data
 */
export function createSpinOutcome(
	grid: SymbolId[][],
	paylinePatterns: PaylinePattern[],
	paytable: SymbolPayouts[],
	selectedPaylines: number,
	betPerLine: number,
	blockNumber: number,
	blockSeed: string,
	betKey: string
): SpinOutcome {
	const winningLines = detectWinningPaylines(
		grid,
		paylinePatterns,
		paytable,
		selectedPaylines,
		betPerLine
	);

	const totalPayout = calculateTotalWinnings(winningLines);

	return {
		grid,
		winningLines,
		totalPayout,
		blockNumber,
		blockSeed,
		betKey,
		verified: true
	};
}

/**
 * Extract symbols from grid positions along a payline
 */
export function getPaylineSymbols(grid: SymbolId[][], pattern: PaylinePattern): SymbolId[] {
	const symbols: SymbolId[] = [];

	for (let col = 0; col < 5; col++) {
		const row = pattern[col];
		if (row >= 0 && row < 3 && col >= 0 && col < grid.length) {
			symbols.push(grid[col][row]);
		}
	}

	return symbols;
}

/**
 * Check if a grid position is part of a winning payline
 */
export function isWinningPosition(
	col: number,
	row: number,
	winningLines: WinningLine[]
): boolean {
	return winningLines.some((line) => {
		return line.pattern[col] === row;
	});
}

/**
 * Get all winning positions from winning lines
 */
export function getWinningPositions(
	winningLines: WinningLine[]
): Array<{ col: number; row: number; symbol: SymbolId }> {
	const positions: Array<{ col: number; row: number; symbol: SymbolId }> = [];

	for (const line of winningLines) {
		for (let col = 0; col < 5; col++) {
			const row = line.pattern[col];
			positions.push({ col, row, symbol: line.symbol });
		}
	}

	return positions;
}

/**
 * Format winning paylines for debugging
 */
export function formatWinningLines(winningLines: WinningLine[]): string {
	if (winningLines.length === 0) {
		return 'No winning paylines';
	}

	let output = `Found ${winningLines.length} winning payline(s):\n`;

	winningLines.forEach((line, index) => {
		output += `  ${index + 1}. Payline ${line.paylineIndex + 1}: ${line.matchCount}x ${line.symbol} `;
		output += `= ${line.payout} microVOI\n`;
		output += `     Pattern: [${line.pattern.join(', ')}]\n`;
	});

	return output;
}
