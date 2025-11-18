/**
 * W2W Win Highlighter
 *
 * Functions to determine which grid positions should be highlighted for each win.
 * Creates sequential win display steps for the ReelGrid component.
 */

import type { SymbolId } from '../types';
import type { WaysWin } from '../types/results';
import {
  isWild,
  getConsecutiveReelCount,
  W2W_SYMBOLS,
  countScatterSymbols
} from './w2wPayoutCalculator';

/**
 * Grid position (reel, row)
 */
export interface GridPosition {
  reel: number;
  row: number;
}

/**
 * Win step for sequential highlighting
 */
export interface WinStep {
  /** Type of win step */
  type: 'symbol' | 'jackpot' | 'bonus';
  /** Ways win data (for symbol wins) */
  waysWin?: WaysWin;
  /** Grid positions to highlight */
  positions: GridPosition[];
  /** Payout for this step */
  payout: number;
  /** Breakdown for display (symbol wins only) */
  breakdown?: {
    symbol: SymbolId;
    basePayout: number;
    ways: number;
    wildMultiplier: number;
  };
  /** Message for special features */
  message?: string;
  /** Duration to display this step (ms) */
  duration: number;
}

/**
 * Get all grid positions that are part of a specific ways win
 * @param grid 5x3 grid [reel][row]
 * @param waysWin The ways win to get positions for
 * @returns Array of grid positions that should be highlighted
 */
export function getWinningPositions(grid: SymbolId[][], waysWin: WaysWin): GridPosition[] {
  const positions: GridPosition[] = [];
  const { symbol, matchLength } = waysWin;

  // Get contributing reels
  const { contributingReels } = getConsecutiveReelCount(grid, symbol);

  // For each contributing reel, find positions with matching symbol or wild
  for (const reelIndex of contributingReels) {
    if (reelIndex >= matchLength) break; // Only highlight up to match length

    for (let row = 0; row < 3; row++) {
      const gridSymbol = grid[reelIndex][row];
      // Highlight if it matches the symbol or is a wild
      if (gridSymbol === symbol || isWild(gridSymbol)) {
        positions.push({ reel: reelIndex, row });
      }
    }
  }

  return positions;
}

/**
 * Get all positions of a scatter symbol (HOV or BONUS)
 * @param grid 5x3 grid [reel][row]
 * @param scatterSymbol The scatter symbol to find ('E' or 'F')
 * @returns Array of grid positions
 */
export function getScatterPositions(grid: SymbolId[][], scatterSymbol: SymbolId): GridPosition[] {
  const positions: GridPosition[] = [];

  for (let reel = 0; reel < 5; reel++) {
    for (let row = 0; row < 3; row++) {
      if (grid[reel][row] === scatterSymbol) {
        positions.push({ reel, row });
      }
    }
  }

  return positions;
}

/**
 * Create a sequence of win steps for sequential highlighting
 * @param waysWins Array of ways wins from payout calculator
 * @param grid The result grid
 * @param jackpotAmount Jackpot amount (if triggered)
 * @param bonusSpinsAwarded Number of bonus spins awarded (0 or 8)
 * @param stepDuration Duration for each symbol win step (ms)
 * @returns Array of win steps in display order
 */
