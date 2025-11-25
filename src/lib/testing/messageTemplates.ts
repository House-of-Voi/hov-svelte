/**
 * Message Templates for PostMessage API Testing
 *
 * Provides template messages for all supported message types
 * in both 5reel and W2W formats.
 */

import {
	MESSAGE_NAMESPACE,
	type GameRequest,
	type GameResponse,
	type SpinRequest,
	type OutcomeMessage,
	type ConfigMessage
} from '$lib/game-engine/bridge/types';

// Re-export MESSAGE_NAMESPACE for convenience
export { MESSAGE_NAMESPACE };

// ============================================================================
// GAME TYPE
// ============================================================================

export type GameType = '5reel' | 'w2w';

// ============================================================================
// MESSAGES FROM GAME (Game → Parent)
// ============================================================================

export const gameRequestTemplates = {
	INIT: (): GameRequest => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'INIT',
		payload: {
			contractId: '123456' // Optional
		}
	}),

	SPIN_REQUEST_5REEL: (): SpinRequest => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'SPIN_REQUEST',
		payload: {
			spinId: 'spin-' + Date.now(),
			paylines: 10,
			betPerLine: 0.1 // normalized VOI
		}
	}),

	SPIN_REQUEST_W2W: (): SpinRequest => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'SPIN_REQUEST',
		payload: {
			spinId: 'spin-' + Date.now(),
			betAmount: 40, // VOI (converted to microAlgos internally)
			mode: 2, // 0=bonus, 1=credit, 2=VOI, 4=ARC200
			reserved: 0 // 0=regular, 1=bonus (backward compatibility)
		}
	}),

	GET_BALANCE: (): GameRequest => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'GET_BALANCE'
	}),

	GET_CREDIT_BALANCE: (): GameRequest => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'GET_CREDIT_BALANCE'
	}),

	GET_CONFIG: (): GameRequest => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'GET_CONFIG'
	}),

	EXIT: (): GameRequest => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'EXIT'
	})
};

// ============================================================================
// MESSAGES TO GAME (Parent → Game)
// ============================================================================

export const gameResponseTemplates = {
	CONFIG_5REEL: (): ConfigMessage => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'CONFIG',
		payload: {
			contractId: '123456',
			minBet: 0.01, // normalized VOI
			maxBet: 100, // normalized VOI
			rtpTarget: 96.5,
			houseEdge: 3.5,
			maxPaylines: 20
		}
	}),

	CONFIG_W2W: (): ConfigMessage => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'CONFIG',
		payload: {
			contractId: '123456',
			minBet: 40, // 40 VOI
			maxBet: 60, // 60 VOI
			rtpTarget: 96.5,
			houseEdge: 3.5,
			jackpotAmount: 10000, // credits or VOI
			bonusSpinMultiplier: 1.5,
			modeEnabled: 7 // 1=credit, 2=VOI, 4=ARC200 (7 = all enabled)
		}
	}),

	OUTCOME_5REEL: (): OutcomeMessage => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'OUTCOME',
		payload: {
			spinId: 'spin-' + Date.now(),
			grid: [
				['A', 'F', 'D'], // Reel 1 (rows 0-2)
				['B', 'G', 'E'], // Reel 2
				['C', 'A', 'F'], // Reel 3
				['D', 'B', 'G'], // Reel 4
				['E', 'C', 'A'] // Reel 5 (5 reels × 3 rows, column-major)
			],
			winnings: 0.5, // normalized VOI
			isWin: true,
			winLevel: 'medium',
			totalBet: 1, // normalized VOI
			winningLines: [
				{
					paylineIndex: 1,
					symbol: 'A',
					matchCount: 3,
					payout: 0.3 // normalized VOI
				},
				{
					paylineIndex: 5,
					symbol: 'B',
					matchCount: 2,
					payout: 0.2 // normalized VOI
				}
			],
			betPerLine: 0.1, // normalized VOI
			paylines: 10
		}
	}),

	OUTCOME_W2W: (): OutcomeMessage => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'OUTCOME',
		payload: {
			spinId: 'spin-' + Date.now(),
			grid: [
				['0', '1', '2'], // Reel 1 (BUFFALO, EAGLE, COUGAR)
				['3', '4', '5'], // Reel 2 (ELK, WOLF, A)
				['6', '7', '8'], // Reel 3 (K, Q, J)
				['9', 'A', 'B'], // Reel 4 (TEN, NINE, WILD1)
				['C', 'D', 'E'] // Reel 5 (WILD2, WILD3, HOV) - 5 reels × 3 rows, column-major
			],
			winnings: 120, // credits or VOI
			isWin: true,
			winLevel: 'small',
			totalBet: 40,
			waysWins: [
				{
					symbol: '0',
					ways: 4,
					matchLength: 3,
					payout: 80
				},
				{
					symbol: '3',
					ways: 2,
					matchLength: 2,
					payout: 40
				}
			],
			betAmount: 40,
			bonusSpinsAwarded: 0, // 8 if 2+ BONUS symbols
			jackpotHit: false,
			jackpotAmount: undefined
		}
	}),

	OUTCOME_W2W_JACKPOT: (): OutcomeMessage => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'OUTCOME',
		payload: {
			spinId: 'spin-' + Date.now(),
			grid: [
				['E', '0', '1'], // Reel 1 (HOV on row 0)
				['E', '2', '3'], // Reel 2 (HOV on row 0)
				['E', '4', '5'], // Reel 3 (HOV on row 0) - 3 HOV in top row = jackpot
				['6', '7', '8'], // Reel 4
				['9', 'A', 'B'] // Reel 5 - 5 reels × 3 rows, column-major
			],
			winnings: 10000, // Jackpot amount
			isWin: true,
			winLevel: 'jackpot',
			totalBet: 40,
			waysWins: [],
			betAmount: 40,
			bonusSpinsAwarded: 0,
			jackpotHit: true,
			jackpotAmount: 10000
		}
	}),

	OUTCOME_W2W_BONUS: (): OutcomeMessage => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'OUTCOME',
		payload: {
			spinId: 'spin-' + Date.now(),
			grid: [
				['F', '0', '1'], // Reel 1 (BONUS on row 0)
				['2', '3', '4'], // Reel 2
				['5', '6', '7'], // Reel 3
				['F', '8', '9'], // Reel 4 (BONUS on row 0) - 2 BONUS = 8 bonus spins
				['A', 'B', 'C'] // Reel 5 - 5 reels × 3 rows, column-major
			],
			winnings: 0,
			isWin: false,
			winLevel: 'none',
			totalBet: 40,
			waysWins: [],
			betAmount: 40,
			bonusSpinsAwarded: 8, // 2+ BONUS symbols
			jackpotHit: false,
			jackpotAmount: undefined
		}
	}),

	BALANCE_UPDATE: (): GameResponse => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'BALANCE_UPDATE',
		payload: {
			balance: 100, // normalized VOI
			availableBalance: 95 // normalized VOI (some pending)
		}
	}),

	BALANCE_RESPONSE: (): GameResponse => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'BALANCE_RESPONSE',
		payload: {
			balance: 100, // normalized VOI
			availableBalance: 100 // normalized VOI
		}
	}),

	CREDIT_BALANCE: (): GameResponse => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'CREDIT_BALANCE',
		payload: {
			credits: 5000,
			bonusSpins: 8,
			spinCount: 142
		}
	}),

	ERROR: (): GameResponse => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'ERROR',
		payload: {
			code: 'INSUFFICIENT_BALANCE',
			message: 'Insufficient balance to place this bet',
			recoverable: true,
			requestId: 'spin-' + Date.now()
		}
	}),

	SPIN_SUBMITTED: (): GameResponse => ({
		namespace: MESSAGE_NAMESPACE,
		type: 'SPIN_SUBMITTED',
		payload: {
			spinId: 'spin-' + Date.now(),
			txId: 'ABC123XYZ789'
		}
	})
};

