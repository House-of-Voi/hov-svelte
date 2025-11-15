import algosdk from 'algosdk';
import { PUBLIC_VOI_NODE_URL } from '$env/static/public';

const FOUNTAIN_API_URL = 'https://fountain.voirewards.com/api/faucet';
const algodClient = new algosdk.Algodv2('', PUBLIC_VOI_NODE_URL || 'https://mainnet-api.voi.nodely.dev', '');

export interface FountainResponse {
	success: boolean;
	txId?: string;
	amount?: number;
	canClaim?: boolean;
	error?: string;
	message?: string;
}

export interface FountainError {
	rateLimited: boolean;
	message: string;
	nextClaimTime?: string;
}

/**
 * Request VOI tokens from the Fountain faucet
 * @param address - The wallet address to send VOI to
 * @returns Fountain API response with transaction ID and amount
 * @throws FountainError if rate limited or request fails
 */
export async function requestVoi(address: string): Promise<FountainResponse> {
	try {
		const response = await fetch(FOUNTAIN_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				address,
				claim: true
			})
		});

		const data = await response.json();

		if (!response.ok) {
			// Handle rate limiting
			if (response.status === 429 || data.error?.includes('rate limit')) {
				const error: FountainError = {
					rateLimited: true,
					message: data.error || 'Rate limit reached. Please try again later.',
					nextClaimTime: data.nextClaimTime
				};
				throw error;
			}

			// Handle other errors
			throw {
				rateLimited: false,
				message: data.error || data.message || 'Failed to request VOI from Fountain'
			} as FountainError;
		}

		// Check if can claim
		if (data.canClaim === false) {
			throw {
				rateLimited: true,
				message: 'You cannot claim from the Fountain at this time.',
				nextClaimTime: data.nextClaimTime
			} as FountainError;
		}

		return {
			success: true,
			txId: data.txId,
			amount: data.amount
		};
	} catch (error) {
		// Re-throw FountainError as-is
		if (error && typeof error === 'object' && 'rateLimited' in error) {
			throw error;
		}

		// Wrap other errors
		console.error('Error requesting VOI from Fountain:', error);
		throw {
			rateLimited: false,
			message: 'Network error. Please check your connection and try again.'
		} as FountainError;
	}
}

/**
 * Wait for VOI tokens to be received after a Fountain request
 * Polls the account balance until it increases
 * @param address - The wallet address receiving VOI
 * @param initialBalance - The balance before the Fountain request (in microVOI)
 * @param maxRetries - Maximum number of polling attempts (default: 20, ~20 seconds)
 * @param retryDelayMs - Delay between retries in milliseconds (default: 1000)
 * @returns true if VOI received, false if timeout
 */
export async function waitForVoiReceipt(
	address: string,
	initialBalance: number,
	maxRetries: number = 20,
	retryDelayMs: number = 1000
): Promise<boolean> {
	for (let i = 0; i < maxRetries; i++) {
		try {
			const currentBalance = await getVoiBalance(address);

			// Check if balance has increased
			if (currentBalance > initialBalance) {
				return true;
			}
		} catch (error) {
			console.error('Error checking balance:', error);
		}

		// Wait before next retry
		await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
	}

	return false;
}

/**
 * Get the current VOI balance for an address
 * @param address - The wallet address to check
 * @returns Balance in microVOI
 */
export async function getVoiBalance(address: string): Promise<number> {
	try {
		const accountInfo = await algodClient.accountInformation(address).do();
		const amount = accountInfo.amount ?? 0;
		// Ensure we always return a number even if the SDK yields BigInt
		return typeof amount === 'bigint' ? Number(amount) : amount; // in microVOI
	} catch (error) {
		console.error('Error getting VOI balance:', error);
		throw new Error('Failed to get VOI balance');
	}
}

/**
 * Check if an account has sufficient VOI for ASA opt-in
 * @param address - The wallet address to check
 * @param minRequired - Minimum VOI required in microVOI (default: 101,000 for opt-in + fees)
 * @returns true if sufficient balance, false otherwise
 */
export async function hasSufficientVoi(
	address: string,
	minRequired: number = 101000
): Promise<boolean> {
	try {
		const accountInfo = await algodClient.accountInformation(address).do();
		const balance = BigInt(accountInfo.amount ?? 0);
		const minBalance = BigInt(accountInfo.minBalance ?? 0);
		const availableBalance = balance - minBalance;

		return availableBalance >= BigInt(minRequired);
	} catch (error) {
		console.error('Error checking VOI balance:', error);
		return false;
	}
}
