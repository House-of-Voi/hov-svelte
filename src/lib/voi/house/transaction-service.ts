/**
 * Transaction History Service
 * Queries YBT transaction history from blockchain
 */

import algosdk from 'algosdk';
import type { YBTTransaction } from '$lib/types/house';

const VOI_INDEXER_URL =
	import.meta.env.PUBLIC_VOI_INDEXER_URL || 'https://testnet-idx.voi.nodly.io';

class TransactionService {
	private indexerClient: algosdk.Indexer;

	constructor() {
		this.indexerClient = new algosdk.Indexer('', VOI_INDEXER_URL, '');
	}

	/**
	 * Get YBT transaction history for an address
	 */
	async getTransactionHistory(
		address: string,
		ybtAppId: number,
		limit: number = 50
	): Promise<YBTTransaction[]> {
		try {
			// Query transactions where the address interacted with the YBT app
			const response = await this.indexerClient
				.searchForTransactions()
				.address(address)
				.applicationID(ybtAppId)
				.limit(limit)
				.do();

			const transactions: YBTTransaction[] = [];

			for (const txn of response.transactions || []) {
				// Parse transaction type from app args
				const appArgs = txn['application-transaction']?.['application-args'] || [];
				if (appArgs.length === 0) continue;

				const methodName = Buffer.from(appArgs[0], 'base64').toString('utf-8');

				if (methodName === 'deposit' || methodName === 'withdraw') {
					// Parse transaction details
					// Note: Actual implementation would need to parse logs for amounts/shares
					transactions.push({
						txHash: txn.id,
						type: methodName as 'deposit' | 'withdraw',
						address: address,
						contractId: 0, // Would need to get from state
						ybtAppId: ybtAppId,
						voiAmount: 0n, // Would parse from logs
						sharesAmount: 0n, // Would parse from logs
						timestamp: new Date((txn['round-time'] || 0) * 1000),
						blockNumber: txn['confirmed-round'] || 0,
						round: txn['confirmed-round'] || 0
					});
				}
			}

			return transactions;
		} catch (error) {
			console.error('Error fetching transaction history:', error);
			return [];
		}
	}
}

export const transactionService = new TransactionService();
