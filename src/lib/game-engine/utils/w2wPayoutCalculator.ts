/**
 * W2W Payout Calculator
 *
 * Client-side implementation of the W2W slot machine payout calculation logic.
 * Mirrors the contract's _calculate_grid_payout algorithm to determine payouts
 * for each symbol in a 243-ways-to-win system.
 */

import type { SymbolId } from '../types';
import type { WaysWin } from '../types/results';

/**
 * Symbol definitions matching contract
 */
export const W2W_SYMBOLS = {
  BUFFALO: '0',
  EAGLE: '1',
  COUGAR: '2',
  ELK: '3',
  WOLF: '4',
  A: '5',
  K: '6',
  Q: '7',
  J: '8',
  TEN: '9',
  NINE: 'A',
  WILD1: 'B',
  WILD2: 'C',
  WILD3: 'D',
  HOV: 'E',
  BONUS: 'F',
} as const;

/**
 * All evaluable symbols (contract iterates 0-F)
 */
export const ALL_SYMBOLS: SymbolId[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];

/**
 * W2W Paytable - Maps symbol to [3-match, 4-match, 5-match] payouts
 * Extracted from contract paytable array
 */
export const W2W_PAYTABLE: Record<SymbolId, [number, number, number]> = {
  '0': [68, 520, 900],    // BUFFALO
  '1': [124, 270, 500],   // EAGLE
  '2': [40, 90, 150],     // COUGAR
  '3': [39, 120, 260],    // ELK
  '4': [32, 105, 230],    // WOLF
  '5': [18, 65, 150],     // A
  '6': [14, 55, 130],     // K
  '7': [12, 45, 120],     // Q
  '8': [5, 18, 45],       // J
  '9': [4, 16, 39],       // TEN
  'A': [3, 14, 37],       // NINE
  'B': [0, 0, 0],         // WILD1 (no direct payout)
  'C': [0, 0, 0],         // WILD2 (no direct payout)
  'D': [0, 0, 0],         // WILD3 (no direct payout)
  'E': [0, 0, 0],         // HOV (scatter, no line payout)
  'F': [0, 0, 0],         // BONUS (scatter, no line payout)
};

/**
 * Game constants
 */
const NUM_REELS = 5;
const NUM_ROWS = 3;
const BONUS_LINE_MULT = 15000;
const BONUS_LINE_MULT_DIVISOR = 10000;
const JACKPOT_TRIGGER_COUNT = 3;
const BONUS_TRIGGER_COUNT = 2;

/**
 * Check if a symbol is a wild
 */
export function isWild(symbol: SymbolId): boolean {
  return symbol === 'B' || symbol === 'C' || symbol === 'D';
}

/**
 * Check if a symbol is a scatter (HOV or BONUS)
 */
export function isScatter(symbol: SymbolId): boolean {
  return symbol === 'E' || symbol === 'F';
}

/**
 * Get the wild multiplier for a wild symbol
 */
export function getWildMultiplier(symbol: SymbolId): number {
  if (symbol === 'D') return 3; // WILD3
  if (symbol === 'C') return 2; // WILD2
  if (symbol === 'B') return 1; // WILD1
  return 0;
}

/**
 * Get base payout from paytable for a symbol and match length
 * @param symbol The symbol that matched
 * @param matchLength Number of consecutive reels (3, 4, or 5)
 * @returns Base payout value, or 0 if no payout
 */
export function getBasePayoutForSymbol(symbol: SymbolId, matchLength: number): number {
  if (matchLength < 3 || matchLength > 5) return 0;

  const payouts = W2W_PAYTABLE[symbol];
  if (!payouts) return 0;

  // matchLength 3 = index 0, 4 = index 1, 5 = index 2
  return payouts[matchLength - 3];
}

/**
 * Count how many times a symbol (or wild) appears on a specific reel
 * @param reelSymbols Array of 3 symbols for one reel
 * @param targetSymbol The symbol we're looking for
 * @returns Count of matching symbols (including wilds)
 */
