/**
 * Voi Slot Machine Adapter
 *
 * Production blockchain adapter for Voi network.
 * Handles real blockchain transactions and contract interactions using ulujs.
 */

import algosdk from 'algosdk';
import { CONTRACT } from 'ulujs';
import type { BlockchainAdapter } from '../SlotMachineEngine';
import type { BetKey, SpinOutcome, SlotMachineConfig, SymbolId } from '../types';
import { PAYLINE_PATTERNS, DEFAULT_PAYTABLE } from '../utils/gameConstants';
import { generateGridFromBetKey } from '../utils/gridGeneration';
import { parseBetKey, hexToUint8Array, uint8ArrayToHex, base64ToUint8Array } from '../utils/betKeyUtils';
import { detectWinningPaylines, calculateTotalWinnings } from '../utils/winDetection';

// Import the SlotMachineClient APP_SPEC for ABI
import { APP_SPEC as SlotMachineAppSpec } from '$lib/clients/SlotMachineClient';

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
 * Wallet signer interface
 */
export interface WalletSigner {
	address: string;
	signTransactions: (txns: algosdk.Transaction[]) => Promise<Uint8Array[]>;
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
 * Slot machine ABI for ulujs
 */
const additionalReadOnlyMethods = [
	{
		name: 'get_reels',
		desc: 'Get concatenated reel symbols',
		args: [],
		returns: { type: 'byte[500]' },
		readonly: true
	},
	{
		name: 'get_reel_length',
		desc: 'Get the configured reel length',
		args: [],
		returns: { type: 'uint64' },
		readonly: true
	},
	{
		name: 'get_reel_count',
		desc: 'Get total number of reels',
		args: [],
		returns: { type: 'uint64' },
		readonly: true
	},
	{
		name: 'get_paylines',
		desc: 'Get all payline definitions (flattened)',
		args: [],
		returns: { type: 'uint64[100]' },
		readonly: true
	},
	{
		name: 'get_bet_claim_round',
		desc: 'Get the block round at which a bet can be claimed',
		args: [{ type: 'byte[56]', name: 'bet_key' }],
		returns: { type: 'uint64' },
		readonly: true
	}
] as const;

const existingMethodNames = new Set(
	SlotMachineAppSpec.contract.methods.map((method: { name: string }) => method.name)
);

const slotMachineMethods: any[] = [
	...SlotMachineAppSpec.contract.methods,
	...additionalReadOnlyMethods.filter((method) => !existingMethodNames.has(method.name))
];

const slotMachineABI = {
	name: 'Slot Machine',
	desc: 'A simple slot machine game',
	methods: slotMachineMethods,
	events: []
};

/**
 * Voi blockchain adapter
 */
export class VoiSlotMachineAdapter implements BlockchainAdapter {
	private config: VoiAdapterConfig;
	private client: algosdk.Algodv2 | null = null;
	private indexer: algosdk.Indexer | null = null;
	private initialized: boolean = false;

	// Cached contract data
	private cachedReels: string | null = null;
	private cachedReelLength: number = 100;
	private cachedReelCount: number = 5;
	private cachedPaylines: number[][] | null = null;
	private cachedConfig: SlotMachineConfig | null = null;

	constructor(config: VoiAdapterConfig) {
		this.config = config;
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;

		const network = this.config.network || 'mainnet';
		const networkConfig = DEFAULT_VOI_CONFIG[network];

		this.client = new algosdk.Algodv2(
			this.config.algodToken || networkConfig.token,
			this.config.algodUrl || networkConfig.algodUrl,
			''
		);

		if (this.config.indexerUrl || networkConfig.indexerUrl) {
			this.indexer = new algosdk.Indexer(
				this.config.algodToken || networkConfig.token,
				this.config.indexerUrl || networkConfig.indexerUrl,
				''
			);
		}

		// Fetch and cache contract data
		await this.fetchContractData();

		this.initialized = true;
		console.log('✅ VoiSlotMachineAdapter initialized');
	}

