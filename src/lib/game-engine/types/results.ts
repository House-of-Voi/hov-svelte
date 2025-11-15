/**
 * Game Result Types
 *
 * These types define the outcomes and results from slot machine spins.
 */

import type { SymbolId, PaylinePattern } from './config';

/**
 * Win level classification for celebration purposes
 */
export type WinLevel = 'small' | 'medium' | 'large' | 'jackpot';

/**
 * A single winning payline result
 */
export interface WinningLine {
  /** Payline index (0-19) */
  paylineIndex: number;
  /** Pattern that matched */
  pattern: PaylinePattern;
  /** Symbol that matched */
  symbol: SymbolId;
  /** Number of consecutive matches (3, 4, or 5) */
  matchCount: number;
  /** Payout for this line in microVOI */
  payout: number;
}

/**
 * Ways-to-win result for W2W games
 */
export interface WaysWin {
  /** Symbol that matched */
  symbol: SymbolId;
  /** Number of ways (combinations) */
  ways: number;
  /** Match length (3, 4, or 5 consecutive reels) */
  matchLength: number;
  /** Payout for this win in credits or microVOI */
  payout: number;
  /** Wild multiplier applied */
  wildMultiplier: number;
}

/**
 * Complete outcome of a spin from the blockchain
 * Supports both 5reel (paylines) and w2w (ways-to-win) formats
 */
export interface SpinOutcome {
  /** The grid of symbols (5reel: 3x5, w2w: 3x5) */
  grid: SymbolId[][];
  /** All winning paylines (5reel only) */
  winningLines?: WinningLine[];
  /** Ways-to-win results (w2w only) */
  waysWins?: WaysWin[];
  /** Total payout across all wins in microVOI or credits */
  totalPayout: number;
  /** Block number where outcome was determined */
  blockNumber: number;
  /** Block seed used for RNG */
  blockSeed: string;
  /** Bet key used for RNG */
  betKey: string;
  /** Whether this outcome has been verified */
  verified?: boolean;
  /** Bonus spins awarded (w2w only) */
  bonusSpinsAwarded?: number;
  /** Jackpot hit (w2w only) */
  jackpotHit?: boolean;
  /** Jackpot amount (w2w only) */
  jackpotAmount?: number;
}

/**
 * Complete result of a spin including context
 * Supports both 5reel and w2w formats
 */
export interface SpinResult {
  /** Spin identifier */
  id: string;
  /** Outcome from blockchain */
  outcome: SpinOutcome;
  /** Bet amount per line (5reel only) */
  betPerLine?: number;
  /** Number of paylines (5reel only) */
  paylines?: number;
  /** Bet amount (w2w only) */
  betAmount?: number;
  /** Mode (w2w only: 0=bonus, 1=credit, 2=network, 4=token) */
  mode?: number;
  /** Total bet amount */
  totalBet: number;
  /** Total winnings */
  winnings: number;
  /** Net profit (winnings - totalBet) */
  netProfit: number;
  /** Win level for celebration */
  winLevel: WinLevel;
  /** Whether this was a winning spin */
  isWin: boolean;
  /** Timestamp when spin completed */
  timestamp: number;
  /** Transaction ID for spin */
  spinTxId: string;
  /** Transaction ID for claim */
  claimTxId: string;
}

/**
 * Transaction result from blockchain
 */
export interface TransactionResult {
  /** Transaction ID */
  txId: string;
  /** Block number where transaction was confirmed */
  confirmedRound: number;
  /** Whether transaction was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Bet submission parameters for 5reel games
 */
export interface SpinParams5Reel {
  /** Bet amount per line in microVOI */
  betPerLine: number;
  /** Number of paylines (1-20) */
  paylines: number;
  /** Wallet address placing the bet */
  walletAddress: string;
}

/**
 * Bet submission parameters for W2W games
 */
export interface SpinParamsW2W {
  /** Bet amount in credits or microVOI (depending on mode) */
  betAmount: number;
  /** Spin index (unique per user) */
  index: number;
  /** Mode: 0 = bonus, 1 = credit, 2 = network, 4 = token */
  mode: number;
  /** Reserved parameter (unused, typically 0) */
  reserved?: number;
  /** Wallet address placing the bet */
  walletAddress: string;
}

/**
 * Bet submission parameters (union type for both game types)
 */
export type SpinParams = SpinParams5Reel | SpinParamsW2W;

/**
 * Bet key returned from spin transaction
 */
export interface BetKey {
  /** 56-byte bet key for claiming */
  key: string;
  /** Transaction ID */
  txId: string;
  /** Block where bet was placed */
  submitBlock: number;
  /** Block where outcome can be claimed */
  claimBlock: number;
  /** Bet key as hex string (for compatibility) */
  betKey?: string;
}

/**
 * Claim result from blockchain
 */
export interface ClaimResult {
  /** The outcome grid */
  grid: SymbolId[][];
  /** Winning paylines */
  winningLines: WinningLine[];
  /** Total payout */
  totalPayout: number;
  /** Transaction ID */
  txId: string;
  /** Block number */
  blockNumber: number;
  /** Block seed */
  blockSeed: string;
}

/**
 * Provably fair verification data
 */
export interface ProvablyFairData {
  /** Bet key used */
  betKey: string;
  /** Block seed from blockchain */
  blockSeed: string;
  /** Block number */
  blockNumber: number;
  /** Resulting reel tops (5 positions) */
  reelTops: number[];
  /** Resulting grid */
  grid: SymbolId[][];
  /** Whether verification passed */
  verified: boolean;
  /** Verification steps for transparency */
  verificationSteps: {
    step: string;
    value: string;
  }[];
}

/**
 * Balance information
 */
export interface BalanceInfo {
  /** Current balance in microVOI */
  current: number;
  /** Balance reserved for pending spins */
  reserved: number;
  /** Available balance (current - reserved) */
  available: number;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Win celebration data for UI
 */
export interface WinCelebration {
  /** Spin result that triggered celebration */
  result: SpinResult;
  /** Win level */
  level: WinLevel;
  /** Multiplier achieved (winnings / totalBet) */
  multiplier: number;
  /** Winning symbols */
  symbols: SymbolId[];
  /** Should show big win animation */
  showBigWin: boolean;
  /** Should play win sound */
  playSound: boolean;
}

/**
 * Helper function to determine win level
 */
export function getWinLevel(winnings: number, totalBet: number): WinLevel {
  if (totalBet === 0) return 'small';

  const multiplier = winnings / totalBet;

  if (multiplier >= 100) return 'jackpot';
  if (multiplier >= 20) return 'large';
  if (multiplier >= 5) return 'medium';
  return 'small';
}

/**
 * Helper function to check if result is a win
 */
export function isWinningResult(outcome: SpinOutcome): boolean {
  return outcome.totalPayout > 0 && outcome.winningLines.length > 0;
}
