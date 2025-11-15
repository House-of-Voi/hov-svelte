import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import algosdk from 'algosdk';
import { env } from '$lib/utils/env';
import { ybtService } from '$lib/voi/house/ybt-service';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import type { YBTTransaction, ProfitLoss } from '$lib/types/house';

const VOI_NODE_URL = env.PUBLIC_VOI_NODE_URL || 'https://testnet-api.voi.nodly.io';
const VOI_INDEXER_URL = env.PUBLIC_VOI_INDEXER_URL || 'https://testnet-idx.voi.nodly.io';

const supabaseAdmin = createAdminClient();

export const GET: RequestHandler = async ({ params, url, locals }) => {
	// Require authentication
	if (!locals.session) {
		throw error(401, 'Unauthorized');
	}

	const contractId = parseInt(params.contractId);
	if (isNaN(contractId)) {
		throw error(400, 'Invalid contract ID');
	}

	// Get addresses from query params
	const addressesParam = url.searchParams.get('addresses');
	if (!addressesParam) {
		throw error(400, 'Missing addresses parameter');
	}

	const addresses = addressesParam.split(',').map(a => a.trim()).filter(Boolean);
	if (addresses.length === 0) {
		throw error(400, 'No valid addresses provided');
	}

	try {
		// Get contract config
		const { data: contract, error: dbError } = await supabaseAdmin
			.from('slot_machine_configs')
			.select('*')
			.eq('contract_id', contractId)
			.single();

		if (dbError || !contract || !contract.ybt_app_id) {
			throw error(404, 'Contract not found or missing YBT configuration');
		}

		const ybtAppId = contract.ybt_app_id;

		// Query transactions from indexer
		const indexerClient = new algosdk.Indexer('', VOI_INDEXER_URL, '');
		const transactions: YBTTransaction[] = [];

		// Query transactions for each address
		for (const address of addresses) {
			try {
				// Query app transactions for this address
				const txnResponse = await indexerClient
					.searchForTransactions()
					.address(address)
					.applicationID(ybtAppId)
					.limit(100)
					.do();

				if (txnResponse && txnResponse.transactions) {
					for (const txn of txnResponse.transactions) {
						// Determine transaction type from app args
						const appArgs = txn['application-transaction']?.['application-args'];
						if (!appArgs || appArgs.length === 0) continue;

						// Decode first app arg (method name)
						const methodName = Buffer.from(appArgs[0], 'base64').toString('utf8');

						if (methodName === 'deposit' || methodName === 'withdraw') {
							// Extract VOI amount and shares from logs
							const logs = txn.logs || [];
							let voiAmount = 0n;
							let sharesAmount = 0n;

							// Parse transaction based on type
							if (methodName === 'deposit') {
								// For deposits, VOI amount is in the payment transaction in the group
								const groupTxns = await getGroupTransactions(
									indexerClient,
									txn['group'] || '',
									txn['confirmed-round']
								);
								voiAmount = getDepositAmountFromGroup(groupTxns, address);
								// Shares are typically in logs
								sharesAmount = parseSharesFromLogs(logs);
							} else {
								// For withdrawals, parse from app args and logs
								if (appArgs.length > 1) {
									const shareBytes = Buffer.from(appArgs[1], 'base64');
									sharesAmount = BigInt('0x' + shareBytes.toString('hex'));
								}
								voiAmount = parseVoiFromLogs(logs);
							}

							transactions.push({
								txHash: txn.id,
								type: methodName as 'deposit' | 'withdraw',
								address: address,
								contractId: contractId,
								ybtAppId: ybtAppId,
								voiAmount: voiAmount,
								sharesAmount: sharesAmount,
								timestamp: new Date((txn['round-time'] || 0) * 1000),
								blockNumber: txn['confirmed-round'] || 0,
								round: txn['confirmed-round'] || 0
							});
						}
					}
				}
			} catch (err) {
				console.error(`Error fetching transactions for ${address}:`, err);
				// Continue with other addresses
			}
		}

		// Sort by timestamp descending
		transactions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

		// Calculate profit/loss
		const profitLoss = await calculateProfitLoss(transactions, addresses, contract);

		// Convert BigInt values to strings for JSON serialization
		const serializedTransactions = transactions.map(txn => ({
			...txn,
			voiAmount: txn.voiAmount.toString(),
			sharesAmount: txn.sharesAmount.toString()
		}));

		const serializedProfitLoss = profitLoss ? {
			...profitLoss,
			amount: profitLoss.amount.toString(),
			totalDeposited: profitLoss.totalDeposited.toString(),
			totalWithdrawn: profitLoss.totalWithdrawn.toString(),
			currentValue: profitLoss.currentValue.toString()
		} : null;

		return json({
			transactions: serializedTransactions,
			profitLoss: serializedProfitLoss
		});
	} catch (err: any) {
		console.error('Error fetching transaction history:', err);

		if (err.status) {
			throw err;
		}

		throw error(500, err.message || 'Failed to fetch transaction history');
	}
};