	/**
	 * Fetch and cache static contract data
	 */
	private async fetchContractData(): Promise<void> {
		if (!this.client) throw new Error('Client not initialized');

		try {
			// Create a CONTRACT instance for read-only calls
			const ci = new CONTRACT(
				Number(this.config.contractId),
				this.client,
				undefined,
				slotMachineABI,
				{
					addr: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ', // Dummy address for readonly
					sk: new Uint8Array(64)
				}
			);

			const [reelsResult, reelLengthResult, reelCountResult, paylinesResult] = await Promise.all([
				typeof ci.get_reels === 'function' ? ci.get_reels() : null,
				typeof ci.get_reel_length === 'function' ? ci.get_reel_length() : null,
				typeof ci.get_reel_count === 'function' ? ci.get_reel_count() : null,
				typeof ci.get_paylines === 'function' ? ci.get_paylines() : null
			]);

			if (reelsResult?.success && reelsResult.returnValue) {
				const rawValue = reelsResult.returnValue;
				let reelsString: string | null = null;

				if (rawValue instanceof Uint8Array) {
					reelsString = new TextDecoder().decode(rawValue);
				} else if (Array.isArray(rawValue)) {
					reelsString = rawValue.map((value) => String.fromCharCode(Number(value))).join('');
				} else if (typeof rawValue === 'string') {
					reelsString = rawValue;
				}

				if (reelsString && reelsString.trim().length > 0) {
					this.cachedReels = reelsString;
				}
			}

			if (reelLengthResult?.success && reelLengthResult.returnValue !== undefined) {
				this.cachedReelLength = Number(reelLengthResult.returnValue) || this.cachedReelLength;
			}

			if (reelCountResult?.success && reelCountResult.returnValue !== undefined) {
				this.cachedReelCount = Number(reelCountResult.returnValue) || this.cachedReelCount;
			}

			if (paylinesResult?.success && Array.isArray(paylinesResult.returnValue)) {
				const flatValues = (paylinesResult.returnValue as Array<number | bigint>).map((value) =>
					Number(value)
				);

				if (flatValues.length % 5 === 0 && flatValues.length > 0) {
					const paylines: number[][] = [];
					for (let i = 0; i < flatValues.length; i += 5) {
						paylines.push(flatValues.slice(i, i + 5));
					}

					if (paylines.length > 0) {
						this.cachedPaylines = paylines;
					}
				}
			}

			// Ensure cached reels length matches expected dimensions
			if (this.cachedReels) {
				const expectedLength = this.cachedReelCount * this.cachedReelLength;
				if (this.cachedReels.length !== expectedLength) {
					console.warn(
						`Reel data length mismatch (expected ${expectedLength}, got ${this.cachedReels.length}). Adjusting reel length.`
					);
					if (this.cachedReelCount > 0) {
						this.cachedReelLength = Math.floor(this.cachedReels.length / this.cachedReelCount);
					}
				}
			}

			console.log('✅ Contract data cached from on-chain methods');
		} catch (error) {
			console.error('Failed to fetch contract data:', error);
			// Use defaults if fetch fails
			this.cachedReelCount = 5;
			this.cachedReelLength = 100;
			this.cachedPaylines = null;
			this.cachedReels = this.generateDefaultReels();
		}
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
		if (!this.client) throw new Error('Adapter not initialized');
		if (!this.config.walletSigner) throw new Error('Wallet signer not configured');

		const account = {
			addr: this.config.walletSigner.address,
			sk: new Uint8Array(64) // Dummy, will use wallet signer
		};

		// Create CONTRACT instance
		const ci = new CONTRACT(
			Number(this.config.contractId),
			this.client,
			undefined,
			slotMachineABI,
			account
		);

		// Get spin cost
		const spinCostResult = await ci.spin_cost();
		if (!spinCostResult.success) {
			throw new Error(`Unable to obtain spin cost: ${spinCostResult.error || 'Unknown error'}`);
		}

		const spinCost = Number(spinCostResult.returnValue);
		const totalBet = betPerLine * paylines;
		const paymentAmount = totalBet + spinCost;

		// Configure CONTRACT
		ci.setEnableRawBytes(true);
		ci.setPaymentAmount(paymentAmount);

		// Generate random index for player
		const playerIndex = Math.floor(Math.random() * 1000);

		// Call spin method
		console.log('🎲 Calling spin:', {
			betPerLine,
			maxPaylineIndex: paylines - 1,
			playerIndex,
			totalPayment: paymentAmount
		});

		const spinResult = await ci.spin(
			BigInt(betPerLine),
			BigInt(paylines - 1), // max payline index (0-19 for 1-20 paylines)
			BigInt(playerIndex)
		);

		if (!spinResult.success) {
			throw new Error(`Spin failed: ${spinResult.error || 'Unknown error'}`);
		}

		// Get unsigned transactions
		const unsignedTxns = spinResult.txns;
		if (!unsignedTxns || unsignedTxns.length === 0) {
			throw new Error('No transactions returned from spin');
		}

		// Decode transactions
		const decodedTxns = unsignedTxns.map((txnBlob: string) => {
			const txnBytes = base64ToUint8Array(txnBlob);
			return algosdk.decodeUnsignedTransaction(txnBytes);
		});

		// Sign with wallet
		const signedTxnBlobs = await this.config.walletSigner.signTransactions(decodedTxns);

		// Convert to signed transaction objects
		const signedTxns = signedTxnBlobs.map((blob) => {
			const decoded = algosdk.decodeSignedTransaction(blob);
			return {
				txID: decoded.txn.txID(),
				blob: blob
			};
		});

		// Find app call transaction ID
		const decodedTypes = decodedTxns.map((txn: algosdk.Transaction) => txn.type);
		const appCallIndex = decodedTypes.findIndex((t) => t === 'appl');
		const appCallTxId = signedTxns[appCallIndex]?.txID;

		// Submit transaction group
		const submittedGroup = await this.client.sendRawTransaction(
			signedTxns.map((stxn) => stxn.blob)
		).do();

		console.log('🚀 Transaction group submitted:', submittedGroup.txId);

		// Wait for confirmation
		const confirmedTxn = await this.waitForConfirmation(appCallTxId, 4);
		const confirmedRound = confirmedTxn['confirmed-round'] || 0;

		// Extract bet key from logs
		let betKeyHex = '';
		for (const log of confirmedTxn.logs || []) {
			const logBytes = log as Uint8Array;
			const hex = uint8ArrayToHex(logBytes);
			if (hex.length === 112) {
				betKeyHex = hex;
				break;
			}
		}

		if (!betKeyHex) {
			throw new Error('Bet key not found in transaction logs');
		}

		console.log('✅ Spin submitted, bet key:', betKeyHex.slice(0, 16) + '...');

		return {
			key: betKeyHex,
			txId: appCallTxId,
			submitBlock: confirmedRound,
			claimBlock: confirmedRound + 1 // Claim at next block
		};
	}

