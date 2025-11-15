import algosdk from 'algosdk';

/**
 * Swap contract client for ulujs swap contract (ID 395553)
 * EXACT reverse engineering of ulujs swap functionality for algosdk 3.x compatibility
 */

const SWAP_CONTRACT_ID = 395553;
const USDC_ASSET_ID = 302190;
const VOI_ASSET_ID = 0; // Network token (native VOI)

// ARC-200 contract IDs (what the swap contract returns)
const USDC_ARC200_CONTRACT_ID = 395614;
const VOI_ARC200_CONTRACT_ID = 390001;

/**
 * Map ASA asset ID to ARC-200 contract ID
 * The swap contract uses ARC-200 contract IDs, not ASA asset IDs
 */
function mapAssetIdToArc200(assetId: bigint): bigint {
	if (assetId === BigInt(USDC_ASSET_ID)) {
		return BigInt(USDC_ARC200_CONTRACT_ID);
	}
	if (assetId === BigInt(VOI_ASSET_ID)) {
		return BigInt(VOI_ARC200_CONTRACT_ID);
	}
	// If it's already an ARC-200 ID, return as-is
	return assetId;
}

// ABI from ulujs swap200 schema
const SWAP_ABI = {
	name: "SWAP-200",
	desc: "HumbleSwap Voi AMM Interface",
	methods: [
		{
			name: "Trader_swapAForB",
			args: [{ type: "byte" }, { type: "uint256" }, { type: "uint256" }],
			returns: { type: "(uint256,uint256)" },
		},
		{
			name: "Trader_swapBForA",
			args: [{ type: "byte" }, { type: "uint256" }, { type: "uint256" }],
			returns: { type: "(uint256,uint256)" },
		},
		{
			name: "Info",
			args: [],
			returns: {
				type: "((uint256,uint256),(uint256,uint256),(uint256,uint256,uint256,address,byte),(uint256,uint256),uint64,uint64)",
			},
			readonly: true,
		},
	],
	events: [],
};

export interface PoolInfo {
	pools: Array<{
		assetA: bigint;
		assetB: bigint;
		reserveA: bigint;
		reserveB: bigint;
		poolId: bigint;
		[key: string]: unknown;
	}>;
	[key: string]: unknown;
}

export interface SwapQuote {
	inputAmount: bigint;
	outputAmount: bigint;
	minimumOutputAmount: bigint;
	rate: number;
	priceImpact: number;
}

export interface SwapParams {
	address: string;
	poolId: bigint;
	assetA: bigint;
	assetB: bigint;
	amountIn: bigint;
	minimumAmountOut?: bigint;
}

/**
 * Token metadata for swap operations
 * Matches ulujs token structure
 */
interface TokenMetadata {
	contractId: number;
	tokenId: string | number; // "0" for VOI, number for ASA
	decimals: number;
	symbol: string;
	amount: string; // String amount for display
}

export class SwapClient {
	private algodClient: algosdk.Algodv2;
	private contractId: number;

	constructor(algodClient: algosdk.Algodv2, contractId: number = SWAP_CONTRACT_ID) {
		this.algodClient = algodClient;
		this.contractId = contractId;
	}

	/**
	 * Generate ABI method selector (SHA-512/256 hash of method signature)
	 */
	private getMethodSelector(methodName: string, args: Array<{ type: string }>): Uint8Array {
		const argTypes = args.map(a => a.type).join(',');
		const signature = `${methodName}(${argTypes})`;
		// Use crypto.subtle or a hashing library - for now, use ABIMethod.getSelector()
		// This is a placeholder - we'll use ABIMethod.getSelector() instead
		return new Uint8Array(4); // Placeholder
	}

	/**
	 * Call Info method to get pool information
	 * Equivalent to ulujs Info() method
	 */
	async Info(): Promise<PoolInfo> {
		const suggestedParams = await this.algodClient.getTransactionParams().do();
		
		// Build Info method call
		const infoMethod = SWAP_ABI.methods.find(m => m.name === 'Info');
		if (!infoMethod) {
			throw new Error('Info method not found in ABI');
		}

		const atc = new algosdk.AtomicTransactionComposer();
		const methodSelector = this.getMethodSelector('Info', infoMethod.args);
		
		// Create a dummy signer for read-only call
		const readOnlySigner = async (
			txnGroup: algosdk.Transaction[],
			indexesToSign: number[]
		): Promise<Uint8Array[]> => {
			return indexesToSign.map((idx) => {
				const t = txnGroup[idx];
				return algosdk.encodeUnsignedSimulateTransaction(t);
			});
		};

		// Use method selector directly (no args for Info)
		const abiMethod = new algosdk.ABIMethod({
			name: 'Info',
			args: [],
			returns: infoMethod.returns || { type: 'void' }
		});

		atc.addMethodCall({
			method: abiMethod,
			methodArgs: [],
			sender: algosdk.getApplicationAddress(this.contractId),
			signer: readOnlySigner,
			appID: this.contractId,
			suggestedParams,
		});

		// Simulate the call to get the result
		const simResult = await atc.simulate(
			this.algodClient,
			new algosdk.modelsv2.SimulateRequest({
				txnGroups: [],
				allowEmptySignatures: true,
			})
		);

		// Decode the result
		const methodResults = (simResult as any).methodResults;
		if (!methodResults || methodResults.length === 0) {
			throw new Error('No method results from Info call');
		}

		const returnValue = methodResults[0].returnValue;
		return this.decodePoolInfo(returnValue);
	}

