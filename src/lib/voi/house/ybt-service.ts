/**
 * YBT (Yield Bearing Token) Service
 * Handles deposits, withdrawals, and balance queries for house pool contracts
 */

import algosdk from 'algosdk';
import { CONTRACT } from 'ulujs';
import { signTransactions } from '$lib/voi/wallet-utils';
import type { SessionInfo } from '$lib/auth/session';
import type {
	DepositParams,
	WithdrawParams,
	TransactionResult,
	TreasuryBalance
} from '$lib/types/house';
import { PUBLIC_VOI_NODE_URL, PUBLIC_VOI_INDEXER_URL } from '$env/static/public';
import { APP_SPEC as YBTAppSpec } from './YieldBearingTokenClient';

// Voi network configuration
const VOI_NODE_URL = PUBLIC_VOI_NODE_URL || 'https://testnet-api.voi.nodly.io';
const VOI_INDEXER_URL = PUBLIC_VOI_INDEXER_URL || 'https://testnet-idx.voi.nodly.io';

class YBTService {
	private algodClient: algosdk.Algodv2;
	private indexerClient: algosdk.Indexer;
	private ybtABI = {
		name: "Yield Bearing Token",
		desc: "A yield bearing token contract",
		methods: YBTAppSpec.contract.methods,
		events: [] // Add empty events array as required by ulujs
	};

	constructor() {
		this.algodClient = new algosdk.Algodv2('', VOI_NODE_URL, '');
		this.indexerClient = new algosdk.Indexer('', VOI_INDEXER_URL, '');
	}

	/**
	 * Get YBT contract decimals using ABI call (NOT global state)
	 */
	async getYBTDecimals(ybtAppId: number): Promise<number> {
		try {
			const ci = new CONTRACT(
				ybtAppId,
				this.algodClient,
				undefined,
				this.ybtABI,
				{
					addr: algosdk.getApplicationAddress(ybtAppId).toString(),
					sk: new Uint8Array(0)
				}
			);

			const result = await ci.arc200_decimals();
			const decimals = result.success ? Number(result.returnValue || 9) : 9;

			console.log('YBT decimals for app', ybtAppId, '(via ABI):', decimals);
			return decimals;
		} catch (error) {
			console.error('Error fetching YBT decimals:', error);
			return 9; // Default to 9 decimals on error
		}
	}

	/**
	 * Get user's YBT balance (shares) for a specific contract
	 * Uses ABI function call to get authoritative balance from contract
	 */
	async getUserShares(ybtAppId: number, address: string): Promise<bigint> {
		try {
			// Create ulujs CONTRACT instance for read-only call
			const ci = new CONTRACT(
				ybtAppId,
				this.algodClient,
				undefined,
				this.ybtABI,
				{
					addr: address,
					sk: new Uint8Array(0)
				}
			);

			// Call arc200_balanceOf ABI method
			const result = await ci.arc200_balanceOf(address);

			if (!result.success) {
				console.log('arc200_balanceOf call failed for', address, 'in app', ybtAppId);
				return 0n;
			}

			const shares = BigInt(result.returnValue || 0);
			return shares;
		} catch (error: any) {
			// 404 error means the account hasn't opted into the app yet (no position)
			if (error?.status === 404 || error?.response?.status === 404) {
				console.log('Account has not opted into YBT app', ybtAppId, '- no position');
				return 0n;
			}
			// For other errors, log and return 0
			console.error('Error fetching user shares:', error);
			return 0n;
		}
	}