// ============================================================================
// ERROR CODES
// ============================================================================

export const errorCodes = [
	'INSUFFICIENT_BALANCE',
	'ALREADY_SPINNING',
	'RATE_LIMIT',
	'INVALID_BET',
	'INVALID_PAYLINES',
	'CONTRACT_ERROR',
	'WALLET_ERROR',
	'NETWORK_ERROR',
	'INVALID_MODE',
	'SESSION_EXPIRED'
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all request template names
 */
export function getRequestTemplateNames(): string[] {
	return Object.keys(gameRequestTemplates);
}

/**
 * Get all response template names
 */
export function getResponseTemplateNames(): string[] {
	return Object.keys(gameResponseTemplates);
}

/**
 * Get request templates for a specific game type
 */
export function getRequestTemplatesForGameType(gameType: GameType): string[] {
	const allTemplates = getRequestTemplateNames();

	if (gameType === '5reel') {
		return allTemplates.filter(
			(name) => !name.includes('W2W') && (name.includes('5REEL') || !name.includes('CREDIT'))
		);
	} else {
		// w2w
		return allTemplates.filter((name) => !name.includes('5REEL'));
	}
}

/**
 * Get response templates for a specific game type
 */
export function getResponseTemplatesForGameType(gameType: GameType): string[] {
	const allTemplates = getResponseTemplateNames();

	if (gameType === '5reel') {
		return allTemplates.filter(
			(name) => !name.includes('W2W') && (name.includes('5REEL') || !name.includes('CREDIT'))
		);
	} else {
		// w2w
		return allTemplates.filter((name) => !name.includes('5REEL'));
	}
}

/**
 * Get a request template by name
 */
export function getRequestTemplate(name: string): GameRequest | null {
	const template = gameRequestTemplates[name as keyof typeof gameRequestTemplates];
	return template ? template() : null;
}

/**
 * Get a response template by name
 */
export function getResponseTemplate(name: string): GameResponse | null {
	const template = gameResponseTemplates[name as keyof typeof gameResponseTemplates];
	return template ? template() : null;
}

/**
 * Detect game type from URL
 */
export function detectGameTypeFromUrl(url: string): GameType | null {
	if (url.includes('/games/slots') || url.includes('5reel')) {
		return '5reel';
	} else if (url.includes('/games/w2w')) {
		return 'w2w';
	}
	return null;
}

/**
 * Generate a unique spin ID
 */
export function generateSpinId(): string {
	return `spin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate message has required namespace
 */
export function validateMessageNamespace(message: unknown): boolean {
	if (!message || typeof message !== 'object') return false;
	if (!('namespace' in message)) return false;
	return (message as { namespace: unknown }).namespace === MESSAGE_NAMESPACE;
}