export function getSymbolMatchesOnReel(reelSymbols: SymbolId[], targetSymbol: SymbolId): number {
  // Wilds and scatters don't match anything (they have no payouts themselves)
  if (isWild(targetSymbol) || isScatter(targetSymbol)) {
    return 0;
  }

  let count = 0;
  for (const symbol of reelSymbols) {
    // Direct match or wild substitution
    if (symbol === targetSymbol || isWild(symbol)) {
      count++;
    }
  }
  return count;
}

/**
 * Calculate the number of consecutive reels (from left) where symbol appears
 * @param grid 5x3 grid [reel][row]
 * @param symbol Symbol to check
 * @returns Object with matchLength and contributing reel indices
 */
export function getConsecutiveReelCount(
  grid: SymbolId[][],
  symbol: SymbolId
): { matchLength: number; contributingReels: number[] } {
  const contributingReels: number[] = [];

  // Check if symbol appears on first reel (required for any payout)
  const firstReelMatches = getSymbolMatchesOnReel(grid[0], symbol);
  if (firstReelMatches === 0) {
    return { matchLength: 0, contributingReels: [] };
  }

  // Count consecutive reels from left
  for (let reel = 0; reel < NUM_REELS; reel++) {
    const matches = getSymbolMatchesOnReel(grid[reel], symbol);
    if (matches === 0) {
      break; // Streak broken
    }
    contributingReels.push(reel);
  }

  return {
    matchLength: contributingReels.length,
    contributingReels
  };
}

/**
 * Calculate the number of ways a symbol wins
 * @param grid 5x3 grid [reel][row]
 * @param symbol Symbol to calculate ways for
 * @returns Total number of ways (combinations)
 */
export function calculateWaysForSymbol(grid: SymbolId[][], symbol: SymbolId): number {
  const { matchLength, contributingReels } = getConsecutiveReelCount(grid, symbol);

  if (matchLength < 3) return 0; // Minimum 3 consecutive reels required

  // Calculate ways by multiplying matches on each contributing reel
  let ways = 1;
  for (const reelIndex of contributingReels) {
    const matches = getSymbolMatchesOnReel(grid[reelIndex], symbol);
    ways *= matches;
  }

  return ways;
}

/**
 * Get the highest wild multiplier on the contributing reels
 * @param grid 5x3 grid [reel][row]
 * @param contributingReels Array of reel indices that contributed to the win
 * @returns Highest wild multiplier (1, 2, 3, or 1 if no wilds)
 */
export function getHighestWildMultiplier(grid: SymbolId[][], contributingReels: number[]): number {
  let highestMultiplier = 1; // Default 1x (no wild)

  for (const reelIndex of contributingReels) {
    for (const symbol of grid[reelIndex]) {
      const multiplier = getWildMultiplier(symbol);
      if (multiplier > highestMultiplier) {
        highestMultiplier = multiplier;
      }
      // Early exit if we find WILD3 (highest possible)
      if (highestMultiplier === 3) {
        return 3;
      }
    }
  }

  return highestMultiplier;
}

/**
 * Calculate payout for a single symbol
 * @param grid 5x3 grid [reel][row]
 * @param symbol Symbol to calculate payout for
 * @returns WaysWin object or null if no win
 */
export function calculateSymbolPayout(grid: SymbolId[][], symbol: SymbolId): WaysWin | null {
  // Get consecutive reel count
  const { matchLength, contributingReels } = getConsecutiveReelCount(grid, symbol);

  // Minimum 3 consecutive reels required
  if (matchLength < 3) return null;

  // Get base payout from paytable
  const basePayout = getBasePayoutForSymbol(symbol, matchLength);
  if (basePayout === 0) return null; // No payout for this symbol

  // Calculate ways
  const ways = calculateWaysForSymbol(grid, symbol);
  if (ways === 0) return null;

  // Get wild multiplier
  const wildMultiplier = getHighestWildMultiplier(grid, contributingReels);

  // Calculate total payout: base × ways × wild_multiplier
  const payout = basePayout * ways * wildMultiplier;

  return {
    symbol,
    ways,
    matchLength,
    payout,
    wildMultiplier
  };
}

/**
 * Calculate all payouts for a grid (243 ways to win)
 * This mirrors the contract's _calculate_grid_payout function
 *
 * @param grid 5x3 grid [reel][row]
 * @returns Array of WaysWin objects for each winning symbol
 */
