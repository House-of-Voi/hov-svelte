/**
 * PostMessage Communication Protocol Types
 *
 * Defines the message types used for communication between
 * third-party games and the GameBridge.
 *
 * Supports both 5reel (traditional paylines) and w2w (ways-to-win) game types.
 */

// ============================================================================
// NAMESPACE
// ============================================================================

/**
 * Required namespace for all postMessage communications.
 * Messages without this namespace will be filtered out to prevent
 * conflicts with browser extensions and other scripts.
 */
export const MESSAGE_NAMESPACE = 'com.houseofvoi';

// ============================================================================
// REQUEST MESSAGES (Game → Bridge)
// ============================================================================

/**
 * Spin request - accepts either 5reel or w2w payload format
 */
export interface SpinRequest {
  namespace: string;
  type: 'SPIN_REQUEST';
  payload: {
    spinId?: string; // Optional client-generated ID for tracking
  } & (
    | {
        // 5reel format
        paylines: number;
        betPerLine: number;
      }
    | {
        // w2w format
        betAmount: number;
        mode?: number; // 0=bonus, 1=credit, 2=VOI, 4=ARC200 (optional, defaults to reserved logic for backward compatibility)
        reserved: number; // 0 = regular spin, 1 = bonus spin (kept for backward compatibility)
      }
  );
}

export interface GetBalanceRequest {
  namespace: string;
  type: 'GET_BALANCE';
}

export interface GetCreditBalanceRequest {
  namespace: string;
  type: 'GET_CREDIT_BALANCE';
}

export interface GetConfigRequest {
  namespace: string;
  type: 'GET_CONFIG';
}

export interface InitRequest {
  namespace: string;
  type: 'INIT';
  payload?: {
    contractId?: string;
  };
}

export interface ExitRequest {
  namespace: string;
  type: 'EXIT';
}

/**
 * Request unlock - game requests the unlock modal to be shown
 */
export interface RequestUnlockRequest {
  namespace: string;
  type: 'REQUEST_UNLOCK';
}

/**
 * Request current spin queue state
 */
export interface GetSpinQueueRequest {
  namespace: string;
  type: 'GET_SPIN_QUEUE';
}

export type GameRequest =
  | SpinRequest
  | GetBalanceRequest
  | GetCreditBalanceRequest
  | GetConfigRequest
  | InitRequest
  | ExitRequest
  | RequestUnlockRequest
  | GetSpinQueueRequest;

// ============================================================================
// RESPONSE MESSAGES (Bridge → Game)
// ============================================================================

// 5reel-specific types
export interface WinningLine {
  paylineIndex: number;
  symbol: string;
  matchCount: number;
  payout: number; // VOI
}

// w2w-specific types
export interface WaysWin {
  symbol: string;
  ways: number;
  matchLength: number;
  payout: number; // credits or VOI
}

/**
 * Outcome message - supports both 5reel and w2w payload formats
 *
 * Grid Format: Column-major array structure
 * - Outer array: 5 reels (indices 0-4)
 * - Inner array: 3 rows per reel (indices 0-2)
 * - Access pattern: grid[reelIndex][rowIndex]
 * - Example: grid[0][0] = top symbol of reel 1
 *           grid[4][2] = bottom symbol of reel 5
 *
 * Both 5reel and w2w games use 5 reels × 3 rows.
 */
export interface OutcomeMessage {
  namespace: string;
  type: 'OUTCOME';
  payload: {
    spinId: string;
    grid: string[][]; // Column-major format: grid[reelIndex][rowIndex], 5 reels × 3 rows for both 5reel and w2w
    winnings: number; // VOI or credits depending on game type
    isWin: boolean;
    winLevel: 'none' | 'small' | 'medium' | 'large' | 'jackpot';
    totalBet: number;
  } & (
    | {
        // 5reel format
        winningLines: WinningLine[];
        betPerLine: number;
        paylines: number;
      }
    | {
        // w2w format
        waysWins: WaysWin[];
        betAmount: number;
        bonusSpinsAwarded: number;
        jackpotHit: boolean;
        jackpotAmount?: number;
      }
  );
}

export interface BalanceUpdateMessage {
  namespace: string;
  type: 'BALANCE_UPDATE';
  payload: {
    balance: number; // VOI
    availableBalance: number; // VOI
  };
}

export interface ErrorMessage {
  namespace: string;
  type: 'ERROR';
  payload: {
    code: string;
    message: string;
    recoverable: boolean;
    requestId?: string; // Optional ID to match with request
  };
}

export interface CreditBalanceMessage {
  namespace: string;
  type: 'CREDIT_BALANCE';
  payload: {
    credits: number;
    bonusSpins: number;
    spinCount: number;
  };
}

/**
 * Config message - supports both 5reel and w2w configuration
 */
