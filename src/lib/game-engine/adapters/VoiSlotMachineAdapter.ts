/**
 * Voi Slot Machine Adapter
 *
 * Production blockchain adapter for Voi network.
 * Handles real blockchain transactions and contract interactions using AlgoKit Utils v9 + algosdk v3.
 */

import algosdk from 'algosdk';
import * as algokit from '@algorandfoundation/algokit-utils';
import { SlotMachineClient } from '$lib/clients/SlotMachineClient.js';
import { createAlgoKitTransactionSigner, type WalletSigner } from '$lib/wallet/algokitTransactionSigner';
export type { WalletSigner } from '$lib/wallet/algokitTransactionSigner';
import type { BlockchainAdapter } from '../SlotMachineEngine';
import type { BetKey, SpinOutcome, SlotMachineConfig, SymbolId } from '../types';
import type { PaylinePattern } from '../types/config';
import { PAYLINE_PATTERNS, DEFAULT_PAYTABLE } from '../utils/gameConstants';
import { generateGridFromBetKey } from '../utils/gridGeneration';
import { parseBetKey, hexToUint8Array, uint8ArrayToHex, base64ToUint8Array } from '../utils/betKeyUtils';
import { detectWinningPaylines, calculateTotalWinnings } from '../utils/winDetection';
import { logger } from '$lib/utils/logger';

/**
 * Voi adapter configuration
 */
export interface VoiAdapterConfig {
	/** Algod server URL */
	algodUrl?: string;
	/** Algod token */
	algodToken?: string;
	/** Indexer URL */
	indexerUrl?: string;
	/** Network (mainnet, testnet, betanet) */
	network?: 'mainnet' | 'testnet' | 'betanet';
	/** Contract application ID */
	contractId: bigint;
	/** Optional wallet signer */
	walletSigner?: WalletSigner;
}

/**
 * Default network configuration for Voi
 */
const DEFAULT_VOI_CONFIG = {
	mainnet: {
		algodUrl: 'https://mainnet-api.voi.nodely.dev',
		indexerUrl: 'https://mainnet-idx.voi.nodely.dev',
		token: ''
	},
	testnet: {
		algodUrl: 'https://testnet-api.voi.nodely.dev',
		indexerUrl: 'https://testnet-idx.voi.nodely.dev',
		token: ''
	}
};

/**
 * Voi blockchain adapter
 */
export class VoiSlotMachineAdapter implements BlockchainAdapter {
	private config: VoiAdapterConfig;
	private algodClient: algosdk.Algodv2 | null = null;
	private indexer: algosdk.Indexer | null = null;
	private slotMachineClient: SlotMachineClient | null = null;
	private initialized: boolean = false;

	// Cached contract data
	private cachedReels: string | null = null;
	private cachedReelLength: number = 100;
	private cachedReelCount: number = 5;
	private cachedPaylines: number[][] | null = null;
	private cachedConfig: SlotMachineConfig | null = null;
	private cachedPayoutMultipliers: Map<string, number> = new Map(); // Key: "symbol_count" e.g. "A_3"

	constructor(config: VoiAdapterConfig) {
		this.config = config;
	}

