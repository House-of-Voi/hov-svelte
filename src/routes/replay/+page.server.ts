import type { PageServerLoad } from './$types';
import { ensureBase32TxId } from '$lib/utils/txIdUtils';
import {
	extractBetKeyFromTransaction,
	generateGridFromBetKeyAndRound
} from '$lib/utils/gridReconstruction';
import { detectWinningPaylines } from '$lib/game-engine/utils/winDetection';
import { PAYLINE_PATTERNS, DEFAULT_PAYTABLE } from '$lib/game-engine/utils/gameConstants';
import type { SymbolId, SymbolPayouts } from '$lib/game-engine/types';

export const load: PageServerLoad = async ({ url }) => {
	const rawTxId = url.searchParams.get('txid');
	
	if (!rawTxId) {
		return {
			error: 'Transaction ID is required',
			replayData: null
		};
	}

	// Normalize transaction ID to base32 format
	const txId = ensureBase32TxId(rawTxId);

	// Get bet parameters from query string (optional - will try to extract from transaction if not provided)
	const betPerLineParam = url.searchParams.get('betPerLine');
	const selectedPaylinesParam = url.searchParams.get('selectedPaylines');

	try {
		// Extract bet key and round from transaction
		const result = await extractBetKeyFromTransaction(txId);
		if (!result || !result.betKey || !result.round) {
			return {
				error: 'Could not extract bet key and round from transaction',
				replayData: null,
				txId
			};
		}

		const { betKey, round: transactionRound } = result;

		// Calculate claim round (transaction round + 1)
		const claimRound = transactionRound + 1;

		// Try to extract bet parameters from bet key if not provided
		let betPerLine: number;
		let selectedPaylines: number;

		if (betPerLineParam && selectedPaylinesParam) {
			betPerLine = parseInt(betPerLineParam, 10);
			selectedPaylines = parseInt(selectedPaylinesParam, 10);
		} else {
			// Extract from bet key (bytes 32-39: bet amount, bytes 40-47: max payline index)
			try {
				const keyBytes = new Uint8Array(betKey.match(/.{2}/g)?.map((b) => parseInt(b, 16)) || []);
				if (keyBytes.length >= 48) {
					// Extract bet amount (bytes 32-39, big endian uint64)
					const betAmountView = new DataView(keyBytes.slice(32, 40).buffer);
					betPerLine = Number(betAmountView.getBigUint64(0, false));
					
					// Extract max payline index (bytes 40-47, big endian uint64)
					const maxPaylineView = new DataView(keyBytes.slice(40, 48).buffer);
					const maxPaylineIndex = Number(maxPaylineView.getBigUint64(0, false));
					selectedPaylines = maxPaylineIndex + 1; // Convert index to count
				} else {
					// Fallback to defaults
					betPerLine = betPerLineParam ? parseInt(betPerLineParam, 10) : 1_000_000; // 1 VOI per line
					selectedPaylines = selectedPaylinesParam ? parseInt(selectedPaylinesParam, 10) : 20;
				}
			} catch (e) {
				// Fallback to defaults or provided params
				betPerLine = betPerLineParam ? parseInt(betPerLineParam, 10) : 1_000_000;
				selectedPaylines = selectedPaylinesParam ? parseInt(selectedPaylinesParam, 10) : 20;
			}
		}

		if (isNaN(betPerLine) || isNaN(selectedPaylines) || betPerLine <= 0 || selectedPaylines <= 0) {
			return {
				error: 'Invalid bet parameters',
				replayData: null,
				txId
			};
		}

		// Generate grid
		const gridString = await generateGridFromBetKeyAndRound(betKey, claimRound);
		
		// Convert to SymbolId[][] for win detection
		const grid: SymbolId[][] = gridString.map(col => col.map(s => s as SymbolId));

		// Use DEFAULT_PAYTABLE from gameConstants
		// Convert to SymbolPayouts[] format for detectWinningPaylines
		const paytable: SymbolPayouts[] = DEFAULT_PAYTABLE.map(s => ({
			symbol: s.symbol,
			displayName: s.displayName,
			match3: s.match3,
			match4: s.match4,
			match5: s.match5
		}));

		// Calculate winning lines using detectWinningPaylines
		const winningLines = detectWinningPaylines(
			grid,
			PAYLINE_PATTERNS,
			paytable,
			selectedPaylines,
			betPerLine
		);

		// Calculate total bet and payout
		const totalBet = betPerLine * selectedPaylines;
		const totalPayout = winningLines.reduce((sum, line) => sum + line.payout, 0);
		const profit = totalPayout - totalBet;
		const multiplier = totalBet > 0 ? totalPayout / totalBet : 0;

		return {
			error: null,
			replayData: {
				grid: gridString,
				winningLines: winningLines.map(line => ({
					paylineIndex: line.paylineIndex,
					pattern: line.pattern,
					symbol: line.symbol,
					matchCount: line.matchCount,
					payout: line.payout
				})),
				betPerLine,
				selectedPaylines,
				totalBet,
				totalPayout,
				profit,
				multiplier,
				txId,
				betKey,
				claimRound,
				transactionRound
			}
		};
	} catch (error) {
		console.error('Error loading replay data:', error);
		return {
			error: error instanceof Error ? error.message : 'Failed to load replay data',
			replayData: null,
			txId
		};
	}
};

