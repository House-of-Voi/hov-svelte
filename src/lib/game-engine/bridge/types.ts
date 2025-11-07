/**
 * PostMessage Communication Protocol Types
 * 
 * Defines the message types used for communication between
 * third-party games and the GameBridge.
 */

// ============================================================================
// REQUEST MESSAGES (Game → Bridge)
// ============================================================================

export interface SpinRequest {
  type: 'SPIN_REQUEST';
  payload: {
    paylines: number;
    betPerLine: number;
    spinId?: string; // Optional client-generated ID for tracking
  };
}

export interface GetBalanceRequest {
  type: 'GET_BALANCE';
}

export interface GetConfigRequest {
  type: 'GET_CONFIG';
}

export interface InitRequest {
  type: 'INIT';
  payload?: {
    contractId?: string;
  };
}

export type GameRequest = 
  | SpinRequest 
  | GetBalanceRequest 
  | GetConfigRequest 
  | InitRequest;

// ============================================================================
// RESPONSE MESSAGES (Bridge → Game)
// ============================================================================

export interface WinningLine {
  paylineIndex: number;
  symbol: string;
  matchCount: number;
  payout: number; // microVOI
}

export interface OutcomeMessage {
  type: 'OUTCOME';
  payload: {
    spinId: string;
    grid: string[][]; // 3x5 grid (5 reels × 3 symbols)
    winnings: number; // microVOI
    isWin: boolean;
    winningLines: WinningLine[];
    winLevel: 'small' | 'medium' | 'large' | 'jackpot';
    betPerLine: number;
    paylines: number;
    totalBet: number;
  };
}

export interface BalanceUpdateMessage {
  type: 'BALANCE_UPDATE';
  payload: {
    balance: number; // microVOI
    availableBalance: number; // microVOI
  };
}

export interface ErrorMessage {
  type: 'ERROR';
  payload: {
    code: string;
    message: string;
    recoverable: boolean;
    requestId?: string; // Optional ID to match with request
  };
}

export interface ConfigMessage {
  type: 'CONFIG';
  payload: {
    contractId: string;
    minBet: number; // microVOI
    maxBet: number; // microVOI
    maxPaylines: number;
    rtpTarget: number;
    houseEdge: number;
  };
}

export interface BalanceResponse {
  type: 'BALANCE_RESPONSE';
  payload: {
    balance: number; // microVOI
    availableBalance: number; // microVOI
  };
}

export interface SpinSubmittedMessage {
  type: 'SPIN_SUBMITTED';
  payload: {
    spinId: string;
    txId?: string;
  };
}

export type GameResponse = 
  | OutcomeMessage 
  | BalanceUpdateMessage 
  | ErrorMessage 
  | ConfigMessage 
  | BalanceResponse
  | SpinSubmittedMessage;

// ============================================================================
// MESSAGE VALIDATION
// ============================================================================

export function isGameRequest(message: unknown): message is GameRequest {
  if (!message || typeof message !== 'object') return false;
  if (!('type' in message)) return false;
  
  const type = (message as { type: unknown }).type;
  return (
    type === 'SPIN_REQUEST' ||
    type === 'GET_BALANCE' ||
    type === 'GET_CONFIG' ||
    type === 'INIT'
  );
}

export function isSpinRequest(message: unknown): message is SpinRequest {
  if (!isGameRequest(message)) return false;
  if (message.type !== 'SPIN_REQUEST') return false;
  if (!('payload' in message)) return false;
  
  const payload = (message as SpinRequest).payload;
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof payload.paylines === 'number' &&
    typeof payload.betPerLine === 'number' &&
    (payload.spinId === undefined || typeof payload.spinId === 'string')
  );
}