export function calculateW2WPayouts(grid: SymbolId[][]): WaysWin[] {
  const wins: WaysWin[] = [];

  // Evaluate all 16 symbols (0-F)
  for (const symbol of ALL_SYMBOLS) {
    const win = calculateSymbolPayout(grid, symbol);
    if (win) {
      wins.push(win);
    }
  }

  return wins;
}

/**
 * Calculate total payout from all ways wins
 * @param waysWins Array of ways wins
 * @returns Total payout (sum of all wins)
 */
export function calculateTotalPayout(waysWins: WaysWin[]): number {
  return waysWins.reduce((total, win) => total + win.payout, 0);
}

/**
 * Apply bonus multiplier to payout (during bonus spins)
 * @param payout Base payout
 * @returns Payout with 1.5x multiplier applied
 */
export function applyBonusMultiplier(payout: number): number {
  return Math.floor((payout * BONUS_LINE_MULT) / BONUS_LINE_MULT_DIVISOR);
}

/**
 * Count scatter symbols on grid
 * @param grid 5x3 grid [reel][row]
 * @param scatterSymbol The scatter symbol to count ('E' for HOV, 'F' for BONUS)
 * @returns Count of scatter symbols
 */
export function countScatterSymbols(grid: SymbolId[][], scatterSymbol: SymbolId): number {
  let count = 0;
  for (const reel of grid) {
    for (const symbol of reel) {
      if (symbol === scatterSymbol) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Check if grid triggers jackpot (3+ HOV symbols)
 * @param grid 5x3 grid [reel][row]
 * @returns True if jackpot triggered
 */
export function isJackpotTriggered(grid: SymbolId[][]): boolean {
  return countScatterSymbols(grid, W2W_SYMBOLS.HOV) >= JACKPOT_TRIGGER_COUNT;
}

/**
 * Check if grid triggers bonus (2+ BONUS symbols)
 * @param grid 5x3 grid [reel][row]
 * @returns True if bonus triggered
 */
export function isBonusTriggered(grid: SymbolId[][]): boolean {
  return countScatterSymbols(grid, W2W_SYMBOLS.BONUS) >= BONUS_TRIGGER_COUNT;
}

/**
 * Calculate complete payout including line wins, bonus multiplier, and jackpot
 * This mirrors the contract's _calculate_grid_payout_with_bonus_and_jackpot
 *
 * @param grid 5x3 grid [reel][row]
 * @param isBonusSpin Whether this is a bonus spin
 * @param jackpotValue Current jackpot value
 * @returns Complete payout breakdown
 */
export interface CompletePayoutResult {
  /** Line wins (ways to win) */
  waysWins: WaysWin[];
  /** Total line payout (before bonus/jackpot) */
  linePayout: number;
  /** Total payout (including bonus/jackpot) */
  totalPayout: number;
  /** Bonus spins awarded (0 or 8) */
  bonusSpinsAwarded: number;
  /** Jackpot hit (0 or 1) */
  jackpotHit: number;
  /** Jackpot amount (if hit) */
  jackpotAmount: number;
}

export function calculateCompletePayout(
  grid: SymbolId[][],
  isBonusSpin: boolean = false,
  jackpotValue: number = 0
): CompletePayoutResult {
  // Calculate base line wins
  const waysWins = calculateW2WPayouts(grid);
  let linePayout = calculateTotalPayout(waysWins);

  // Apply bonus multiplier if in bonus spin
  if (isBonusSpin) {
    linePayout = applyBonusMultiplier(linePayout);
  }

  let totalPayout = linePayout;

  // Check jackpot trigger
  let jackpotHit = 0;
  let jackpotAmount = 0;
  if (isJackpotTriggered(grid)) {
    totalPayout += jackpotValue;
    jackpotHit = 1;
    jackpotAmount = jackpotValue;
  }

  // Check bonus trigger
  let bonusSpinsAwarded = 0;
  if (isBonusTriggered(grid)) {
    bonusSpinsAwarded = 8; // BONUS_SPINS_AWARDED constant
  }

  return {
    waysWins,
    linePayout,
    totalPayout,
    bonusSpinsAwarded,
    jackpotHit,
    jackpotAmount
  };
}
