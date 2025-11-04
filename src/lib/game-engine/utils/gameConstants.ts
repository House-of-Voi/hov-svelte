/**
 * Game Constants
 *
 * Central definitions for game configuration, symbols, paylines, and betting limits.
 */

import type { SymbolId, SymbolPayouts, PaylinePattern } from '../types';

/**
 * Symbol display configuration
 */
export interface SymbolDisplay {
	id: SymbolId;
	name: string;
	emoji: string;
	color: string;
	glowColor: string;
	rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
}

/**
 * Default symbol display mappings (for wireframe)
 */
export const SYMBOL_DISPLAY: Record<SymbolId, SymbolDisplay> = {
	A: {
		id: 'A',
		name: 'Diamond',
		emoji: '💎',
		color: '#FFD700',
		glowColor: '#FFF700',
		rarity: 'legendary'
	},
	B: {
		id: 'B',
		name: 'Star',
		emoji: '⭐',
		color: '#C0C0C0',
		glowColor: '#E0E0E0',
		rarity: 'rare'
	},
	C: {
		id: 'C',
		name: 'Crown',
		emoji: '👑',
		color: '#CD7F32',
		glowColor: '#FF9F42',
		rarity: 'uncommon'
	},
	D: {
		id: 'D',
		name: 'Clover',
		emoji: '🍀',
		color: '#32CD32',
		glowColor: '#42FF42',
		rarity: 'common'
	},
	_: {
		id: '_',
		name: 'Blank',
		emoji: '　',
		color: '#666666',
		glowColor: '#888888',
		rarity: 'common'
	}
};

/**
 * Default paytable (these will be fetched from contract in production)
 */
export const DEFAULT_PAYTABLE: SymbolPayouts[] = [
	{
		symbol: 'A',
		displayName: 'Diamond',
		match3: 50,
		match4: 200,
		match5: 1000
	},
	{
		symbol: 'B',
		displayName: 'Star',
		match3: 25,
		match4: 100,
		match5: 500
	},
	{
		symbol: 'C',
		displayName: 'Crown',
		match3: 15,
		match4: 50,
		match5: 250
	},
	{
		symbol: 'D',
		displayName: 'Clover',
		match3: 5,
		match4: 20,
		match5: 100
	}
];

/**
 * All 20 payline patterns
 * Pattern format: [row for reel0, row for reel1, row for reel2, row for reel3, row for reel4]
 * Row indices: 0=top, 1=middle, 2=bottom
 */
export const PAYLINE_PATTERNS: PaylinePattern[] = [
	// Straight lines (1-5)
	[1, 1, 1, 1, 1], // 1. Middle horizontal
	[0, 0, 0, 0, 0], // 2. Top horizontal
	[2, 2, 2, 2, 2], // 3. Bottom horizontal

	// V-shapes and inverted V-shapes (4-7)
	[0, 1, 2, 1, 0], // 4. V-shape
	[2, 1, 0, 1, 2], // 5. Inverted V-shape
	[1, 0, 1, 2, 1], // 6. W-shape (down-up-down-up)
	[1, 2, 1, 0, 1], // 7. M-shape (up-down-up-down)

	// Zigzag patterns (8-11)
	[0, 0, 1, 2, 2], // 8. Down diagonal zigzag
	[2, 2, 1, 0, 0], // 9. Up diagonal zigzag
	[0, 1, 1, 1, 0], // 10. Arch
	[2, 1, 1, 1, 2], // 11. Inverted arch

	// Wave patterns (12-15)
	[1, 0, 0, 0, 1], // 12. Shallow U
	[1, 2, 2, 2, 1], // 13. Shallow inverted U
	[0, 1, 0, 1, 0], // 14. Wave up-down-up-down
	[2, 1, 2, 1, 2], // 15. Wave down-up-down-up

	// Complex patterns (16-20)
	[0, 2, 0, 2, 0], // 16. Big wave
	[2, 0, 2, 0, 2], // 17. Inverted big wave
	[1, 1, 0, 1, 1], // 18. Peak in middle
	[1, 1, 2, 1, 1], // 19. Valley in middle
	[0, 1, 2, 2, 2] // 20. Ascending stairs
];

/**
 * Betting constants (in microVOI, 1 VOI = 1,000,000 microVOI)
 */