export interface ConfigMessage {
  namespace: string;
  type: 'CONFIG';
  payload: {
    contractId: string;
    minBet: number; // VOI or credits
    maxBet: number; // VOI or credits
    rtpTarget: number;
    houseEdge: number;
  } & (
    | {
        // 5reel format
        maxPaylines: number;
      }
    | {
        // w2w format
        jackpotAmount: number;
        bonusSpinMultiplier: number;
        modeEnabled?: number; // Bitmask: 1=credit (free-play), 2=VOI, 4=ARC200
        tokenContractId?: number | null; // ARC200 token contract ID if this is a token machine
        baseBet?: number; // Base bet amount (40 by default) - in VOI/token units
        kickerAmount?: number; // Kicker amount for progressive mode (20 by default) - in VOI/token units
      }
  );
}

export interface BalanceResponse {
  namespace: string;
  type: 'BALANCE_RESPONSE';
  payload: {
    balance: number; // VOI
    availableBalance: number; // VOI
  };
}

export interface SpinSubmittedMessage {
  namespace: string;
  type: 'SPIN_SUBMITTED';
  payload: {
    spinId: string;
    txId?: string;
  };
}

/**
 * Account locked message - sent when account lock status is detected or changes
 */
export interface AccountLockedMessage {
  namespace: string;
  type: 'ACCOUNT_LOCKED';
  payload: {
    locked: boolean;
    voiAddress: string;
    reason?: 'no_keys' | 'cannot_decrypt' | 'cookie_expired';
  };
}

/**
 * Queued spin item - represents a spin in the queue
 */
export interface QueuedSpinItem {
  spinId: string;
  clientSpinId?: string; // Client-generated ID for tracking
  betAmount: number; // Token amount (normalized, e.g., 40 not 40000000)
  mode?: number; // W2W: 0=bonus, 1=credit, 2=network token (VOI), 4=ARC200 token
  paylines?: number; // 5-reel only
  betPerLine?: number; // 5-reel only (normalized token amount)
  timestamp: number;
  status: 'pending' | 'submitted' | 'completed' | 'failed';
  outcome?: {
    grid?: string[][];
    winnings: number; // Token amount (normalized)
    isWin: boolean;
    winLevel?: 'none' | 'small' | 'medium' | 'large' | 'jackpot';
    // W2W specific
    waysWins?: Array<{
      symbol: string;
      ways: number;
      matchLength: number;
      payout: number; // Token amount (normalized)
    }>;
    bonusSpinsAwarded?: number;
    jackpotHit?: boolean;
    jackpotAmount?: number; // Token amount (normalized)
    // 5-reel specific
    winningLines?: Array<{
      paylineIndex: number;
      symbol: string;
      matchCount: number;
      payout: number; // Token amount (normalized)
    }>;
  };
  error?: string;
}

/**
 * Spin queue message - sent in response to GET_SPIN_QUEUE or automatically when queue changes
 */
export interface SpinQueueMessage {
  namespace: string;
  type: 'SPIN_QUEUE';
  payload: {
    queue: QueuedSpinItem[];
    pendingCount: number; // Number of spins not yet completed
    reservedBalance: number; // Token amount reserved for pending spins (normalized)
  };
}

export type GameResponse =
  | OutcomeMessage
  | BalanceUpdateMessage
  | ErrorMessage
  | ConfigMessage
  | BalanceResponse
  | CreditBalanceMessage
  | SpinSubmittedMessage
  | AccountLockedMessage
  | SpinQueueMessage;

// ============================================================================
// MESSAGE VALIDATION
// ============================================================================

export function isGameRequest(message: unknown): message is GameRequest {
  if (!message || typeof message !== 'object') return false;
  if (!('type' in message)) return false;
  if (!('namespace' in message)) return false;

  const msg = message as { type: unknown; namespace: unknown };

  // Validate namespace
  if (msg.namespace !== MESSAGE_NAMESPACE) return false;

  // Validate type
  return (
    msg.type === 'SPIN_REQUEST' ||
    msg.type === 'GET_BALANCE' ||
    msg.type === 'GET_CREDIT_BALANCE' ||
    msg.type === 'GET_CONFIG' ||
    msg.type === 'GET_SPIN_QUEUE' ||
    msg.type === 'INIT' ||
    msg.type === 'EXIT' ||
    msg.type === 'REQUEST_UNLOCK'
  );
}

export function isSpinRequest(message: unknown): message is SpinRequest {
  if (!isGameRequest(message)) return false;
  if (message.type !== 'SPIN_REQUEST') return false;
  if (!('payload' in message)) return false;

  const payload = (message as SpinRequest).payload;

  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  // Check optional spinId
  if (payload.spinId !== undefined && typeof payload.spinId !== 'string') {
    return false;
  }

  // Check if it's either 5reel format OR w2w format
  const is5reelFormat =
    'paylines' in payload &&
    'betPerLine' in payload &&
    typeof payload.paylines === 'number' &&
    typeof payload.betPerLine === 'number';

  const isW2WFormat =
    'betAmount' in payload &&
    'reserved' in payload &&
    typeof payload.betAmount === 'number' &&
    typeof payload.reserved === 'number';

  return is5reelFormat || isW2WFormat;
}

