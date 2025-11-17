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
				['A', 'B', 'C', 'D', 'E'], // Row 1
				['F', 'G', 'A', 'B', 'C'], // Row 2
				['D', 'E', 'F', 'G', 'A'] // Row 3 (3x5 grid)
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
				['A', 'B', 'C', 'D', 'E'], // Row 1
				['F', 'G', 'A', 'B', 'C'], // Row 2
				['D', 'E', 'F', 'G', 'A'], // Row 3
				['B', 'C', 'D', 'E', 'F'] // Row 4 (4x5 grid)
			],
			winnings: 120, // credits or VOI
			isWin: true,
			winLevel: 'small',
			totalBet: 40,
			waysWins: [
				{
					symbol: 'A',
					ways: 4,
					matchLength: 3,
					payout: 80
				},
				{
					symbol: 'B',
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
				['E', 'E', 'E', 'D', 'A'], // Row 1 (E = HOV symbol)
				['F', 'G', 'A', 'B', 'C'], // Row 2
				['D', 'E', 'F', 'G', 'A'], // Row 3
				['B', 'C', 'D', 'E', 'F'] // Row 4
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
				['BONUS', 'B', 'C', 'BONUS', 'E'], // Row 1
				['F', 'G', 'A', 'B', 'C'], // Row 2
				['D', 'E', 'F', 'G', 'A'], // Row 3
				['B', 'C', 'D', 'E', 'F'] // Row 4
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