	async claimSpin(betKey: string): Promise<SpinOutcome> {
		if (!this.client) throw new Error('Adapter not initialized');
		if (!this.config.walletSigner) throw new Error('Wallet signer not configured');

		const betKeyBytes = parseBetKey(betKey);

		// Get claim round
		const claimRound = await this.getClaimRound(betKey);

		// Wait for claim round
		await this.waitForBlock(claimRound);

		// Get block seed
		const blockSeed = await this.getBlockSeed(claimRound);

		// Generate grid deterministically
		const grid = await generateGridFromBetKey(
			betKeyBytes,
			blockSeed,
			this.cachedReels || this.generateDefaultReels(),
			this.cachedReelLength,
			3
		);

		// Create CONTRACT instance for claim
		const account = {
			addr: this.config.walletSigner.address,
			sk: new Uint8Array(64)
		};

		const ci = new CONTRACT(
			Number(this.config.contractId),
			this.client,
			undefined,
			slotMachineABI,
			account
		);

		ci.setFee(32000);
		ci.setEnableRawBytes(true);

		// Call claim
		const claimResult = await ci.claim(betKeyBytes);

		if (!claimResult.success) {
			throw new Error(`Claim failed: ${claimResult.error || 'Unknown error'}`);
		}

		// Get unsigned transactions
		const unsignedTxns = claimResult.txns;
		if (!unsignedTxns || unsignedTxns.length === 0) {
			throw new Error('No transactions returned from claim');
		}

		// Decode and sign
		const decodedTxns = unsignedTxns.map((txnBlob: string) => {
			const txnBytes = base64ToUint8Array(txnBlob);
			return algosdk.decodeUnsignedTransaction(txnBytes);
		});

		const signedTxnBlobs = await this.config.walletSigner.signTransactions(decodedTxns);

		// Submit
		const signedTxns = signedTxnBlobs.map((blob) => {
			const decoded = algosdk.decodeSignedTransaction(blob);
			return {
				txID: decoded.txn.txID(),
				blob: blob
			};
		});

		await this.client.sendRawTransaction(signedTxns.map((stxn) => stxn.blob)).do();

		// Wait for confirmation
		await this.waitForConfirmation(signedTxns[0].txID, 4);

		const payout = Number(claimResult.returnValue || 0n);

		console.log('✅ Claim completed, payout:', payout);

		// Calculate winning lines if we have cached config
		let winningLines: any[] = [];
			if (this.cachedConfig) {
				const maxPaylines = this.cachedConfig.maxPaylines ?? 20;
				winningLines = detectWinningPaylines(
					grid,
					this.cachedConfig.paylinePatterns,
					this.cachedConfig.paytable.symbols,
					maxPaylines,
					1 // Bet per line for multiplier calculation
				);
			}

		return {
			grid,
			winningLines,
			totalPayout: payout,
			blockNumber: claimRound,
			blockSeed: uint8ArrayToHex(blockSeed),
			betKey,
			verified: true
		};
	}

