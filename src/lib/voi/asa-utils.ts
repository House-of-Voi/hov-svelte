import algosdk from 'algosdk';
import { PUBLIC_VOI_NODE_URL } from '$env/static/public';

const algodClient = new algosdk.Algodv2('', PUBLIC_VOI_NODE_URL || 'https://mainnet-api.voi.nodely.dev', '');

/**
 * Get the algod client instance
 */
export function getAlgodClient(): algosdk.Algodv2 {
	return algodClient;
}

/**
 * Check if an account is opted into a specific ASA (Algorand Standard Asset)
 * @param address - The account address to check
 * @param assetId - The asset ID to check for opt-in
 * @returns true if opted in, false otherwise
 */
export async function checkAssetOptIn(address: string, assetId: number): Promise<boolean> {
	try {
		// Use accountInformation instead of accountAssetInformation
		// accountAssetInformation fails when balance is zero
		const accountInfo = await algodClient.accountInformation(address).do();
		const assets = accountInfo.assets || [];

		// In algosdk v3, assets is an array of AssetHolding class instances
		// The property name is 'assetId' (camelCase) and the value is a BigInt
		const assetIdBigInt = BigInt(assetId);
		const found = assets.some((asset: any) => asset.assetId === assetIdBigInt);

		return found;
	} catch (error) {
		console.error('Error checking asset opt-in:', error);
		return false;
	}
}

/**
 * Get the minimum VOI balance required for an account to opt into an ASA
 * Each ASA opt-in requires 0.1 VOI (100,000 microVOI) minimum balance increase
 * @param address - The account address
 * @returns Object with current balance and minimum required for opt-in
 */
export async function getMinimumBalanceForOptIn(
	address: string
): Promise<{ currentBalance: number; minBalanceForOptIn: number; hasEnough: boolean }> {
	try {
		const accountInfo = await algodClient.accountInformation(address).do();
		const currentBalance = Number(accountInfo.amount); // in microVOI
		const minBalance = Number(accountInfo.minBalance); // in microVOI
		const availableBalance = currentBalance - minBalance;

		// ASA opt-in requires 0.1 VOI (100,000 microVOI) increase in min balance
		// Plus ~0.001 VOI (1,000 microVOI) for transaction fee
		const minBalanceForOptIn = 100000 + 1000; // 0.101 VOI in microVOI

		return {
			currentBalance: availableBalance,
			minBalanceForOptIn,
			hasEnough: availableBalance >= minBalanceForOptIn
		};
	} catch (error) {
		console.error('Error getting account balance:', error);
		throw new Error('Failed to check account balance');
	}
}

/**
 * Create an ASA opt-in transaction
 * Opt-in is done by sending a 0-amount asset transfer to yourself
 * @param address - The account address opting in
 * @param assetId - The asset ID to opt into
 * @returns Unsigned transaction object
 */
export async function createAssetOptInTransaction(
	address: string,
	assetId: number
): Promise<algosdk.Transaction> {
	try {
		const suggestedParams = await algodClient.getTransactionParams().do();

		// algosdk v3 uses 'sender' and 'receiver' instead of 'from' and 'to'
		const optInTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
			sender: address,
			receiver: address,
			amount: 0n,
			assetIndex: BigInt(assetId),
			suggestedParams
		});

		return optInTxn;
	} catch (error) {
		console.error('Error creating opt-in transaction:', error);
		throw new Error('Failed to create opt-in transaction');
	}
}

/**
 * Verify that an ASA opt-in transaction has been confirmed
 * Polls the algod API until the asset appears in the account's holdings
 * @param address - The account address
 * @param assetId - The asset ID to verify
 * @param maxRetries - Maximum number of polling attempts (default: 10)
 * @param retryDelayMs - Delay between retries in milliseconds (default: 1000)
 * @returns true if opt-in verified, false if timeout
 */
export async function verifyAssetOptIn(
	address: string,
	assetId: number,
	maxRetries: number = 10,
	retryDelayMs: number = 1000
): Promise<boolean> {
	for (let i = 0; i < maxRetries; i++) {
		const isOptedIn = await checkAssetOptIn(address, assetId);
		if (isOptedIn) {
			return true;
		}
		// Wait before next retry
		await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
	}
	return false;
}

/**
 * Submit a signed transaction to the network
 * @param signedTxn - The signed transaction bytes
 * @returns Transaction ID
 */
export async function submitTransaction(signedTxn: Uint8Array): Promise<string> {
	try {
		// algosdk 3.x returns { txid } (lowercase)
		const { txid } = await algodClient.sendRawTransaction(signedTxn).do();
		if (!txid || typeof txid !== 'string') {
			throw new Error('Failed to get transaction ID from response');
		}
		return txid;
	} catch (error) {
		console.error('Error submitting transaction:', error);
		throw error instanceof Error ? error : new Error('Failed to submit transaction');
	}
}

/**
 * Wait for a transaction to be confirmed using algosdk's built-in function
 * @param txId - The transaction ID to wait for
 * @param maxRounds - Maximum number of rounds to wait (default: 4)
 * @returns true if confirmed
 */
export async function waitForConfirmation(txId: string, maxRounds: number = 4): Promise<boolean> {
	try {
		await algosdk.waitForConfirmation(algodClient, txId, maxRounds);
		return true;
	} catch (error) {
		console.error('Error waiting for confirmation:', error);
		return false;
	}
}

/**
 * Create a payment transaction for native VOI
 * @param sender - The sender account address
 * @param receiver - The receiver account address
 * @param amount - The amount to transfer (in microVOI)
 * @returns Unsigned transaction object
 */
export async function createPaymentTransaction(
	sender: string,
	receiver: string,
	amount: bigint
): Promise<algosdk.Transaction> {
	try {
		const suggestedParams = await algodClient.getTransactionParams().do();

		// algosdk v3 uses 'sender' and 'receiver' instead of 'from' and 'to'
		const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
			sender,
			receiver,
			amount,
			suggestedParams
		});

		return paymentTxn;
	} catch (error) {
		console.error('Error creating payment transaction:', error);
		throw new Error('Failed to create payment transaction');
	}
}

/**
 * Create an ASA asset transfer transaction
 * @param sender - The sender account address
 * @param receiver - The receiver account address
 * @param amount - The amount to transfer (in asset's smallest unit, e.g., microUSDC)
 * @param assetId - The asset ID to transfer
 * @returns Unsigned transaction object
 */
export async function createAssetTransferTransaction(
	sender: string,
	receiver: string,
	amount: bigint,
	assetId: number
): Promise<algosdk.Transaction> {
	try {
		const suggestedParams = await algodClient.getTransactionParams().do();

		// algosdk v3 uses 'sender' and 'receiver' instead of 'from' and 'to'
		const transferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
			sender,
			receiver,
			amount,
			assetIndex: BigInt(assetId),
			suggestedParams
		});

		return transferTxn;
	} catch (error) {
		console.error('Error creating asset transfer transaction:', error);
		throw new Error('Failed to create asset transfer transaction');
	}
}
