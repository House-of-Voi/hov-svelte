/**
 * Swap API Types
 *
 * TypeScript interfaces for the swap API request and response formats.
 */

/**
 * Request body for getting a swap quote
 */
export interface SwapQuoteRequest {
	address: string;
	inputToken: number; // ASA ID of input token (e.g., 302190 for USDC)
	outputToken: number; // ASA ID of output token (0 for native VOI)
	amount: string; // Amount in atomic units
	slippageTolerance: number; // e.g., 0.01 for 1%
}

/**
 * Quote details from the swap API
 */
export interface SwapQuote {
	outputAmount: string; // Amount to receive in atomic units
	minimumOutputAmount?: string; // Minimum amount accounting for slippage
	rate: number; // Exchange rate
	priceImpact: number; // Price impact as decimal (e.g., 0.01 for 1%)
}

/**
 * Response from the swap quote API
 */
export interface SwapQuoteResponse {
	quote: SwapQuote;
	unsignedTransactions: string[]; // Base64 encoded unsigned transactions
}

/**
 * Error response from the swap API
 */
export interface SwapErrorResponse {
	error?: string;
	message?: string;
}

/**
 * Transaction details after successful swap
 */
export interface SwapTransactionDetails {
	blockNumber: number | null;
	timestamp: number | null;
	actualAmountReceived: string | null;
}

/**
 * Type guard to check if response is a valid quote response
 */
export function isSwapQuoteResponse(data: unknown): data is SwapQuoteResponse {
	if (!data || typeof data !== 'object') return false;
	const obj = data as Record<string, unknown>;

	if (!obj.quote || typeof obj.quote !== 'object') return false;
	const quote = obj.quote as Record<string, unknown>;

	return (
		typeof quote.outputAmount === 'string' &&
		typeof quote.rate === 'number' &&
		typeof quote.priceImpact === 'number' &&
		Array.isArray(obj.unsignedTransactions)
	);
}

/**
 * Type guard to check if response is an error
 */
export function isSwapErrorResponse(data: unknown): data is SwapErrorResponse {
	if (!data || typeof data !== 'object') return false;
	const obj = data as Record<string, unknown>;
	return typeof obj.error === 'string' || typeof obj.message === 'string';
}