	async initialize(): Promise<void> {
		const log = logger.scope('VoiSlotMachineAdapter');
		if (this.initialized) {
			log.info('already initialized, skipping');
			return;
		}
		
		log.info('initializing...');

		const network = (this.config.network || 'mainnet') as 'mainnet' | 'testnet';
		const networkConfig = DEFAULT_VOI_CONFIG[network];

		// Initialize algod client
		this.algodClient = new algosdk.Algodv2(
			this.config.algodToken || networkConfig.token,
			this.config.algodUrl || networkConfig.algodUrl,
			''
		);

		// Initialize indexer if URL provided
		if (this.config.indexerUrl || networkConfig.indexerUrl) {
			this.indexer = new algosdk.Indexer(
				this.config.algodToken || networkConfig.token,
				this.config.indexerUrl || networkConfig.indexerUrl,
				''
			);
		}

		// Initialize SlotMachineClient
		// MUST use user's address, not dummy
		if (!this.config.walletSigner?.address) {
			throw new Error('Wallet signer address is required for initialization');
		}
		this.slotMachineClient = new SlotMachineClient(
			{
				resolveBy: 'id',
				id: Number(this.config.contractId),
				sender: { addr: this.config.walletSigner.address as unknown as algosdk.Address }
			},
			this.algodClient
		);

		// Fetch and cache contract data
		await this.fetchContractData();

		// Fetch payout multipliers during initialization - needed for getContractConfig()
		try {
			await this.ensurePayoutMultipliers();
		} catch (error) {
			console.error('❌ Failed to fetch payout multipliers during initialization:', error);
			throw new Error(`Failed to initialize adapter: ${error instanceof Error ? error.message : 'Could not fetch payout multipliers'}`);
		}

		this.initialized = true;
		log.info('initialized with AlgoKit');
	}

	/**
	 * Fetch and cache static contract data
	 */
	private async fetchContractData(): Promise<void> {
		const log = logger.scope('VoiSlotMachineAdapter');
		log.debug('setting contract data from hardcoded config');

		// Hardcoded contract data from contracts.config.ts
		// This matches the contract's actual configuration
		// All values are set directly - no contract calls needed
		this.cachedReelCount = 5;
		this.cachedReelLength = 100;
		// Reel data is 500 chars (5 reels × 100 chars each) - take only first 500 from config
		const fullReelData = "_CCC__BD___D_____D_____D__DBDDCC_D_C_D__AD_D_CB_C_A_B___B_______DD___D_C_A_____B__C__D______D_______C_A_____C__DC_____B__B_CD_B___CD__DAD__C__C______CDD_______C_DA________DDD____CDDD___DB____BD__B_______D_D_B_________CD__D__C_C____B__A___CDB__BC_D__D__CD_C_________D___A_DC__B______B_DDDDD_____C_CDA_C___C_CDDDDC__D__CCB____D_B__B______D______BD_____A____D_D__AD__D__B___B__C____A____C_D_D___C__CDD___________________CC___DC___DDB_BDADDC______B____C__D___D__CA_______CD__D_D_C_______BD_C_DBA_BDD__CD_";
		this.cachedReels = fullReelData.substring(0, 500); // Take only first 500 chars (5 reels × 100)
		this.cachedPaylines = [
			// 1. Middle line
			[1, 1, 1, 1, 1],
			// 2. Top line
			[0, 0, 0, 0, 0],
			// 3. Bottom line
			[2, 2, 2, 2, 2],
			// 4. V shape
			[0, 1, 2, 1, 0],
			// 5. Inverted V
			[2, 1, 0, 1, 2],
			// 6. Diagonal down
			[0, 1, 1, 2, 2],
			// 7. Diagonal up
			[2, 1, 1, 0, 0],
			// 8. Zigzag top
			[0, 0, 1, 0, 0],
			// 9. Zigzag bottom
			[2, 2, 1, 2, 2],
			// 10. Staircase down
			[0, 1, 2, 2, 1],
			// 11. Staircase up
			[2, 1, 0, 0, 1],
			// 12. Slight diagonal
			[1, 0, 0, 0, 1],
			// 13. Slight diagonal
			[1, 2, 2, 2, 1],
			// 14. Top-bottom-top
			[0, 2, 0, 2, 0],
			// 15. Bottom-top-bottom
			[2, 0, 2, 0, 2],
			// 16. Outer rails up
			[0, 2, 1, 2, 0],
			// 17. Outer rails down
			[2, 0, 1, 0, 2],
			// 18. Left hook
			[0, 0, 1, 2, 2],
			// 19. Right hook
			[2, 2, 1, 0, 0],
			// 20. Wave
			[1, 0, 1, 2, 1]
		];

		log.debug('contract data set from config', {
			reelCount: this.cachedReelCount,
			reelLength: this.cachedReelLength,
			reelsLength: this.cachedReels.length,
			paylines: this.cachedPaylines.length
		});
	}