export const BETTING_CONSTANTS = {
	MIN_BET_PER_LINE: 1_000_000, // 1 VOI
	MAX_BET_PER_LINE: 100_000_000, // 100 VOI
	MIN_PAYLINES: 1,
	MAX_PAYLINES: 20,
	DEFAULT_BET_PER_LINE: 1_000_000, // 1 VOI
	DEFAULT_PAYLINES: 1,

	// Quick bet presets (in VOI)
	QUICK_BET_AMOUNTS: [1, 2, 5, 10, 25, 50],

	// Decimals
	VOI_DECIMALS: 6,
	DISPLAY_DECIMALS: 2,

	// Reserve for transaction fees
	TRANSACTION_FEE_RESERVE: 1_000_000 // 1 VOI
} as const;

/**
 * Animation timing constants (in milliseconds)
 */
export const ANIMATION_TIMING = {
	// Reel spin durations
	SPIN_DURATION_MIN: 2000,
	SPIN_DURATION_MAX: 3000,
	REEL_STOP_DELAY: 200, // Delay between each reel stopping

	// Win celebration durations
	WIN_CELEBRATION_SMALL: 1500,
	WIN_CELEBRATION_MEDIUM: 2500,
	WIN_CELEBRATION_LARGE: 4000,
	WIN_CELEBRATION_JACKPOT: 6000,

	// Payline highlight
	PAYLINE_HIGHLIGHT_DURATION: 800,
	PAYLINE_CYCLE_DELAY: 400,

	// Auto-spin
	AUTO_SPIN_DELAY: 500, // Delay between auto-spins

	// Symbol animation
	SYMBOL_FLIP_DURATION: 300,
	SYMBOL_GLOW_DURATION: 600
} as const;

/**
 * Game configuration defaults
 */
export const GAME_DEFAULTS = {
	REEL_COUNT: 5,
	VISIBLE_ROWS: 3,
	REEL_LENGTH: 100,
	MAX_CONCURRENT_SPINS: 10,
	AUTO_SPIN_MAX_COUNT: 100,
	BALANCE_POLL_INTERVAL: 5000 // Poll balance every 5 seconds
} as const;

/**
 * Utility functions
 */

/**
 * Convert microVOI to VOI
 */
export function microVoiToVoi(microVoi: number, decimals = 2): string {
	return (microVoi / 1_000_000).toFixed(decimals);
}

/**
 * Convert VOI to microVOI
 */
export function voiToMicroVoi(voi: number): number {
	return Math.round(voi * 1_000_000);
}

/**
 * Format VOI with appropriate decimals
 */
export function formatVoi(microVoi: number, showDecimals = true): string {
	const voi = microVoi / 1_000_000;

	if (voi >= 1000) {
		return `${(voi / 1000).toFixed(1)}K VOI`;
	}

	if (showDecimals) {
		return `${voi.toFixed(BETTING_CONSTANTS.DISPLAY_DECIMALS)} VOI`;
	}

	return `${Math.floor(voi)} VOI`;
}

/**
 * Validate bet amount
 */
export function isValidBetAmount(betPerLine: number): boolean {
	return (
		betPerLine >= BETTING_CONSTANTS.MIN_BET_PER_LINE &&
		betPerLine <= BETTING_CONSTANTS.MAX_BET_PER_LINE
	);
}

/**
 * Validate payline count
 */
export function isValidPaylineCount(paylines: number): boolean {
	return (
		paylines >= BETTING_CONSTANTS.MIN_PAYLINES && paylines <= BETTING_CONSTANTS.MAX_PAYLINES
	);
}

/**
 * Calculate total bet
 */
export function calculateTotalBet(betPerLine: number, paylines: number): number {
	return betPerLine * paylines;
}

/**
 * Get symbol display info
 */
export function getSymbolDisplay(symbolId: SymbolId): SymbolDisplay {
	return SYMBOL_DISPLAY[symbolId] || SYMBOL_DISPLAY['_'];
}

/**
 * Get payline pattern
 */
export function getPaylinePattern(index: number): PaylinePattern | null {
	return PAYLINE_PATTERNS[index] || null;
}

/**
 * Get color for symbol
 */
export function getSymbolColor(symbolId: SymbolId): string {
	return SYMBOL_DISPLAY[symbolId]?.color || '#FFFFFF';
}

/**
 * Get glow color for symbol
 */
export function getSymbolGlowColor(symbolId: SymbolId): string {
	return SYMBOL_DISPLAY[symbolId]?.glowColor || '#FFFFFF';
}
