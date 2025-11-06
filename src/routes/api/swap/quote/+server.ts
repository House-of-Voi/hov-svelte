import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import algosdk from 'algosdk';
import { env } from '$lib/utils/env';
import { SwapClient, type SwapQuote } from '$lib/voi/swap-client';
import { getServerSessionFromCookies } from '$lib/auth/session';

const USDC_ASSET_ID = 302190;
const VOI_ASSET_ID = 0; // Network token

// Request schema
const SwapQuoteRequestSchema = z.object({
	address: z.string().min(1, 'Address is required'),
	inputToken: z.union([
		z.number(),
		z.string().transform((val) => {
			if (val.toLowerCase() === 'voi' || val === '0') return 0;
			return parseInt(val, 10);
		})
	]),
	outputToken: z.union([
		z.number(),
		z.string().transform((val) => {
			if (val.toLowerCase() === 'voi' || val === '0') return 0;
			return parseInt(val, 10);
		})
	]),
	amount: z.union([
		z.string().transform((val) => BigInt(val)),
		z.number().transform((val) => BigInt(val)),
		z.bigint()
	]).refine((val) => val > 0n, 'Amount must be greater than 0'),
	slippageTolerance: z.number().min(0).max(1).optional().default(0.01) // 1% default
});

/**
 * POST /api/swap/quote
 *
 * Generate a swap quote and unsigned transactions for swapping tokens
 *
 * Request body:
 * {
 *   address: string - User's Algorand address
 *   inputToken: number | string - Input token ID (302190 for USDC, 0 or "VOI" for network token)
 *   outputToken: number | string - Output token ID
 *   amount: string | number | bigint - Amount in atomic units
 *   slippageTolerance?: number - Optional slippage tolerance (0-1, default 0.01 = 1%)
 * }
 *
 * Response:
 * {
 *   quote: {
 *     inputAmount: string - Input amount in atomic units
 *     outputAmount: string - Expected output amount in atomic units
 *     minimumOutputAmount: string - Minimum output with slippage tolerance
 *     rate: number - Exchange rate
 *     priceImpact: number - Price impact percentage
 *   },
 *   unsignedTransactions: string[] - Base64-encoded unsigned transactions
 *   poolId: string - Selected pool ID
 * }
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const parsed = SwapQuoteRequestSchema.safeParse(body);

		if (!parsed.success) {
			return json(
				{
					error: 'Invalid request body',
					details: parsed.error.errors
				},
				{ status: 400 }
			);
		}

		let { address, inputToken, outputToken, amount, slippageTolerance } = parsed.data;

		// If user has CDP session, prefer the session-derived address
		// This ensures the address matches what CDP will derive when signing
		const session = await getServerSessionFromCookies(cookies);
		if (session?.voiAddress) {
			// Use the CDP-derived address from session instead of the passed address
			// This ensures transactions are built with the correct address that CDP will sign
			address = session.voiAddress;
			console.log(`✅ Using CDP-derived address from session: ${address}`);
		}

		// Validate address format
		if (!algosdk.isValidAddress(address)) {
			return json(
				{ error: 'Invalid Algorand address format' },
				{ status: 400 }
			);
		}

		// Normalize token IDs
		const inputAssetId = BigInt(inputToken);
		const outputAssetId = BigInt(outputToken);

		// Validate token IDs (for first pass: USDC <-> VOI only)
		if (
			(inputAssetId !== BigInt(USDC_ASSET_ID) && inputAssetId !== BigInt(VOI_ASSET_ID)) ||
			(outputAssetId !== BigInt(USDC_ASSET_ID) && outputAssetId !== BigInt(VOI_ASSET_ID))
		) {
			return json(
				{
					error: 'Invalid token pair. Only USDC (302190) <-> VOI (0) swaps are supported in this first pass.'
				},
				{ status: 400 }
			);
		}

		if (inputAssetId === outputAssetId) {
			return json(
				{ error: 'Input and output tokens cannot be the same' },
				{ status: 400 }
			);
		}

		// Initialize Algod client
		const nodeUrl = env.VOI_NODE_URL || 'https://mainnet-api.voi.nodely.dev';
		const algodClient = new algosdk.Algodv2('', nodeUrl, '');

		// Initialize SwapClient
		const swapClient = new SwapClient(algodClient);

		// Fetch pool info
		let poolInfo;
		try {
			poolInfo = await swapClient.Info();
		} catch (error) {
			console.error('Error fetching pool info:', error);
			return json(
				{
					error: 'Failed to fetch pool information',
					message: error instanceof Error ? error.message : 'Unknown error'
				},
				{ status: 500 }
			);
		}

		// Select pool for the asset pair
		let poolId: bigint;
		try {
			poolId = await swapClient.selectPool(inputAssetId, outputAssetId);
		} catch (error) {
			console.error('Error selecting pool:', error);
			return json(
				{
					error: 'Pool not found for the specified token pair',
					message: error instanceof Error ? error.message : 'Unknown error'
				},
				{ status: 404 }
			);
		}

		// Calculate quote
		let quote: SwapQuote;
		try {
			quote = SwapClient.calculateQuote(
				poolInfo,
				inputAssetId,
				outputAssetId,
				amount,
				slippageTolerance
			);
		} catch (error) {
			console.error('Error calculating quote:', error);
			return json(
				{
					error: 'Failed to calculate swap quote',
					message: error instanceof Error ? error.message : 'Unknown error'
				},
				{ status: 500 }
			);
		}

		// Construct swap transactions
		let transactions: algosdk.Transaction[];
		try {
			transactions = await swapClient.swap(
				{
					address,
					poolId,
					assetA: inputAssetId,
					assetB: outputAssetId,
					amountIn: amount,
					minimumAmountOut: quote.minimumOutputAmount
				},
				inputAssetId // Pass the input asset to determine transfer type
			);
		} catch (error) {
			console.error('Error constructing swap transactions:', error);
			return json(
				{
					error: 'Failed to construct swap transactions',
					message: error instanceof Error ? error.message : 'Unknown error'
				},
				{ status: 500 }
			);
		}

		// Encode transactions to base64
		const unsignedTransactions = transactions.map((txn) => {
			const encoded = algosdk.encodeUnsignedTransaction(txn);
			return Buffer.from(encoded).toString('base64');
		});

		// Return response
		return json({
			quote: {
				inputAmount: quote.inputAmount.toString(),
				outputAmount: quote.outputAmount.toString(),
				minimumOutputAmount: quote.minimumOutputAmount.toString(),
				rate: quote.rate,
				priceImpact: quote.priceImpact
			},
			unsignedTransactions,
			poolId: poolId.toString()
		});
	} catch (error) {
		console.error('Unexpected error in swap quote endpoint:', error);
		return json(
			{
				error: 'Internal server error',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