	/**
	 * Get treasury balance and YBT supply for a contract
	 */
	async getTreasuryBalance(contractId: number, ybtAppId: number): Promise<TreasuryBalance> {
		try {
			// Get slot machine contract actual VOI balance (in microVOI)
			const contractAddress = algosdk.getApplicationAddress(contractId);
			const accountInfo = await this.algodClient.accountInformation(contractAddress).do();
			const balanceTotal = BigInt(accountInfo.amount || 0);

			// For now, assume all balance is available (we can get locked balance from global state if needed)
			const balanceAvailable = balanceTotal;
			const balanceLocked = 0n;

			console.log('Slot machine balances (from account):', {
				contractAddress,
				balanceTotal: balanceTotal.toString(),
				balanceAvailable: balanceAvailable.toString(),
				balanceLocked: balanceLocked.toString()
			});

			// Get YBT total supply using ABI call (NOT global state)
			const ci = new CONTRACT(
				ybtAppId,
				this.algodClient,
				undefined,
				this.ybtABI,
				{
					addr: algosdk.getApplicationAddress(ybtAppId).toString(),
					sk: new Uint8Array(0)
				}
			);

			const totalSupplyResult = await ci.arc200_totalSupply();
			const totalSupply = totalSupplyResult.success
				? BigInt(totalSupplyResult.returnValue || 0)
				: 0n;

			console.log('YBT total supply (via ABI):', totalSupply.toString());

			// Get YBT decimals from contract
			const decimals = await this.getYBTDecimals(ybtAppId);

			// Calculate share price (VOI per YBT share) using actual decimals
			// Formula: (balanceTotal * 10^decimals) / totalSupply
			const decimalsMultiplier = 10n ** BigInt(decimals);
			const sharePrice = totalSupply > 0n
				? (balanceTotal * decimalsMultiplier) / totalSupply
				: decimalsMultiplier;

			console.log('Share price calculation:', {
				balanceTotal: balanceTotal.toString(),
				totalSupply: totalSupply.toString(),
				decimals,
				sharePrice: sharePrice.toString()
			});

			return {
				contractId,
				ybtAppId,
				balanceTotal,
				balanceAvailable,
				balanceLocked,
				totalSupply,
				decimals,
				sharePrice,
				lastUpdated: new Date()
			};
		} catch (error) {
			console.error('Error fetching treasury balance:', error);
			throw new Error('Failed to fetch treasury balance');
		}
	}

	/**
	 * Calculate VOI value of user's shares
	 * Formula: (userShares × contractValue) / totalSupply
	 * Returns value in microVOI
	 */
	calculateUserPortfolioValue(userShares: bigint, totalSupply: bigint, contractValue: bigint): bigint {
		try {
			if (totalSupply === 0n) {
				return 0n;
			}
			return (userShares * contractValue) / totalSupply;
		} catch (error) {
			console.error('Error calculating user portfolio value:', error);
			return 0n;
		}
	}

	/**
	 * Calculate share percentage of total supply
	 * Returns percentage with 2 decimal places (e.g., 1.23 for 1.23%)
	 */
	calculateSharePercentage(userShares: bigint, totalSupply: bigint): number {
		try {
			if (totalSupply === 0n) {
				return 0;
			}
			// Multiply by 10000 for 2 decimal precision, then divide by 100 to get percentage
			return Number((userShares * 10000n) / totalSupply) / 100;
		} catch (error) {
			console.error('Error calculating share percentage:', error, { userShares, totalSupply });
			return 0;
		}
	}

	/**
	 * Format raw shares value to human-readable number using decimals
	 * Example: 4884352331713 with decimals=9 → 4884.352331713
	 */
	formatShares(rawShares: bigint, decimals: number): number {
		try {
			const divisor = 10n ** BigInt(decimals);
			// Convert to number with proper decimal places
			// Use string division to maintain precision
			const wholePart = rawShares / divisor;
			const fractionalPart = rawShares % divisor;

			return Number(wholePart) + Number(fractionalPart) / Number(divisor);
		} catch (error) {
			console.error('Error formatting shares:', error, { rawShares, decimals });
			return 0;
		}
	}

