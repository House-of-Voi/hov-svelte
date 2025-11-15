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
 * W2W symbol display mappings (16 symbols: 0-9, A-F)
 */
export const W2W_SYMBOL_DISPLAY: Record<string, SymbolDisplay> = {
	'0': { id: '0' as SymbolId, name: 'Buffalo', emoji: '🐃', color: '#8B4513', glowColor: '#A0522D', rarity: 'rare' },
	'1': { id: '1' as SymbolId, name: 'Eagle', emoji: '🦅', color: '#4169E1', glowColor: '#6495ED', rarity: 'rare' },
	'2': { id: '2' as SymbolId, name: 'Cougar', emoji: '🐆', color: '#FF6347', glowColor: '#FF7F50', rarity: 'uncommon' },
	'3': { id: '3' as SymbolId, name: 'Elk', emoji: '🦌', color: '#CD853F', glowColor: '#DEB887', rarity: 'uncommon' },
	'4': { id: '4' as SymbolId, name: 'Wolf', emoji: '🐺', color: '#708090', glowColor: '#778899', rarity: 'uncommon' },
	'5': { id: '5' as SymbolId, name: 'A', emoji: '🅰️', color: '#FFD700', glowColor: '#FFE55C', rarity: 'common' },
	'6': { id: '6' as SymbolId, name: 'K', emoji: '👑', color: '#FFD700', glowColor: '#FFE55C', rarity: 'common' },
	'7': { id: '7' as SymbolId, name: 'Q', emoji: '👸', color: '#FFD700', glowColor: '#FFE55C', rarity: 'common' },
	'8': { id: '8' as SymbolId, name: 'J', emoji: '🃏', color: '#C0C0C0', glowColor: '#E0E0E0', rarity: 'common' },
	'9': { id: '9' as SymbolId, name: '10', emoji: '🔟', color: '#C0C0C0', glowColor: '#E0E0E0', rarity: 'common' },
	'A': { id: 'A' as SymbolId, name: '9', emoji: '9️⃣', color: '#C0C0C0', glowColor: '#E0E0E0', rarity: 'common' },
	'B': { id: 'B' as SymbolId, name: 'Wild', emoji: '🌟', color: '#FFD700', glowColor: '#FFE55C', rarity: 'rare' },
	'C': { id: 'C' as SymbolId, name: 'Wild 2x', emoji: '✨', color: '#FF6B00', glowColor: '#FF8C00', rarity: 'rare' },
	'D': { id: 'D' as SymbolId, name: 'Wild 3x', emoji: '💫', color: '#FF1493', glowColor: '#FF69B4', rarity: 'legendary' },
	'E': { id: 'E' as SymbolId, name: 'HOV', emoji: '🎰', color: '#FFD700', glowColor: '#FFE55C', rarity: 'legendary' },
	'F': { id: 'F' as SymbolId, name: 'Bonus', emoji: '🎁', color: '#00FF00', glowColor: '#32CD32', rarity: 'rare' }
};

/**
 * Get symbol display (supports both 5reel and W2W)
 */
export function getSymbolDisplay(symbol: SymbolId, gameType: '5reel' | 'w2w' = '5reel'): SymbolDisplay {
	if (gameType === 'w2w') {
		return W2W_SYMBOL_DISPLAY[symbol] || {
			id: symbol,
			name: symbol,
			emoji: '❓',
			color: '#666666',
			glowColor: '#888888',
			rarity: 'common'
		};
	}
	return SYMBOL_DISPLAY[symbol] || SYMBOL_DISPLAY['_'];
}

/**
 * Default paytable (matches contract multipliers from paylineEvaluator)
 */
export const DEFAULT_PAYTABLE: SymbolPayouts[] = [
	{
		symbol: 'A',
		displayName: 'Diamond',
		match3: 200,
		match4: 1000,
		match5: 10000
	},
	{
		symbol: 'B',
		displayName: 'Gold',
		match3: 60,
		match4: 200,
		match5: 1000
	},
	{
		symbol: 'C',
		displayName: 'Silver',
		match3: 30,
		match4: 100,
		match5: 500
	},
	{
		symbol: 'D',
		displayName: 'Bronze',
		match3: 10,
		match4: 55,
		match5: 250
	}
];

/**
 * All 20 payline patterns (matches contract patterns from VoiSlotMachineAdapter)
 * Pattern format: [row for reel0, row for reel1, row for reel2, row for reel3, row for reel4]
 * Row indices: 0=top, 1=middle, 2=bottom
 */
export const PAYLINE_PATTERNS: PaylinePattern[] = [
	// 1. Middle line
	[1, 1, 1, 1, 1],
	// 2. Top line
	[0, 0, 0, 0, 0],
	// 3. Bottom line
	[2, 2, 2, 2, 2],
	// 4. V shape
	[0, 1, 2, 1, 0],
	// 5. Inverted V
	[2, 1, 0, 1, 2],
	// 6. Diagonal down
	[0, 1, 1, 2, 2],
	// 7. Diagonal up
	[2, 1, 1, 0, 0],
	// 8. Zigzag top
	[0, 0, 1, 0, 0],
	// 9. Zigzag bottom
	[2, 2, 1, 2, 2],
	// 10. Staircase down
	[0, 1, 2, 2, 1],
	// 11. Staircase up
	[2, 1, 0, 0, 1],
	// 12. Slight diagonal
	[1, 0, 0, 0, 1],
	// 13. Slight diagonal
	[1, 2, 2, 2, 1],
	// 14. Top-bottom-top
	[0, 2, 0, 2, 0],
	// 15. Bottom-top-bottom
	[2, 0, 2, 0, 2],
	// 16. Outer rails up
	[0, 2, 1, 2, 0],
	// 17. Outer rails down
	[2, 0, 1, 0, 2],
	// 18. Left hook
	[0, 0, 1, 2, 2],
	// 19. Right hook
	[2, 2, 1, 0, 0],
	// 20. Wave
	[1, 0, 1, 2, 1]
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