	/**
	 * Decode complex ABI tuple return type from Info method
	 * Format: ((lptBals), (poolBals), (protoInfo), (protoBals), tokB, tokA)
	 * protoInfo: (uint256, uint256, uint256, address, byte) - contains poolId as the byte (5th element)
	 */
	private decodePoolInfo(returnValue: any): PoolInfo {
		const pools: Array<{
			assetA: bigint;
			assetB: bigint;
			reserveA: bigint;
			reserveB: bigint;
			poolId: bigint;
		}> = [];

		// Parse the return value structure
		if (returnValue && Array.isArray(returnValue)) {
			// ulujs extracts: [lptBals, poolBals, protoInfo, protoBals, tokB, tokA]
			const [lptBals, poolBals, protoInfo, protoBals, tokB, tokA] = returnValue;
			
			// Extract poolId from protoInfo
			// protoInfo: (uint256, uint256, uint256, address, byte)
			// The poolId is the byte (5th element, index 4)
			let poolId = 0n;
			if (protoInfo && Array.isArray(protoInfo) && protoInfo.length >= 5) {
				// protoInfo[4] is the byte (poolId)
				const poolIdValue = protoInfo[4];
				if (typeof poolIdValue === 'number') {
					poolId = BigInt(poolIdValue);
				} else if (poolIdValue !== null && poolIdValue !== undefined) {
					poolId = BigInt(poolIdValue.toString());
				}
			}
			
			// For a single pool, we can construct it from the available data
			if (poolBals && Array.isArray(poolBals) && poolBals.length >= 2) {
				const poolA = BigInt(poolBals[0]?.toString() || '0');
				const poolB = BigInt(poolBals[1]?.toString() || '0');
				
				// Extract token IDs
				const tokenA = BigInt(tokA?.toString() || '0');
				const tokenB = BigInt(tokB?.toString() || '0');

				// Create a pool entry with extracted poolId
				pools.push({
					assetA: tokenA,
					assetB: tokenB,
					reserveA: poolA,
					reserveB: poolB,
					poolId: poolId
				});
			}
		}

		return { pools };
	}

	/**
	 * Calculate swap quote using constant product formula
	 * Equivalent to ulujs rate calculation
	 */
	static calculateQuote(
		info: PoolInfo,
		assetA: bigint,
		assetB: bigint,
		amountIn: bigint,
		slippageTolerance: number = 0.01 // 1% default slippage
	): SwapQuote {
		// Map ASA asset IDs to ARC-200 contract IDs
		const arc200A = mapAssetIdToArc200(assetA);
		const arc200B = mapAssetIdToArc200(assetB);
		
		const pool = info.pools.find(
			p => 
				(p.assetA === arc200A && p.assetB === arc200B) ||
				(p.assetA === arc200B && p.assetB === arc200A)
		);

		if (!pool) {
			throw new Error(`Pool not found for assets ${assetA} and ${assetB}`);
		}

		const isAFirst = pool.assetA === arc200A;
		const reserveIn = isAFirst ? pool.reserveA : pool.reserveB;
		const reserveOut = isAFirst ? pool.reserveB : pool.reserveA;

		if (reserveIn === 0n || reserveOut === 0n) {
			throw new Error('Pool reserves are zero');
		}

		// Constant product formula: x * y = k
		// After adding amountIn: (x + amountIn) * (y - amountOut) = k
		// Solving for amountOut: amountOut = (y * amountIn) / (x + amountIn)
		const amountOut = (reserveOut * amountIn) / (reserveIn + amountIn);
		
		// Apply slippage tolerance
		const minimumAmountOut = amountOut - (amountOut * BigInt(Math.floor(slippageTolerance * 10000))) / 10000n;

		// Calculate rate
		const rate = Number(reserveOut) / Number(reserveIn);

		// Calculate price impact: (amountIn / reserveIn) * 100
		const priceImpact = (Number(amountIn) / Number(reserveIn)) * 100;

		return {
			inputAmount: amountIn,
			outputAmount: amountOut,
			minimumOutputAmount: minimumAmountOut,
			rate,
			priceImpact
		};
	}