	/**
	 * Deposit VOI into the house pool
	 * Uses ulujs CONTRACT with ABI to generate transactions automatically
	 * Uses simulate-to-get-box-references pattern to discover and add box references
	 */
	async deposit(params: DepositParams, session: SessionInfo | null): Promise<TransactionResult> {
		try {
			const { ybtAppId, amount, address, contractId } = params;

			// Create ulujs CONTRACT instance with ABI
			const ci = new CONTRACT(
				ybtAppId,
				this.algodClient,
				undefined,
				this.ybtABI,
				{
					addr: address,
					sk: new Uint8Array(0)
				}
			);

			// Enable raw bytes to help with box references (like prototype)
			ci.setEnableRawBytes(true);

			// Get suggested params for transaction reconstruction
			const suggestedParams = await this.algodClient.getTransactionParams().do();

			// Set payment amount and fee
			ci.setPaymentAmount(Number(amount));
			ci.setFee(4000);

			// Call deposit method - ulujs generates transactions automatically
			const result = await ci.deposit();

			if (!result.success) {
				throw new Error(`Deposit failed: ${result.error || 'Unknown error'}`);
			}

			if (!result.txns || result.txns.length === 0) {
				throw new Error('No transactions generated by ulujs');
			}

			// Decode base64 transaction strings to algosdk.Transaction[]
			let decodedTxns = result.txns.map((txnBlob: string) => {
				// Convert base64 string to Uint8Array (browser-compatible)
				const binaryString = atob(txnBlob);
				const bytes = new Uint8Array(binaryString.length);
				for (let i = 0; i < binaryString.length; i++) {
					bytes[i] = binaryString.charCodeAt(i);
				}
				return algosdk.decodeUnsignedTransaction(bytes);
			});

			// Manually add "bank_balances" box reference for the slot machine contract
			// The YBT deposit creates an inner transaction that needs this box
			// The box name is "bank_balances" (not hex - it's the string encoded as bytes)
			decodedTxns = decodedTxns.map((txn: algosdk.Transaction, idx: number) => {
				if (txn.type === algosdk.TransactionType.appl) {
					const appTxn = txn as algosdk.Transaction & { appIndex?: number; appArgs?: Uint8Array[]; onComplete?: number };
					// Only add boxes to the YBT deposit app call transaction
					if (appTxn.appIndex === ybtAppId && contractId) {
						// The box name is the string "bank_balances" encoded as UTF-8 bytes
						const bankBalancesBoxName = new TextEncoder().encode('bank_balances');
						
						// Create box reference for the slot machine contract
						const boxRef: { appIndex: number; name: Uint8Array } = {
							appIndex: contractId, // Slot machine contract app ID
							name: bankBalancesBoxName // String "bank_balances" as bytes
						};

						// Extract the exact sender address from the original transaction
						let originalSender: string;
						if (typeof txn.sender === 'string') {
							originalSender = txn.sender;
						} else if (txn.sender instanceof Uint8Array) {
							originalSender = algosdk.encodeAddress(txn.sender);
						} else if (txn.sender && typeof txn.sender === 'object') {
							if ('publicKey' in txn.sender) {
								originalSender = algosdk.encodeAddress((txn.sender as any).publicKey);
							} else if ('addr' in txn.sender) {
								originalSender = (txn.sender as any).addr;
							} else {
								originalSender = address; // Fallback
							}
						} else {
							originalSender = address; // Fallback
						}

						// Reconstruct the transaction with the box reference
						const txnSuggestedParams = {
							...suggestedParams,
							fee: txn.fee || suggestedParams.fee,
							firstValid: txn.firstValid || suggestedParams.firstValid,
							lastValid: txn.lastValid || suggestedParams.lastValid
						};

						return algosdk.makeApplicationCallTxnFromObject({
							sender: originalSender, // Preserve the exact sender from the original transaction
							appIndex: appTxn.appIndex!,
							onComplete: appTxn.onComplete || algosdk.OnApplicationComplete.NoOpOC,
							appArgs: appTxn.appArgs || [],
							boxes: [boxRef], // Add the bank_balances box reference
							suggestedParams: txnSuggestedParams
						});
					}
				}
				return txn;
			});

			// Sign and send transactions
			const signedTxns = await signTransactions(decodedTxns, address, session);
			const { txid } = await this.algodClient.sendRawTransaction(signedTxns).do();

			// Wait for confirmation
			await algosdk.waitForConfirmation(this.algodClient, txid, 4);

			// Extract shares from ulujs return value
			const shares = result.returnValue ? BigInt(result.returnValue) : 0n;

			return {
				success: true,
				txHash: txid,
				amount,
				shares
			};
		} catch (error) {
			console.error('Error depositing to YBT:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Deposit failed'
			};
		}
	}

	/**
	 * Withdraw VOI from the house pool
	 */
	async withdraw(params: WithdrawParams, session: SessionInfo | null): Promise<TransactionResult> {
		try {
			const { ybtAppId, shares, address } = params;

			// Get suggested transaction parameters
			const suggestedParams = await this.algodClient.getTransactionParams().do();

			// Application call to withdraw
			const withdrawTxn = algosdk.makeApplicationCallTxnFromObject({
				sender: address,
				appIndex: ybtAppId,
				onComplete: algosdk.OnApplicationComplete.NoOpOC,
				appArgs: [new Uint8Array(Buffer.from('withdraw')), algosdk.encodeUint64(Number(shares))],
				suggestedParams
			});

			// Sign and send
			const signedTxns = await signTransactions([withdrawTxn], address, session);
			const { txid } = await this.algodClient.sendRawTransaction(signedTxns).do();

			// Wait for confirmation
			await algosdk.waitForConfirmation(this.algodClient, txid, 4);

			// Get transaction info to determine VOI amount received
			const txInfo = await this.algodClient.pendingTransactionInformation(txid).do();
			const amount = 0n; // TODO: Parse from transaction logs

			return {
				success: true,
				txHash: txid,
				amount,
				shares
			};
		} catch (error) {
			console.error('Error withdrawing from YBT:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Withdrawal failed'
			};
		}
	}
}

export const ybtService = new YBTService();