	async getBalance(address: string): Promise<number> {
		if (!this.client) throw new Error('Adapter not initialized');

		try {
			const accountInfo = await this.client.accountInformation(address).do();
			return Number(accountInfo.amount); // Returns microVOI
		} catch (error) {
			console.error('Failed to get balance:', error);
			return 0;
		}
	}

	async getCurrentBlock(): Promise<number> {
		if (!this.client) throw new Error('Adapter not initialized');

		const status = await this.client.status().do();
		return Number(status['last-round']);
	}

	async getContractConfig(): Promise<SlotMachineConfig> {
		if (this.cachedConfig) return this.cachedConfig;

		if (!this.client) throw new Error('Adapter not initialized');

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
				reelCount: this.cachedReelCount,
				reelLength: this.cachedReelLength,
				windowLength: 3,
				reels
			},
			paylinePatterns: this.cachedPaylines ?? PAYLINE_PATTERNS,
			paytable: {
				symbols: DEFAULT_PAYTABLE,
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
		if (!this.client) throw new Error('Client not initialized');

		const betKeyBytes = parseBetKey(betKey);

		const ci = new CONTRACT(
			Number(this.config.contractId),
			this.client,
			undefined,
			slotMachineABI,
			{
				addr: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ',
				sk: new Uint8Array(64)
			}
		);

		if (typeof ci.get_bet_claim_round !== 'function') {
			throw new Error('get_bet_claim_round ABI method is unavailable on this contract');
		}

		const result = await ci.get_bet_claim_round(betKeyBytes);

		if (!result.success) {
			throw new Error(`Failed to get claim round: ${result.error || 'Unknown error'}`);
		}

		return Number(result.returnValue);
	}

	/**
	 * Get block seed for a given round
	 */
	private async getBlockSeed(round: number): Promise<Uint8Array> {
		if (!this.client) throw new Error('Client not initialized');

		try {
			const block = await this.client.block(round).do();
			let seedBytes: Uint8Array;

			const blockSeed = block.block.seed;
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
			console.error('Failed to get block seed:', error);
			throw error;
		}
	}

	/**
	 * Wait for a specific block
	 */
	private async waitForBlock(targetRound: number): Promise<void> {
		if (!this.client) throw new Error('Client not initialized');

		while (true) {
			const status = await this.client.status().do();
			const currentRound = Number(status['last-round']);

			if (currentRound >= targetRound) {
				return;
			}

			// Wait 1 second before checking again
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	/**
	 * Wait for transaction confirmation
	 */
	private async waitForConfirmation(txId: string, maxRounds: number): Promise<any> {
		if (!this.client) throw new Error('Client not initialized');

		const status = await this.client.status().do();
		let lastRound = Number(status['last-round']);

		for (let i = 0; i < maxRounds; i++) {
			try {
				const pendingInfo = await this.client.pendingTransactionInformation(txId).do();

				if (pendingInfo['confirmed-round']) {
					return pendingInfo;
				}

				if (pendingInfo['pool-error']) {
					throw new Error(`Transaction failed: ${pendingInfo['pool-error']}`);
				}

				await algosdk.waitForConfirmation(this.client, txId, 1);
				lastRound++;
			} catch (error: any) {
				if (error.message && error.message.includes('transaction not found')) {
					// Transaction may not have propagated yet
					await new Promise((resolve) => setTimeout(resolve, 1000));
					continue;
				}
				throw error;
			}
		}

		throw new Error('Transaction confirmation timeout');
	}
}