export function createWinSequence(
  waysWins: WaysWin[],
  grid: SymbolId[][],
  jackpotAmount: number = 0,
  bonusSpinsAwarded: number = 0,
  stepDuration: number = 3000
): WinStep[] {
  const sequence: WinStep[] = [];

  // 1. Add symbol wins (sorted by payout descending for drama)
  const sortedWins = [...waysWins].sort((a, b) => b.payout - a.payout);

  for (const waysWin of sortedWins) {
    const positions = getWinningPositions(grid, waysWin);

    // Calculate base payout for breakdown display
    // Ensure wildMultiplier defaults to 1 if missing/invalid
    const wildMultiplier = (waysWin.wildMultiplier && Number.isFinite(waysWin.wildMultiplier) && waysWin.wildMultiplier > 0)
      ? waysWin.wildMultiplier
      : 1;
    
    // Ensure ways is valid and > 0
    const ways = (waysWin.ways && Number.isFinite(waysWin.ways) && waysWin.ways > 0)
      ? waysWin.ways
      : 1;
    
    // Calculate basePayout with validation to avoid NaN/Infinity
    let basePayout = 0;
    const divisor = ways * wildMultiplier;
    if (divisor > 0 && Number.isFinite(waysWin.payout) && waysWin.payout >= 0) {
      const calculated = waysWin.payout / divisor;
      if (Number.isFinite(calculated) && calculated >= 0) {
        basePayout = Math.floor(calculated);
      }
    }

    sequence.push({
      type: 'symbol',
      waysWin,
      positions,
      payout: waysWin.payout,
      breakdown: {
        symbol: waysWin.symbol,
        basePayout,
        ways: ways,
        wildMultiplier: wildMultiplier
      },
      duration: stepDuration
    });
  }

  // 2. Add jackpot step if triggered (after symbol wins)
  if (jackpotAmount > 0) {
    const hovPositions = getScatterPositions(grid, W2W_SYMBOLS.HOV);
    const hovCount = countScatterSymbols(grid, W2W_SYMBOLS.HOV);

    sequence.push({
      type: 'jackpot',
      positions: hovPositions,
      payout: jackpotAmount,
      message: `🎰 JACKPOT! ${hovCount} HOV symbols`,
      duration: 6000 // Longer duration for jackpot celebration
    });
  }

  // 3. Add bonus step if triggered (after jackpot)
  if (bonusSpinsAwarded > 0) {
    const bonusPositions = getScatterPositions(grid, W2W_SYMBOLS.BONUS);
    const bonusCount = countScatterSymbols(grid, W2W_SYMBOLS.BONUS);

    sequence.push({
      type: 'bonus',
      positions: bonusPositions,
      payout: 0, // Bonus doesn't add to payout, just awards spins
      message: `🎁 ${bonusCount} BONUS! ${bonusSpinsAwarded} Free Spins`,
      duration: 6000 // Longer duration for bonus celebration
    });
  }

  return sequence;
}

/**
 * Check if a grid position is part of a specific win step
 * @param position Position to check
 * @param step Win step to check against
 * @returns True if position should be highlighted for this step
 */
export function isPositionInStep(position: GridPosition, step: WinStep): boolean {
  return step.positions.some(
    (p) => p.reel === position.reel && p.row === position.row
  );
}

/**
 * Get symbol name for display
 * @param symbol Symbol ID
 * @returns Human-readable symbol name
 */
export function getSymbolName(symbol: SymbolId): string {
  const symbolNames: Record<SymbolId, string> = {
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
    'A': '9',
    'B': 'Wild',
    'C': 'Wild 2x',
    'D': 'Wild 3x',
    'E': 'HOV',
    'F': 'Bonus'
  };
  return symbolNames[symbol] || symbol;
}

/**
 * Format payout amount for display
 * @param amount Payout amount in credits or microVOI
 * @param mode Game mode (0=bonus, 1=credit, 2=network, 4=token)
 * @returns Formatted string
 */
export function formatPayoutAmount(amount: number, mode?: number): string {
  if (mode === undefined || mode === 0 || mode === 1) {
    // Bonus/Credit mode: display as credits
    return `${amount.toLocaleString()} credits`;
  } else if (mode === 2) {
    // Network mode: display as VOI
    const voi = amount / 1_000_000;
    return `${voi.toFixed(6)} VOI`;
  } else if (mode === 4) {
    // Token mode: display as tokens (format TBD)
    return `${amount.toLocaleString()} tokens`;
  }
  return `${amount.toLocaleString()}`;
}

/**
 * Get cumulative payout up to a specific step
 * @param sequence Full win sequence
 * @param stepIndex Current step index
 * @returns Cumulative payout
 */
export function getCumulativePayout(sequence: WinStep[], stepIndex: number): number {
  let total = 0;
  for (let i = 0; i <= stepIndex; i++) {
    total += sequence[i].payout;
  }
  return total;
}

/**
 * Calculate total duration of win sequence
 * @param sequence Win sequence
 * @returns Total duration in ms
 */
export function getTotalSequenceDuration(sequence: WinStep[]): number {
  return sequence.reduce((total, step) => total + step.duration, 0);
}
