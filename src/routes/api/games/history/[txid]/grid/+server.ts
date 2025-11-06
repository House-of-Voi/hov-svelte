import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	extractBetKeyFromTransaction,
	generateGridFromBetKeyAndRound
} from '$lib/utils/gridReconstruction';
import { ensureBase32TxId } from '$lib/utils/txIdUtils';
import { detectWinningPaylines } from '$lib/game-engine/utils/winDetection';
import { PAYLINE_PATTERNS, DEFAULT_PAYTABLE } from '$lib/game-engine/utils/gameConstants';
import type { SymbolId, SymbolPayouts } from '$lib/game-engine/types';

export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const rawTxId = params.txid;
		if (!rawTxId) {
			return json({ success: false, error: 'Transaction ID is required' }, { status: 400 });
		}

		// Normalize transaction ID to base32 format (handles both hex-encoded and base32)
		const txId = ensureBase32TxId(rawTxId);

		// Get bet parameters from query string
		const betPerLineParam = url.searchParams.get('betPerLine');
		const selectedPaylinesParam = url.searchParams.get('selectedPaylines');

		if (!betPerLineParam || !selectedPaylinesParam) {
			return json(
				{ success: false, error: 'betPerLine and selectedPaylines are required' },
				{ status: 400 }
			);
		}

		const betPerLine = parseInt(betPerLineParam, 10);
		const selectedPaylines = parseInt(selectedPaylinesParam, 10);

		if (isNaN(betPerLine) || isNaN(selectedPaylines) || betPerLine <= 0 || selectedPaylines <= 0) {
			return json(
				{ success: false, error: 'Invalid betPerLine or selectedPaylines' },
				{ status: 400 }
			);
		}

		// Extract bet key and round from transaction
		const result = await extractBetKeyFromTransaction(txId);
		if (!result || !result.betKey || !result.round) {
			return json(
				{ success: false, error: 'Could not extract bet key and round from transaction' },
				{ status: 404 }
			);
		}

		const { betKey, round: transactionRound } = result;

		// Calculate claim round (transaction round + 1)
		const claimRound = transactionRound + 1;

		// Generate grid
		const gridString = await generateGridFromBetKeyAndRound(betKey, claimRound);
		
		// Convert to SymbolId[][] for win detection
		const grid: SymbolId[][] = gridString.map(col => col.map(s => s as SymbolId));

		// Use DEFAULT_PAYTABLE from gameConstants (now has correct contract multipliers)
		// Convert to SymbolPayouts[] format for detectWinningPaylines
		const paytable: SymbolPayouts[] = DEFAULT_PAYTABLE.map(s => ({
			symbol: s.symbol,
			displayName: s.displayName,
			match3: s.match3,
			match4: s.match4,
			match5: s.match5
		}));

		// Calculate winning lines using detectWinningPaylines with contract payline patterns
		const winningLines = detectWinningPaylines(
			grid,
			PAYLINE_PATTERNS,
			paytable,
			selectedPaylines,
			betPerLine
		);

		return json({
			success: true,
			data: {
				grid: gridString,
				winningLines: winningLines.map(line => ({
					paylineIndex: line.paylineIndex,
					pattern: line.pattern,
					symbol: line.symbol,
					matchCount: line.matchCount,
					payout: line.payout
				})),
				betKey,
				claimRound,
				transactionRound
			}
		});
	} catch (error) {
		console.error('Error in grid reconstruction API:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Internal server error'
			},
			{ status: 500 }
		);
	}
};