/**
 * Get all transactions in a group
 */
async function getGroupTransactions(
	indexerClient: algosdk.Indexer,
	groupId: string,
	round: number
): Promise<any[]> {
	if (!groupId) return [];

	try {
		const response = await indexerClient
			.searchForTransactions()
			.txid(groupId)
			.round(round)
			.do();

		return response.transactions || [];
	} catch (err) {
		console.error('Error fetching group transactions:', err);
		return [];
	}
}

/**
 * Extract deposit amount from grouped transactions
 */
function getDepositAmountFromGroup(groupTxns: any[], address: string): bigint {
	// Look for payment transaction in the group
	for (const txn of groupTxns) {
		if (
			txn['tx-type'] === 'pay' &&
			txn['payment-transaction'] &&
			txn['sender'] === address
		) {
			return BigInt(txn['payment-transaction'].amount || 0);
		}
	}
	return 0n;
}

/**
 * Parse shares amount from transaction logs
 */
function parseSharesFromLogs(logs: string[]): bigint {
	// YBT contracts typically emit shares in logs
	// This is contract-specific, adjust based on your YBT implementation
	if (logs.length > 0) {
		try {
			// Assuming last log contains shares as uint64
			const logData = Buffer.from(logs[logs.length - 1], 'base64');
			if (logData.length >= 8) {
				return BigInt('0x' + logData.slice(-8).toString('hex'));
			}
		} catch (err) {
			console.error('Error parsing shares from logs:', err);
		}
	}
	return 0n;
}

/**
 * Parse VOI amount from withdrawal logs
 */
function parseVoiFromLogs(logs: string[]): bigint {
	// Similar to shares, but for withdrawal amount
	if (logs.length > 0) {
		try {
			const logData = Buffer.from(logs[0], 'base64');
			if (logData.length >= 8) {
				return BigInt('0x' + logData.slice(0, 8).toString('hex'));
			}
		} catch (err) {
			console.error('Error parsing VOI from logs:', err);
		}
	}
	return 0n;
}

/**
 * Calculate profit/loss from transaction history
 */
async function calculateProfitLoss(
	transactions: YBTTransaction[],
	addresses: string[],
	contract: any
): Promise<ProfitLoss> {
	let totalDeposited = 0n;
	let totalWithdrawn = 0n;

	for (const txn of transactions) {
		if (txn.type === 'deposit') {
			totalDeposited += txn.voiAmount;
		} else if (txn.type === 'withdraw') {
			totalWithdrawn += txn.voiAmount;
		}
	}

	// Get current position value
	let currentValue = 0n;
	try {
		// Use ybtService to get current portfolio value
		const portfolioService = (await import('$lib/voi/house/portfolio-service')).portfolioService;
		const portfolio = await portfolioService.getPortfolio(addresses, [contract]);
		currentValue = portfolio.totalValue;
	} catch (err) {
		console.error('Error getting current portfolio value:', err);
	}

	const netDeposited = totalDeposited - totalWithdrawn;
	const profitLossAmount = currentValue - netDeposited;
	const isProfit = profitLossAmount >= 0n;
	const profitLossPercentage =
		netDeposited > 0n ? (Number(profitLossAmount) / Number(netDeposited)) * 100 : 0;

	return {
		amount: profitLossAmount,
		percentage: profitLossPercentage,
		isProfit,
		totalDeposited,
		totalWithdrawn,
		currentValue
	};
}