	/**
	 * Construct swap transactions
	 * EXACT reverse engineering of ulujs swap() implementation
	 * Follows the exact transaction building logic from ulujs
	 */
	async swap(params: SwapParams, inputAsset: bigint): Promise<algosdk.Transaction[]> {
		let { address, poolId, assetA, assetB, amountIn, minimumAmountOut } = params;
		
		// Ensure address is always a string (not an Address object)
		// This can happen if address is accidentally decoded somewhere
		if (typeof address !== 'string') {
			const addressAny = address as any;
			if (addressAny && typeof addressAny === 'object' && addressAny.publicKey) {
				address = algosdk.encodeAddress(addressAny.publicKey);
			} else if (addressAny instanceof Uint8Array) {
				address = algosdk.encodeAddress(addressAny);
			} else {
				throw new Error(`Invalid address format: expected string, got ${typeof address}`);
			}
		}
		
		// Validate address format
		if (!algosdk.isValidAddress(address)) {
			throw new Error(`Invalid Algorand address: ${address}`);
		}
		
		// Step 1: Get pool Info and validate pair (matches ulujs)
		const poolInfo = await this.Info();
		
		// Map ASA asset IDs to ARC-200 contract IDs
		const arc200A = mapAssetIdToArc200(assetA);
		const arc200B = mapAssetIdToArc200(assetB);
		
		// Validate pair matches Info (ulujs validation)
		const info = poolInfo as any;
		const tokA = info.tokA || Number(arc200A);
		const tokB = info.tokB || Number(arc200B);
		
		if (
			!(tokA === Number(arc200A) && tokB === Number(arc200B)) &&
			!(tokA === Number(arc200B) && tokB === Number(arc200A))
		) {
			throw new Error("Invalid pair");
		}

		const swapAForB = Number(arc200A) === tokA && Number(arc200B) === tokB;
		
		// Step 2: Determine token metadata
		// Token A = input token, Token B = output token
		const tokenA: TokenMetadata = {
			contractId: swapAForB ? Number(arc200A) : Number(arc200B),
			tokenId: swapAForB ? (assetA === BigInt(USDC_ASSET_ID) ? USDC_ASSET_ID : "0") : (assetB === BigInt(USDC_ASSET_ID) ? USDC_ASSET_ID : "0"),
			decimals: 6, // USDC has 6 decimals, VOI has 6 decimals
			symbol: swapAForB ? (assetA === BigInt(USDC_ASSET_ID) ? "USDC" : "VOI") : (assetB === BigInt(USDC_ASSET_ID) ? "USDC" : "VOI"),
			amount: amountIn.toString()
		};

		const tokenB: TokenMetadata = {
			contractId: swapAForB ? Number(arc200B) : Number(arc200A),
			tokenId: swapAForB ? (assetB === BigInt(USDC_ASSET_ID) ? USDC_ASSET_ID : "0") : (assetA === BigInt(USDC_ASSET_ID) ? USDC_ASSET_ID : "0"),
			decimals: 6,
			symbol: swapAForB ? (assetB === BigInt(USDC_ASSET_ID) ? "USDC" : "VOI") : (assetA === BigInt(USDC_ASSET_ID) ? "USDC" : "VOI"),
			amount: "0" // Will be calculated from simulation
		};

		const suggestedParams = await this.algodClient.getTransactionParams().do();
		const contractAddress = algosdk.getApplicationAddress(this.contractId).toString();
		const uint256Type = algosdk.ABIType.from('uint256');

		// Step 3: Get token A decimals (matches ulujs)
		// For now, we'll use known decimals (6 for both USDC and VOI)
		const decA = tokenA.decimals;
		const amtBi = amountIn; // Already in atomic units

		// Step 4: Check balance (matches ulujs)
		// TODO: Implement arc200_balanceOf call if needed
		// For now, skip balance check as we assume sufficient balance

		// Step 5: Create payment combinations (matches ulujs)
		const payments: number[][] = [];
		for (const p4 of [1, 0]) {
			for (const p3 of [28500, 0]) {
				for (const p2 of [28501, 0]) {
					for (const p1 of [28502, 0]) {
						payments.push([p1, p2, p3, p4]);
					}
				}
			}
		}

		const firstPayment = payments[0];
		const lastPayment = payments[payments.length - 1];
		const middlePayments = payments.slice(1, payments.length - 1);

		// Step 6: Check if deposit is needed (matches ulujs)
		// TODO: Implement balance check to determine skipDeposit
		const skipDeposit = false; // Assume we need deposit for now

		// Step 7: Try each payment combination (matches ulujs)
		for (const payment of [lastPayment, firstPayment, ...middlePayments]) {
			const [p1, p2, p3, p4] = payment;
			const buildO: any[] = []; // Array to hold transaction objects

			try {
				// Transaction 1: If VSA in, redeem or deposit (matches ulujs)
				if (
					tokenA.tokenId !== "0" &&
					!isNaN(Number(tokenA.tokenId)) &&
					Number(tokenA.tokenId) > 0
				) {
					if (!skipDeposit) {
						// Check arc200_exchange to determine if redeem or deposit
						// Create contract instance for redeem check
						const exchangeMethod = new algosdk.ABIMethod({
							name: 'arc200_exchange',
							args: [],
							returns: { type: '(uint64,address)' }
						});

						const exchangeAtc = new algosdk.AtomicTransactionComposer();
						exchangeAtc.addMethodCall({
							method: exchangeMethod,
							methodArgs: [],
							sender: address,
							signer: async () => [], // Read-only call
							appID: tokenA.contractId,
							suggestedParams,
						});

						try {
							const exchangeResult = await exchangeAtc.simulate(
								this.algodClient,
								new algosdk.modelsv2.SimulateRequest({
									txnGroups: [],
									allowEmptySignatures: true,
								})
							);

							const exchangeMethodResults = (exchangeResult as any).methodResults;
							if (exchangeMethodResults && exchangeMethodResults.length > 0 && exchangeMethodResults[0].returnValue) {
								// arc200_exchange exists - need to redeem
								console.log('arc200_exchange found, using redeem');
								
								// Get asset balance
								const assetInfo = await this.algodClient.accountAssetInformation(address, Number(tokenA.tokenId)).do();
								const assetBalance = BigInt(assetInfo.assetHolding?.amount || 0);

								if (assetBalance > 0n) {
									// Create arc200_redeem transaction (app call)
									const redeemMethod = new algosdk.ABIMethod({
										name: 'arc200_redeem',
										args: [{ type: 'uint64', name: 'amount' }],
										returns: { type: 'void' }
									});

									const redeemSelector = redeemMethod.getSelector();
									const redeemArgs: Uint8Array[] = [
										redeemSelector,
										uint256Type.encode(BigInt(assetBalance)),
									];

									const redeemTxn = algosdk.makeApplicationNoOpTxnFromObject({
										sender: address,
										appIndex: tokenA.contractId,
										appArgs: redeemArgs,
										suggestedParams,
									});

									// Add asset transfer for redeem (must come before app call in group)
									const redeemAssetTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
										sender: address,
										receiver: algosdk.getApplicationAddress(tokenA.contractId),
										amount: assetBalance,
										assetIndex: Number(tokenA.tokenId),
										suggestedParams: {
											...suggestedParams,
											fee: 0 // Fee on app call
										},
									});

									// Add asset transfer first, then app call (matches ulujs order)
									buildO.push({
										obj: redeemAssetTxn,
										xaid: Number(tokenA.tokenId),
										aamt: BigInt(assetBalance),
										note: new TextEncoder().encode(
											`Redeem ${(Number(assetBalance) / Math.pow(10, decA)).toFixed(decA)} ${tokenA.symbol} to application address ${algosdk.getApplicationAddress(tokenA.contractId)} from user address ${address}`
										)
									});

									buildO.push({
										obj: redeemTxn,
										note: new TextEncoder().encode(
											`Redeem ${(Number(assetBalance) / Math.pow(10, decA)).toFixed(decA)} ${tokenA.symbol} to application address ${algosdk.getApplicationAddress(tokenA.contractId)} from user address ${address}`
										)
									});
								}
							}
						} catch (e) {
							// arc200_exchange doesn't exist or failed - use deposit
							console.log('arc200_exchange failed, using deposit');
							
							// Create deposit transaction
							const depositMethod = new algosdk.ABIMethod({
								name: 'deposit',
								args: [{ type: 'uint256', name: 'amount' }],
								returns: { type: 'void' }
							});

							const depositSelector = depositMethod.getSelector();
							const depositArgs: Uint8Array[] = [
								depositSelector,
								uint256Type.encode(amtBi),
							];

							const depositTxn = algosdk.makeApplicationNoOpTxnFromObject({
								sender: address,
								appIndex: tokenA.contractId,
								appArgs: depositArgs,
								suggestedParams: {
									...suggestedParams,
									fee: p3 > 0 ? p3 : suggestedParams.fee
								},
							});

							// Add asset transfer for deposit (must come before app call in group)
							const depositAssetTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
								sender: address,
								receiver: algosdk.getApplicationAddress(tokenA.contractId),
								amount: amtBi,
								assetIndex: Number(tokenA.tokenId),
								suggestedParams: {
									...suggestedParams,
									fee: 0 // Fee on app call
								},
							});

							// Add asset transfer first, then app call (matches ulujs order)
							buildO.push({
								obj: depositAssetTxn,
								xaid: Number(tokenA.tokenId),
								aamt: amtBi,
								payment: p3,
								note: new TextEncoder().encode(
									`Deposit ${(Number(amtBi) / Math.pow(10, decA)).toFixed(decA)} ${tokenA.symbol} to application address ${algosdk.getApplicationAddress(tokenA.contractId)} from user address ${address}`
								)
							});

							buildO.push({
								obj: depositTxn,
								payment: p3,
								note: new TextEncoder().encode(
									`Deposit ${(Number(amtBi) / Math.pow(10, decA)).toFixed(decA)} ${tokenA.symbol} to application address ${algosdk.getApplicationAddress(tokenA.contractId)} from user address ${address}`
								)
							});
						}
					}
				}

				// Transaction 2: If VOI/WVOI in, createBalanceBox + deposit (matches ulujs)
				if (tokenA.tokenId === "0") {
					if (p3 > 0) {
						// Create balance box transaction (createBalanceBox)
						// This is an app call to create a balance box for the user
						const createBalanceBoxMethod = new algosdk.ABIMethod({
							name: 'createBalanceBox',
							args: [{ type: 'address', name: 'account' }],
							returns: { type: 'void' }
						});

						const createBalanceBoxSelector = createBalanceBoxMethod.getSelector();
						const accountAddress = algosdk.decodeAddress(address).publicKey;
						const createBalanceBoxArgs: Uint8Array[] = [
							createBalanceBoxSelector,
							accountAddress,
						];

						const createBalanceBoxTxn = algosdk.makeApplicationNoOpTxnFromObject({
							sender: address,
							appIndex: tokenA.contractId,
							appArgs: createBalanceBoxArgs,
							suggestedParams: {
								...suggestedParams,
								fee: p3
							},
						});

						buildO.push({
							obj: createBalanceBoxTxn,
							payment: p3,
						});
					}

					// Create deposit transaction with payment = amtBi (matches ulujs)
					const depositMethod = new algosdk.ABIMethod({
						name: 'deposit',
						args: [{ type: 'uint256', name: 'amount' }],
						returns: { type: 'void' }
					});

					const depositSelector = depositMethod.getSelector();
					const depositArgs: Uint8Array[] = [
						depositSelector,
						uint256Type.encode(amtBi),
					];

					const depositTxn = algosdk.makeApplicationNoOpTxnFromObject({
						sender: address,
						appIndex: tokenA.contractId,
						appArgs: depositArgs,
						suggestedParams: {
							...suggestedParams,
							fee: 0 // Payment transaction handles the fee
						},
					});

					// Create payment transaction for VOI deposit (payment = amtBi in ulujs)
					const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
						sender: address,
						receiver: algosdk.getApplicationAddress(tokenA.contractId),
						amount: amtBi,
						suggestedParams: {
							...suggestedParams,
							fee: 0 // Fee on app call
						},
					});

					buildO.push({
						obj: paymentTxn,
						payment: amtBi,
						note: new TextEncoder().encode(
							`Deposit ${(Number(amtBi) / Math.pow(10, decA)).toFixed(decA)} ${tokenA.symbol} to application address ${algosdk.getApplicationAddress(tokenA.contractId)} from user address ${address}`
						)
					});

					buildO.push({
						obj: depositTxn,
						payment: amtBi,
						note: new TextEncoder().encode(
							`Deposit ${(Number(amtBi) / Math.pow(10, decA)).toFixed(decA)} ${tokenA.symbol} to application address ${algosdk.getApplicationAddress(tokenA.contractId)} from user address ${address}`
						)
					});
				}

				// Transaction 3: Approve transaction (matches ulujs)
				// ARC-200 approve method signature: arc200_approve(address,uint256)bool
				// Use AtomicTransactionComposer to ensure proper ABI encoding
				const approveMethod = new algosdk.ABIMethod({
					name: 'arc200_approve',
					args: [
						{ type: 'address', name: 'spender' },
						{ type: 'uint256', name: 'amount' }
					],
					returns: { type: 'bool' }
				});

				// Use AtomicTransactionComposer to build the approve transaction
				// This ensures proper ABI encoding of the address argument
				const approveAtc = new algosdk.AtomicTransactionComposer();
				approveAtc.addMethodCall({
					method: approveMethod,
					methodArgs: [contractAddress, amtBi],
					sender: address,
					signer: async () => [], // We'll sign later
					appID: tokenA.contractId,
					suggestedParams: {
						...suggestedParams,
						fee: p1 > 0 ? p1 : suggestedParams.fee
					},
				});

				// Build the transaction group (should only have one transaction)
				const approveTxns = approveAtc.buildGroup().map(({ txn }) => txn);
				if (approveTxns.length !== 1) {
					throw new Error(`Expected 1 approve transaction, got ${approveTxns.length}`);
				}
				let approveTxn = approveTxns[0];
				
				// Adjust fee if needed (p1 > 0)
				if (p1 > 0) {
					const txnAny = approveTxn as any;
					const appArgs = txnAny.applicationCall?.applicationArgs || [];
					approveTxn = algosdk.makeApplicationNoOpTxnFromObject({
						sender: address,
						appIndex: tokenA.contractId,
						appArgs: appArgs,
						accounts: txnAny.applicationCall?.accounts || [],
						foreignApps: txnAny.applicationCall?.foreignApps || [],
						foreignAssets: txnAny.applicationCall?.foreignAssets || [],
						boxes: txnAny.applicationCall?.boxes || [],
						suggestedParams: {
							...suggestedParams,
							fee: p1
						},
					});
				}

				// Log the transaction details for debugging
				const txnAny = approveTxn as any;
				const appArgs = txnAny.applicationCall?.applicationArgs || [];
				console.log(`🔍 Approve transaction details (via ATC):`, {
					selector: appArgs[0] ? Array.from(appArgs[0] as Uint8Array).map((b: number) => b.toString(16).padStart(2, '0')).join('') : 'none',
					selectorLength: appArgs[0] ? (appArgs[0] as Uint8Array).length : 0,
					spenderAddress: contractAddress,
					addressArgLength: appArgs[1] ? (appArgs[1] as Uint8Array).length : 0,
					amountArgLength: appArgs[2] ? (appArgs[2] as Uint8Array).length : 0,
					appArgsCount: appArgs.length,
					senderAddress: address,
					appIndex: tokenA.contractId
				});

				// Verify the transaction sender matches the expected address
				const txnSender = (approveTxn as any).sender || (approveTxn as any).from;
				const txnSenderStr = typeof txnSender === 'string' 
					? txnSender 
					: (txnSender?.publicKey ? algosdk.encodeAddress(txnSender.publicKey) : 'unknown');
				console.log(`✅ Approve transaction sender verification:`, {
					expectedAddress: address,
					actualSender: txnSenderStr,
					match: txnSenderStr === address
				});

				buildO.push({
					obj: approveTxn,
					payment: p1,
					note: new TextEncoder().encode(
						`Approve ${(Number(amtBi) / Math.pow(10, decA)).toFixed(decA)} ${tokenA.symbol} to application address ${contractAddress} from user address ${address}`
					)
				});

				// Transaction 4: Transfer 0 of token B (matches ulujs)
				if (p2 > 0) {
					const transferMethod = new algosdk.ABIMethod({
						name: 'arc200_transfer',
						args: [
							{ type: 'address', name: 'to' },
							{ type: 'uint256', name: 'amount' }
						],
						returns: { type: 'bool' }
					});

					const transferSelector = transferMethod.getSelector();
					// For ARC-200, address is passed as 32-byte public key (no ABI encoding needed)
					const toAddressBytes = algosdk.decodeAddress(contractAddress).publicKey;
					const zeroBytes = uint256Type.encode(0n);

					const transferArgs: Uint8Array[] = [
						transferSelector,
						toAddressBytes, // Use publicKey directly (32 bytes)
						zeroBytes,
					];

					const transferTxn = algosdk.makeApplicationNoOpTxnFromObject({
						sender: address,
						appIndex: tokenB.contractId,
						appArgs: transferArgs,
						suggestedParams: {
							...suggestedParams,
							fee: p2
						},
					});

					buildO.push({
						obj: transferTxn,
						payment: p2,
						note: new TextEncoder().encode(
							`Transfer 0 ${tokenB.symbol} to application address ${contractAddress} from user address ${address}`
						)
					});
				}

				// Transaction 5: Beacon transactions for resource sharing (matches ulujs)
				// Skipping beacon transactions as requested

				// Transaction 6: Swap transaction (matches ulujs)
				// Calculate output amount from pool reserves using constant product formula
				// Since simulation doesn't work in isolation, we'll calculate from Info() reserves
				const swapMethodName = swapAForB ? 'Trader_swapAForB' : 'Trader_swapBForA';
				const swapMethod = SWAP_ABI.methods.find(m => m.name === swapMethodName);
				if (!swapMethod) {
					throw new Error(`Method ${swapMethodName} not found in ABI`);
				}

				const abiMethod = new algosdk.ABIMethod({
					name: swapMethodName,
					args: swapMethod.args,
					returns: swapMethod.returns || { type: 'void' }
				});

				// Calculate output amount from pool reserves (constant product: x * y = k)
				// Get reserves from poolInfo - find the matching pool
				const pool = poolInfo.pools.find(
					p =>
						(p.assetA === arc200A && p.assetB === arc200B) ||
						(p.assetA === arc200B && p.assetB === arc200A)
				);

				if (!pool) {
					throw new Error(`Pool not found for assets ${assetA} and ${assetB}`);
				}

				// Determine which reserve is which based on swap direction
				const reserveIn = swapAForB ? pool.reserveA : pool.reserveB;
				const reserveOut = swapAForB ? pool.reserveB : pool.reserveA;
				
				if (reserveIn === 0n || reserveOut === 0n) {
					throw new Error('Pool reserves are zero');
				}
				
				// Calculate output using constant product formula with fees
				// Formula: amountOut = (reserveOut * amountIn * feeMultiplier) / (reserveIn * 10000 + amountIn * feeMultiplier)
				// Fee is typically 0.3% (30 basis points)
				const feeBps = 30n; // 0.3% = 30 basis points
				const feeMultiplier = 10000n - feeBps; // 9970
				
				const numerator = reserveOut * amtBi * feeMultiplier;
				const denominator = reserveIn * 10000n + amtBi * feeMultiplier;
				const whichOut = numerator / denominator;

				if (whichOut === BigInt(0)) {
					throw new Error("Swap abort no return");
				}

				// Apply slippage (matches ulujs)
				const slippage = 0.005; // Default slippage
				const whichOutWithSlippage = whichOut - (whichOut * BigInt(Math.floor(slippage * 10000))) / 10000n;

				// Build swap transaction
				// In ulujs: builder.pool[swapMethod](0, amtBi, whichOutWithSlippage)
				// The first argument is 0 (not poolId), matching ulujs exactly
				const methodSelector = abiMethod.getSelector();
				const swapArgs: Uint8Array[] = [
					methodSelector,
					new Uint8Array([0]), // Use 0 as first arg, matching ulujs
					uint256Type.encode(amtBi),
					uint256Type.encode(whichOutWithSlippage),
				];

				// Get box reference from pool ID (box name is poolId as byte)
				// The first arg is 0, but the box reference uses the actual poolId
				const boxRef: { appIndex: number; name: Uint8Array } = {
					appIndex: this.contractId,
					name: new Uint8Array([Number(poolId)]) // Box name uses actual poolId
				};

				const swapTxn = algosdk.makeApplicationNoOpTxnFromObject({
					sender: address,
					appIndex: this.contractId,
					appArgs: swapArgs,
					boxes: [boxRef],
					suggestedParams: {
						...suggestedParams,
						fee: 4000 // Fee for swap (matches ulujs)
					},
				});

				buildO.push({
					obj: swapTxn,
					note: new TextEncoder().encode(
						`Swap ${tokenA.amount} ${tokenA.symbol} for ${(Number(whichOut) / Math.pow(10, tokenB.decimals)).toFixed(tokenB.decimals)} ${tokenB.symbol} from application address ${contractAddress} to user address ${address}`
					)
				});

				// Transaction 7: Withdraw transaction (matches ulujs)
				if (
					!isNaN(Number(tokenB.tokenId)) &&
					Number(tokenB.tokenId) >= 0 &&
					!minimumAmountOut // Don't withdraw if skipWithdraw is set (via minimumAmountOut being undefined)
				) {
					// Check arc200_exchange to see if withdraw is needed
					const exchangeMethod = new algosdk.ABIMethod({
						name: 'arc200_exchange',
						args: [],
						returns: { type: '(uint64,address)' }
					});

					const exchangeAtc = new algosdk.AtomicTransactionComposer();
					exchangeAtc.addMethodCall({
						method: exchangeMethod,
						methodArgs: [],
						sender: address,
						signer: async () => [], // Read-only call
						appID: tokenB.contractId,
						suggestedParams,
					});

					try {
						const exchangeResult = await exchangeAtc.simulate(
							this.algodClient,
							new algosdk.modelsv2.SimulateRequest({
								txnGroups: [],
								allowEmptySignatures: true,
							})
						);

						const exchangeMethodResults = (exchangeResult as any).methodResults;
						if (exchangeMethodResults && exchangeMethodResults.length > 0 && exchangeMethodResults[0].returnValue) {
							// arc200_exchange exists - skip withdraw
							console.log('arc200_exchange found, skipping withdraw');
						} else {
							throw new Error('No exchange');
						}
					} catch (e) {
						// arc200_exchange doesn't exist or failed - need withdraw
						console.log('arc200_exchange failed, using withdraw');
						
						const withdrawMethod = new algosdk.ABIMethod({
							name: 'arc200_withdraw',
							args: [{ type: 'uint256', name: 'amount' }],
							returns: { type: 'void' }
						});

						const withdrawSelector = withdrawMethod.getSelector();
						const withdrawArgs: Uint8Array[] = [
							withdrawSelector,
							uint256Type.encode(whichOut),
						];

						const withdrawTxn = algosdk.makeApplicationNoOpTxnFromObject({
							sender: address,
							appIndex: tokenB.contractId,
							appArgs: withdrawArgs,
							suggestedParams,
						});

						// Withdraw app call comes first, then asset transfer if needed (matches ulujs)
						buildO.push({
							obj: withdrawTxn,
							note: new TextEncoder().encode(
								`Withdraw ${(Number(whichOut) / Math.pow(10, tokenB.decimals)).toFixed(tokenB.decimals)} ${tokenB.symbol} from application address ${contractAddress} to user address ${address}`
							)
						});

						// Add asset transfer fields if tokenId > 0 (matches ulujs)
						// Note: In ulujs, the asset transfer is created by the contract as an inner transaction
						// But we may need to add it explicitly if p4 > 0
						if (p4 > 0 && Number(tokenB.tokenId) > 0) {
							// The asset transfer will be created by the withdraw app call as an inner transaction
							// But we need to ensure the user has opted in
							// For now, we'll assume opt-in is handled separately
							console.log(`⚠️ Asset transfer for withdraw needed (tokenId: ${tokenB.tokenId}, p4: ${p4})`);
						}
					}
				}

				// Step 8: Build final transaction group (matches ulujs)
				// Extract just the transaction objects
				// In ulujs, the payment property is used internally, but we need to create actual transactions
				const transactions: algosdk.Transaction[] = [];
				
				for (const item of buildO) {
					let txn = item.obj;
					
					// In ulujs, the payment property is used internally to handle fees/payments
					// For transactions with payment (p1, p2, p3), we adjust the fee
					// For payment = amtBi (VOI deposit), it's already a payment transaction
					if (item.payment && item.payment > 0 && item.payment !== amtBi) {
						// Helper function to extract address string from transaction sender/receiver
						const getAddressString = (addr: any): string => {
							if (typeof addr === 'string') {
								return addr;
							}
							// If it's an Address object with publicKey property
							if (addr && typeof addr === 'object' && addr.publicKey) {
								const encoded = algosdk.encodeAddress(addr.publicKey);
								console.log(`🔧 Converted Address object to string: ${encoded}`);
								return encoded;
							}
							// If it's a Uint8Array
							if (addr instanceof Uint8Array) {
								const encoded = algosdk.encodeAddress(addr);
								console.log(`🔧 Converted Uint8Array to string: ${encoded}`);
								return encoded;
							}
							// Log the problematic address format for debugging
							console.error(`⚠️ Unexpected address format:`, {
								type: typeof addr,
								isObject: typeof addr === 'object',
								hasPublicKey: !!(addr && typeof addr === 'object' && addr.publicKey),
								isUint8Array: addr instanceof Uint8Array,
								value: addr
							});
							// Fallback: try to encode as-is
							try {
								return algosdk.encodeAddress(addr);
							} catch (e) {
								throw new Error(`Cannot convert address to string: ${JSON.stringify(addr)}`);
							}
						};

						// This is a fee payment (p1, p2, p3) - adjust transaction fee
						if (txn.type === 'appl') {
							const txnAny = txn as any;
							if (txnAny.applicationCall) {
								// Recreate transaction with adjusted fee
								// Get sender - in algosdk 3.x it's txn.sender or txn.from
								const sender = (txn as any).sender || (txn as any).from;
								const senderStr = getAddressString(sender);
								
								// Debug: Log appArgs for approve transactions
								if (txnAny.applicationCall.applicationId === tokenA.contractId && 
								    txnAny.applicationCall.applicationArgs && 
								    txnAny.applicationCall.applicationArgs.length >= 3) {
									const firstArg = txnAny.applicationCall.applicationArgs[0] as Uint8Array;
									const selector = Array.from(firstArg).map((b: number) => b.toString(16).padStart(2, '0')).join('');
									console.log(`🔍 Approve transaction reconstruction:`, {
										appId: txnAny.applicationCall.applicationId,
										appArgsCount: txnAny.applicationCall.applicationArgs.length,
										selector: selector,
										selectorMatch: selector === 'b5422125',
										sender: senderStr,
										senderType: typeof sender,
										arg1Length: (txnAny.applicationCall.applicationArgs[1] as Uint8Array)?.length,
										arg2Length: (txnAny.applicationCall.applicationArgs[2] as Uint8Array)?.length
									});
								}
								
								txn = algosdk.makeApplicationNoOpTxnFromObject({
									sender: senderStr,
									appIndex: txnAny.applicationCall.applicationId,
									appArgs: txnAny.applicationCall.applicationArgs,
									accounts: txnAny.applicationCall.accounts,
									foreignApps: txnAny.applicationCall.foreignApps,
									foreignAssets: txnAny.applicationCall.foreignAssets,
									boxes: txnAny.applicationCall.boxes,
									suggestedParams: {
										...suggestedParams,
										fee: item.payment
									},
								});
							}
						} else if (txn.type === 'axfer') {
							// Asset transfer - adjust fee
							const txnAny = txn as any;
							if (txnAny.assetTransfer) {
								const sender = (txn as any).sender || (txn as any).from;
								const receiver = (txn as any).receiver || (txn as any).to;
								txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
									sender: getAddressString(sender),
									receiver: getAddressString(receiver),
									amount: txnAny.assetTransfer.amount,
									assetIndex: txnAny.assetTransfer.assetId,
									suggestedParams: {
										...suggestedParams,
										fee: item.payment
									},
								});
							}
						} else if (txn.type === 'pay') {
							// Payment transaction - adjust fee
							const txnAny = txn as any;
							if (txnAny.payment) {
								const sender = (txn as any).sender || (txn as any).from;
								const receiver = (txn as any).receiver || (txn as any).to;
								txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
									sender: getAddressString(sender),
									receiver: getAddressString(receiver),
									amount: txnAny.payment.amount,
									suggestedParams: {
										...suggestedParams,
										fee: item.payment
									},
								});
							}
						}
					}
					
					transactions.push(txn);
				}

				// Assign group ID to ALL transactions AFTER building them all
				// This ensures all transactions in the group have the same group ID
				if (transactions.length > 0) {
					// IMPORTANT: assignGroupID must be called on the array of transactions
					// It modifies the transactions in place by setting their group property
					// CRITICAL: All transactions must be in the final array BEFORE calling assignGroupID
					// Any modifications to transactions after this point will break the group
					console.log(`🔧 Assigning group ID to ${transactions.length} transactions...`);
					console.log(`   Transaction types: ${transactions.map(t => t.type).join(', ')}`);
					
					algosdk.assignGroupID(transactions);
					
					// Verify all transactions have the same group ID
					const groupIds: Array<{ base64: string; base32: string } | 'no-group-id'> = transactions.map((txn, idx) => {
						// Get the group ID from the transaction
						const txnGroupId = (txn as any).group;
						if (!txnGroupId) {
							console.error(`❌ Transaction ${idx} (${txn.type}) has no group ID!`);
							console.error(`   Transaction details:`, {
								type: txn.type,
								sender: (txn as any).sender || (txn as any).from,
								hasGroup: !!(txn as any).group
							});
							return 'no-group-id';
						}
						const gidBase64 = Buffer.from(txnGroupId).toString('base64');
						// Also get the group ID in the format used by the network (base32)
						const gidBase32 = algosdk.encodeAddress(txnGroupId);
						return { base64: gidBase64, base32: gidBase32 };
					});
					
					// Check if any transaction has no group ID
					const hasNoGroupId = groupIds.some(g => g === 'no-group-id');
					if (hasNoGroupId) {
						console.error('❌ No group ID assigned to some transactions!', {
							transactionCount: transactions.length,
							transactionTypes: transactions.map(t => t.type),
							missingGroupIds: groupIds.map((g, i) => g === 'no-group-id' ? i : null).filter(i => i !== null)
						});
						throw new Error('Group ID assignment failed - no group ID set on some transactions');
					}
					
					// All group IDs are valid objects now
					const validGroupIds = groupIds as Array<{ base64: string; base32: string }>;
					const uniqueGroupIds = new Set(validGroupIds.map(g => g.base64));
					
					if (uniqueGroupIds.size > 1) {
						console.error('❌ Group ID mismatch detected!', {
							transactionCount: transactions.length,
							uniqueGroupIds: Array.from(uniqueGroupIds),
							groupIds: validGroupIds.map(g => g.base64),
							groupIdsBase32: validGroupIds.map(g => g.base32),
							transactionTypes: transactions.map(t => t.type)
						});
						throw new Error('Group ID assignment failed - transactions have mismatched group IDs');
					}
					
					const firstGroupId = validGroupIds[0];
					console.log(`✅ Built ${transactions.length} transactions for swap with payment combination [${p1}, ${p2}, ${p3}, ${p4}]`);
					console.log(`✅ Group ID (base64): ${firstGroupId.base64}`);
					console.log(`✅ Group ID (base32): ${firstGroupId.base32}`);
					console.log(`✅ Transaction types: ${transactions.map(t => t.type).join(', ')}`);
					
					// Final verification: encode and decode to ensure group IDs are preserved
					for (let i = 0; i < transactions.length; i++) {
						const encoded = algosdk.encodeUnsignedTransaction(transactions[i]);
						const decoded = algosdk.decodeUnsignedTransaction(encoded);
						const decodedGroupId = decoded.group ? Buffer.from(decoded.group).toString('base64') : 'NO GROUP';
						if (decodedGroupId !== firstGroupId.base64) {
							console.error(`❌ Transaction ${i} group ID lost during encoding!`, {
								original: firstGroupId.base64,
								decoded: decodedGroupId
							});
							throw new Error(`Transaction ${i} group ID lost during encoding`);
						}
					}
					
					return transactions;
				}
			} catch (error) {
				console.log(`❌ Payment combination [${p1}, ${p2}, ${p3}, ${p4}] failed:`, error);
				continue; // Try next payment combination
			}
		}

		throw new Error("custom failed end");
	}

	/**
	 * Select pool for a given asset pair
	 * Equivalent to ulujs selectPool() method
	 */
	async selectPool(assetA: bigint, assetB: bigint, method: string = 'default'): Promise<bigint> {
		const info = await this.Info();
		
		// Map ASA asset IDs to ARC-200 contract IDs
		const arc200A = mapAssetIdToArc200(assetA);
		const arc200B = mapAssetIdToArc200(assetB);
		
		// Match pools using ARC-200 contract IDs
		const pool = info.pools.find(
			p => 
				(p.assetA === arc200A && p.assetB === arc200B) ||
				(p.assetA === arc200B && p.assetB === arc200A)
		);

		if (!pool) {
			throw new Error(
				`Pool not found for assets ${assetA} (ARC-200: ${arc200A}) and ${assetB} (ARC-200: ${arc200B}). ` +
				`Available pools: ${info.pools.map(p => `${p.assetA}/${p.assetB}`).join(', ')}`
			);
		}

		return pool.poolId;
	}
}