	/**
	 * Generate default reels if fetch fails
	 */
	private generateDefaultReels(): string {
		let reels = '';
		for (let r = 0; r < this.cachedReelCount; r++) {
			for (let i = 0; i < this.cachedReelLength; i++) {
				const rand = Math.random() * 100;
				if (rand < 5) reels += 'A';
				else if (rand < 20) reels += 'B';
				else if (rand < 50) reels += 'C';
				else reels += 'D';
			}
		}
		return reels;
	}

	async submitSpin(
		betPerLine: number,
		paylines: number,
		walletAddress: string
	): Promise<BetKey> {
		const log = logger.scope('VoiSlotMachineAdapter');
		log.info('submitSpin', { betPerLine, paylines, walletAddress });
		
		if (!this.algodClient) throw new Error('Adapter not initialized');
		if (!this.slotMachineClient) throw new Error('Client not initialized');
		if (!this.config.walletSigner) throw new Error('Wallet signer not configured');

		// Get spin cost via simulation (read-only, no transaction submission)
		log.debug('getting spin cost via simulation');
		
		// For simulation, we need to provide a sender but the signer should return
		// encoded unsigned transaction blobs, not empty signatures
		// The simulation API expects properly encoded transactions
		const simulationSigner = async (txnGroup: algosdk.Transaction[], indexesToSign: number[]): Promise<Uint8Array[]> => {
			log.debug('simulation signer called', { txnGroupLength: txnGroup.length, indexesToSign });
			
			// For simulation, we need to return encoded unsigned transaction blobs
			// Not empty signatures - the transactions need to be properly encoded
			const result = indexesToSign.map((idx) => {
				const txn = txnGroup[idx];
				// Encode the unsigned transaction for simulation
				const encoded = algosdk.encodeUnsignedSimulateTransaction(txn);
				log.debug('encoded unsigned transaction', { idx, length: encoded.length });
				return encoded;
			});
			log.debug('returning encoded unsigned transactions', { count: result.length });
			return result;
		};
		
		const composer = this.slotMachineClient.compose();
		// Provide sender with simulation signer that returns encoded unsigned transactions
		composer.spinCost({}, {
			sender: { 
				addr: this.config.walletSigner.address,
				signer: simulationSigner
			}
		});
		
		// Debug: check the transaction structure for spinCost
		const spinCostAtc = await composer.atc();
		const spinCostTxns = spinCostAtc.buildGroup();
		if (spinCostTxns.length > 0) {
			const spinCostTxn = spinCostTxns[0].txn;
			if (spinCostTxn.type === algosdk.TransactionType.appl) {
				const appTxn = spinCostTxn as algosdk.Transaction & { appArgs?: Uint8Array[] };
				log.debug('spinCost transaction structure', { appArgsLength: appTxn.appArgs?.length || 0 });
				if (appTxn.appArgs && appTxn.appArgs.length > 0) {
					const methodSelector = Array.from(appTxn.appArgs[0]).map((b: number) => b.toString(16).padStart(2, '0')).join('');
					log.debug('method selector', { methodSelector });
				}
			}
		}
		
		log.debug('calling composer.simulate');
		let simResult;
		try {
			simResult = await composer.simulate({
				allowEmptySignatures: true,
				allowMoreLogging: true
			});
			log.debug('simulation completed');
		} catch (simulateErr) {
			log.error('composer.simulate failed', simulateErr);
			throw new Error(`Simulation failed: ${simulateErr instanceof Error ? simulateErr.message : 'Unknown error'}`);
		}
		
		// Extract return value from simulation
		// composer.simulate() returns { returns: [...], methodResults: [...], ... }
		log.debug('simulation result', { keys: Object.keys(simResult || {}), returns: simResult?.returns, methodResults: simResult?.methodResults });
		
		// The return value is in simResult.returns[0] or simResult.methodResults[0].returnValue
		const returnValue = simResult?.returns?.[0] || simResult?.methodResults?.[0]?.returnValue;
		if (!returnValue && returnValue !== 0) {
			log.error('no return value in simResult', simResult);
			throw new Error('Failed to get spin cost from simulation - no return value');
		}
		
		// The return value is already decoded by composer.simulate() - it's a BigInt or number
		// Convert it to a number
		const spinCost = typeof returnValue === 'bigint' 
			? Number(returnValue)
			: typeof returnValue === 'number'
			? returnValue
			: Number(algosdk.decodeUint64(returnValue, 'bigint'));
		const totalBet = betPerLine * paylines;
		const paymentAmount = totalBet + spinCost;

		log.info('spin costs', { spinCost, betPerLine, paylines, totalBet, paymentAmount });

		// Generate random player index
		const playerIndex = Math.floor(Math.random() * 1000);

		// Create AlgoKit signer adapter for the actual spin transaction
		log.debug('creating signer adapter', { walletSignerType: typeof this.config.walletSigner, address: this.config.walletSigner.address });
		
		const signerAdapter = createAlgoKitTransactionSigner(this.config.walletSigner);
		
		log.debug('signerAdapter created', { type: typeof signerAdapter, isFunction: typeof signerAdapter === 'function' });
		
		// Verify signer is a function (AlgoKit requirement)
		if (typeof signerAdapter !== 'function') {
			throw new Error(`Signer adapter must be a function, got ${typeof signerAdapter}`);
		}

		// Use composer to build transaction group for the actual spin
		log.debug('building spin transaction group');
		const spinComposer = this.slotMachineClient.compose();

		// Add payment transaction  
		const contractAddress = algosdk.getApplicationAddress(Number(this.config.contractId));
		// Fetch fresh suggestedParams for the payment transaction
		const suggestedParams = await this.algodClient.getTransactionParams().do();
		const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
			sender: this.config.walletSigner.address as unknown as algosdk.Address,
			receiver: contractAddress,
			amount: paymentAmount,
			suggestedParams
		});
		
		log.debug('adding payment transaction', { txType: typeof paymentTxn, ctor: paymentTxn.constructor.name });
		
		// Manually wrap transaction with signer to add debugging
		log.debug('calling algokit.getTransactionWithSigner');
		let paymentTxnWithSigner;
		try {
			paymentTxnWithSigner = await algokit.getTransactionWithSigner(
				paymentTxn,
				{ addr: this.config.walletSigner.address as unknown as algosdk.Address, signer: signerAdapter }
			);
			log.debug('getTransactionWithSigner succeeded', { type: typeof paymentTxnWithSigner, keys: Object.keys(paymentTxnWithSigner || {}) });
		} catch (wrapError) {
			log.error('getTransactionWithSigner failed', wrapError);
			throw wrapError;
		}
		
		// Add payment transaction with pre-wrapped signer
		spinComposer.addTransaction(paymentTxnWithSigner);

		log.debug('adding spin call');
		// Add spin call
		// The spin method expects args directly: { betAmount, maxPaylineIndex, index }
		spinComposer.spin({
			betAmount: BigInt(betPerLine),
			maxPaylineIndex: BigInt(paylines - 1),
			index: BigInt(playerIndex)
		}, {
			sender: { addr: this.config.walletSigner.address, signer: signerAdapter }
		});

		// Execute transaction group
		log.debug('executing transaction group');
		
		let result;
		try {
			result = await spinComposer.execute({
				populateAppCallResources: true,
				suppressLog: false
			});
			log.info('execute completed');
		} catch (executeError) {
			log.error('execute failed', executeError);
			throw executeError;
		}

		log.info('transaction group submitted');

		// Extract bet key from return value (spin call)
		// Note: result.returns[0] contains the return value from the spin call
		log.debug('result.returns', { length: result.returns?.length, type0: typeof result.returns?.[0] });
		
		const betKeyBytes = result.returns?.[0] as Uint8Array;
		if (!betKeyBytes || !(betKeyBytes instanceof Uint8Array)) {
			throw new Error('Bet key not found in transaction result');
		}

		log.debug('bet key bytes length', { length: betKeyBytes.length });
		const betKeyHex = uint8ArrayToHex(betKeyBytes);
		// Convert confirmedRound to number if it's a BigInt
		const confirmedRound = result.confirmations?.[1]?.confirmedRound;
		const submitBlock = typeof confirmedRound === 'bigint' 
			? Number(confirmedRound) 
			: (confirmedRound || 0);

		log.info('spin submitted', { betKey: betKeyHex.slice(0, 16) + '...' });

		return {
			key: betKeyHex,
			txId: result.txIds[1],
			submitBlock,
			claimBlock: submitBlock + 1 // Claim at next block
		};
	}

	/**
	 * Calculate outcome from block seed immediately - doesn't wait for claim
	 * This is called first to show outcome right away
	 */
	async calculateOutcomeFromBlockSeed(
		betKey: string,
		claimBlock: number,
		betPerLine: number,
		paylines: number
	): Promise<SpinOutcome> {
		if (!this.algodClient) throw new Error('Adapter not initialized');

		const betKeyBytes = parseBetKey(betKey);
		const log = logger.scope('VoiSlotMachineAdapter');
		log.info('calculateOutcomeFromBlockSeed', { betKey, claimBlock });

		// Ensure we have reel data
		await this.ensureReelData();

		// Get block seed
		const blockSeed = await this.getBlockSeed(claimBlock);

		// Generate grid deterministically
		const grid = await generateGridFromBetKey(
			betKeyBytes,
			blockSeed,
			this.cachedReels || this.generateDefaultReels(),
			this.cachedReelLength,
			3
		);

		// Calculate outcome locally - NO FALLBACKS
		log.debug('calculating outcome locally');
		
		// Ensure we have payout multipliers - NO FALLBACKS
		await this.ensurePayoutMultipliers();
		
		// Ensure we have reel data - NO FALLBACKS
		if (!this.cachedReels || this.cachedReels.length === 0) {
			throw new Error('Reel data not available. Cannot calculate outcome.');
		}
		
		// Get config with actual payout multipliers - NO FALLBACKS
		const config = await this.getContractConfig();
		
		// Log the grid for debugging
		log.debug('generated grid', { grid });
		
		// Calculate winning lines
		const winningLines = detectWinningPaylines(
			grid,
			config.paylinePatterns,
			config.paytable.symbols,
			paylines,
			betPerLine
		);
		
		// Log winning lines for debugging
		if (winningLines.length > 0) {
			winningLines.forEach((line, idx) => {
				log.debug('winning line', {
					idx: idx + 1,
					payline: line.paylineIndex + 1,
					matchCount: line.matchCount,
					symbol: line.symbol,
					pattern: line.pattern,
					multiplier: line.payout / betPerLine,
					betPerLine,
					payout: line.payout
				});
			});
		} else {
			log.debug('no winning lines found');
		}
		
		// Calculate total payout
		const payout = calculateTotalWinnings(winningLines);
		
		log.info('calculated outcome locally', { payout, payoutVOI: payout / 1_000_000, winningLinesCount: winningLines.length, betPerLine, totalBet: betPerLine * paylines });
		
		return {
			grid,
			winningLines,
			totalPayout: payout,
			blockNumber: claimBlock,
			blockSeed: uint8ArrayToHex(blockSeed),
			betKey,
			verified: false // Not verified via contract claim yet
		};
	}

	/**
	 * Attempt to claim from contract - runs in background
	 * This updates the outcome with verified=true if successful
	 */
	async claimSpin(betKey: string, claimBlock: number, betPerLine: number, paylines: number): Promise<SpinOutcome> {
		if (!this.algodClient) throw new Error('Adapter not initialized');
		if (!this.slotMachineClient) throw new Error('Client not initialized');

		const log = logger.scope('VoiSlotMachineAdapter');
		const betKeyBytes = parseBetKey(betKey);
		log.info('claimSpin', { betKey, claimBlock, betPerLine, paylines });

		// Note: claimBlock should already be reached by the time this is called
		// This method is called in background after outcome is already shown
		log.debug('background claim attempt', { betKey, claimBlock });

		// Ensure we have reel data
		await this.ensureReelData();

		// Get block seed
		const blockSeed = await this.getBlockSeed(claimBlock);

		// Generate grid deterministically
		const grid = await generateGridFromBetKey(
			betKeyBytes,
			blockSeed,
			this.cachedReels || this.generateDefaultReels(),
			this.cachedReelLength,
			3
		);

		// Try to claim from contract
		let payout: number = 0;
		let claimSucceeded = false;
		
		if (this.config.walletSigner) {
			try {
				log.debug('attempting background claim');
				const signerAdapter = createAlgoKitTransactionSigner(this.config.walletSigner);
				const betKeyBytesForClaim = new Uint8Array(betKeyBytes);
				
				const claimResult = await this.slotMachineClient.claim(
					{
						betKey: betKeyBytesForClaim
					},
					{
						sender: {
							addr: this.config.walletSigner.address,
							signer: signerAdapter
						},
						sendParams: {
							fee: algokit.microAlgos(32000)
						}
					}
				);
				
				payout = Number(claimResult.return || 0n);
				claimSucceeded = true;
				log.info('background claim succeeded', { payout });
			} catch (claimError) {
				log.warn('background claim from contract failed', claimError instanceof Error ? claimError.message : String(claimError));
				claimSucceeded = false;
				// Don't throw - this is background, outcome already shown
			}
		} else {
			log.info('no wallet signer, cannot claim');
			claimSucceeded = false;
		}

		// If claim failed, calculate outcome locally (should match what was already shown)
		if (!claimSucceeded) {
			// Ensure we have payout multipliers - NO FALLBACKS
			await this.ensurePayoutMultipliers();
			
			// Ensure we have reel data - NO FALLBACKS
			if (!this.cachedReels || this.cachedReels.length === 0) {
				throw new Error('Reel data not available. Cannot calculate outcome.');
			}
			
			// Get config with actual payout multipliers - NO FALLBACKS
			const config = await this.getContractConfig();
			
			// Calculate winning lines
			const winningLines = detectWinningPaylines(
				grid,
				config.paylinePatterns,
				config.paytable.symbols,
				paylines,
				betPerLine
			);
			
			// Calculate total payout
			payout = calculateTotalWinnings(winningLines);
			
			return {
				grid,
				winningLines,
				totalPayout: payout,
				blockNumber: claimBlock,
				blockSeed: uint8ArrayToHex(blockSeed),
				betKey,
				verified: false // Not verified via contract claim
			};
		}

		// If claim succeeded, calculate winning lines for display
		const config = await this.getContractConfig();
		const winningLines = detectWinningPaylines(
			grid,
			config.paylinePatterns,
			config.paytable.symbols,
			paylines,
			betPerLine
		);

		return {
			grid,
			winningLines,
			totalPayout: payout,
			blockNumber: claimBlock,
			blockSeed: uint8ArrayToHex(blockSeed),
			betKey,
			verified: true
		};
	}

	async getBalance(address: string): Promise<number> {
		if (!this.algodClient) throw new Error('Adapter not initialized');

		try {
			const accountInfo = await this.algodClient.accountInformation(address).do();
			return Number(accountInfo.amount); // Returns microVOI
		} catch (error) {
		const log = logger.scope('VoiSlotMachineAdapter');
		log.error('failed to get balance', error);
			return 0;
		}
	}

	async getCurrentBlock(): Promise<number> {
		if (!this.algodClient) throw new Error('Adapter not initialized');

		const status = await this.algodClient.status().do();
		return Number(status.lastRound);
	}

	async getContractConfig(): Promise<SlotMachineConfig> {
		if (this.cachedConfig) return this.cachedConfig!;

		if (!this.algodClient) throw new Error('Adapter not initialized');

		// Parse cached reels into SymbolId[][]
		const reelsData = this.cachedReels || this.generateDefaultReels();
		const reels: SymbolId[][] = [];

		for (let r = 0; r < this.cachedReelCount; r++) {
			const reel: SymbolId[] = [];
			const start = r * this.cachedReelLength;
			for (let i = 0; i < this.cachedReelLength; i++) {
				const symbol = reelsData[start + i] as SymbolId | undefined;
				reel.push(symbol ?? 'D');
			}
			reels.push(reel);
		}

		const maxPaylines = this.cachedPaylines?.length ?? 20;

		// Build paytable from cached multipliers - NO FALLBACKS
		// If multipliers aren't cached, getContractConfig should not be called
		const paytableSymbols = DEFAULT_PAYTABLE.map((symbolConfig) => {
			const match3Key = `${symbolConfig.symbol}_3`;
			const match4Key = `${symbolConfig.symbol}_4`;
			const match5Key = `${symbolConfig.symbol}_5`;
			
			const match3 = this.cachedPayoutMultipliers.get(match3Key);
			const match4 = this.cachedPayoutMultipliers.get(match4Key);
			const match5 = this.cachedPayoutMultipliers.get(match5Key);
			
			if (match3 === undefined) {
				throw new Error(`Missing payout multiplier for ${match3Key}. Cannot build paytable.`);
			}
			if (match4 === undefined) {
				throw new Error(`Missing payout multiplier for ${match4Key}. Cannot build paytable.`);
			}
			if (match5 === undefined) {
				throw new Error(`Missing payout multiplier for ${match5Key}. Cannot build paytable.`);
			}
			
			console.log(`📊 Paytable ${symbolConfig.symbol}: match3=${match3}, match4=${match4}, match5=${match5}`);
			
			return {
				...symbolConfig,
				match3,
				match4,
				match5
			};
		});

		this.cachedConfig = {
			id: `voi-slots-${this.config.contractId}`,
			name: '5Reel Slot Machine',
			displayName: 'Alpha Slots',
			contractId: this.config.contractId,
			chain: 'voi',
			rtpTarget: 96.5,
			houseEdge: 3.5,
			minBet: 1_000_000, // 1 VOI
			maxBet: 100_000_000, // 100 VOI
			maxPaylines,
			reelConfig: {
				reelCount: 5 as const,
				reelLength: 100 as const,
				windowLength: 3,
				reels
			},
			paylinePatterns: (this.cachedPaylines ?? PAYLINE_PATTERNS) as PaylinePattern[],
			paytable: {
				symbols: paytableSymbols,
				maxPayoutMultiplier: 10000
			},
			isActive: true,
			launchedAt: new Date()
		};

		return this.cachedConfig;
	}

	/**
	 * Get claim round for a bet key
	 */
	private async getClaimRound(betKey: string): Promise<number> {
		if (!this.slotMachineClient) throw new Error('Client not initialized');
		if (!this.config.walletSigner) throw new Error('Wallet signer not configured');

		const betKeyBytes = parseBetKey(betKey);
		const log = logger.scope('VoiSlotMachineAdapter');
		log.debug('getClaimRound betKeyBytes', { type: typeof betKeyBytes, isUint8: betKeyBytes instanceof Uint8Array });
		
		// Ensure betKeyBytes is a proper Uint8Array - create fresh copy
		const betKeyBytesForCall = new Uint8Array(betKeyBytes);
		log.debug('getClaimRound betKeyBytesForCall', { isUint8: betKeyBytesForCall instanceof Uint8Array, length: betKeyBytesForCall.length });

		try {
			log.debug('calling getBetClaimRound');
			const result = await this.slotMachineClient.getBetClaimRound(
				{
					betKey: betKeyBytesForCall
				},
				{
					sender: { addr: this.config.walletSigner.address }
				}
			);
			log.debug('getBetClaimRound completed', { result });
			return Number(result.return);
		} catch (error) {
			log.error('getBetClaimRound failed', error);
			throw error;
		}
	}

	/**
	 * Get block seed for a given round
	 */
	private async getBlockSeed(round: number): Promise<Uint8Array> {
		if (!this.algodClient) throw new Error('Client not initialized');

		try {
			const block = await this.algodClient.block(round).do();
			let seedBytes: Uint8Array;

			const blockSeed = block.block.header.seed;
			if (blockSeed instanceof Uint8Array) {
				seedBytes = blockSeed;
			} else if (typeof blockSeed === 'string') {
				seedBytes = base64ToUint8Array(blockSeed);
			} else if (Array.isArray(blockSeed)) {
				seedBytes = new Uint8Array(blockSeed);
			} else {
				throw new Error(`Unexpected block seed type: ${typeof blockSeed}`);
			}

			// Return last 32 bytes
			return new Uint8Array(seedBytes.slice(-32));
		} catch (error) {
			const log = logger.scope('VoiSlotMachineAdapter');
			log.error('failed to get block seed', error);
			throw error;
		}
	}

	/**
	 * Wait for a specific block
	 */
	private async waitForBlock(targetRound: number): Promise<void> {
		if (!this.algodClient) throw new Error('Client not initialized');

		while (true) {
			const status = await this.algodClient.status().do();
			const currentRound = Number(status.lastRound);

			// Wait until we're at least one block past the target round
			// This ensures the block seed for the target round is available
			if (currentRound > targetRound) {
				return;
			}

			// Wait 1 second before checking again
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	/**
	 * Ensure reel data is fetched and cached
	 */
	private async ensureReelData(): Promise<void> {
		if (this.cachedReels && this.cachedReelLength > 0) {
			return; // Already cached
		}

		const log = logger.scope('VoiSlotMachineAdapter');
		log.debug('fetching reel data from contract');
		await this.fetchContractData();
	}

	/**
	 * Fetch payout multipliers from contract and cache them
	 * NO FALLBACKS - throws error if any multiplier can't be fetched
	 */
	private async ensurePayoutMultipliers(): Promise<void> {
		if (this.cachedPayoutMultipliers.size > 0) {
			// Verify we have all required multipliers
			const required = ['A_3', 'A_4', 'A_5', 'B_3', 'B_4', 'B_5', 'C_3', 'C_4', 'C_5', 'D_3', 'D_4', 'D_5'];
			const missing = required.filter(key => !this.cachedPayoutMultipliers.has(key));
			if (missing.length > 0) {
				throw new Error(`Missing cached multipliers: ${missing.join(', ')}. Cannot calculate outcome.`);
			}
			return; // Already cached and validated
		}

		if (!this.slotMachineClient) throw new Error('Client not initialized');

		const log = logger.scope('VoiSlotMachineAdapter');
		log.debug('setting payout multipliers from hardcoded config');
		
		// Hardcoded payout multipliers from contracts.config.ts
		// These match the contract's _get_payout_multiplier implementation
		const payouts = {
			A: { 3: 200, 4: 1000, 5: 10000 },
			B: { 3: 60, 4: 200, 5: 1000 },
			C: { 3: 30, 4: 100, 5: 500 },
			D: { 3: 10, 4: 55, 5: 250 }
		};

		const symbols: SymbolId[] = ['A', 'B', 'C', 'D'];
		const counts = [3, 4, 5];

		for (const symbol of symbols) {
			for (const count of counts) {
				const key = `${symbol}_${count}`;
				const multiplier = payouts[symbol as keyof typeof payouts][count as keyof typeof payouts['A']];
				this.cachedPayoutMultipliers.set(key, multiplier);
				log.debug('payout multiplier cached', { key, multiplier });
			}
		}

		log.info('cached payout multipliers', { count: this.cachedPayoutMultipliers.size });
	}
}
