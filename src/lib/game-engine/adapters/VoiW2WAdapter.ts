/**
 * Voi W2W (Ways to Win) Adapter
 *
 * Production blockchain adapter for Voi network - w2w implementation.
 * Uses CDF-based probabilistic symbol generation and ways-to-win calculation.
 */

import algosdk from 'algosdk';
import * as algokit from '@algorandfoundation/algokit-utils';
import { CONTRACT } from 'ulujs';
import { createAlgoKitTransactionSigner, type WalletSigner } from '$lib/wallet/algokitTransactionSigner';
import type { BlockchainAdapter } from '../SlotMachineEngine';
import type { BetKey, SpinOutcome, SlotMachineConfig, SymbolId } from '../types';
import { logger } from '$lib/utils/logger';
import { SlotMachineClient, APP_SPEC } from '$lib/clients/SlotMachineClientW2W';

/**
 * W2W adapter configuration
 */
export interface VoiW2WAdapterConfig {
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
 * W2W Symbol Constants
 */
const W2W_SYMBOLS = {
  BUFFALO: '0',
  EAGLE: '1',
  COUGAR: '2',
  ELK: '3',
  WOLF: '4',
  A: '5',
  K: '6',
  Q: '7',
  J: '8',
  TEN: '9',
  NINE: 'A',
  WILD: 'B',
  WILD2X: 'C',
  WILD3X: 'D',
  HOV: 'E',
  BONUS: 'F',
} as const;


/**
 * Game Constants
 */
const NUM_REELS = 5;
const NUM_ROWS = 3;
const JACKPOT_START = 50_000;
const JACKPOT_CONTRIBUTION = 3;
const JACKPOT_TRIGGER_COUNT = 3;
const BONUS_TRIGGER_COUNT = 2;
const BONUS_SPINS_AWARDED = 8;
const BONUS_MULTIPLIER = 1.5;

/**
 * Default network configuration for Voi
 */
const DEFAULT_VOI_CONFIG = {
  mainnet: {
    algodUrl: 'https://mainnet-api.voi.nodely.dev',
    indexerUrl: 'https://mainnet-idx.voi.nodely.dev',
    token: '',
  },
  testnet: {
    algodUrl: 'https://testnet-api.voi.nodely.dev',
    indexerUrl: 'https://testnet-idx.voi.nodely.dev',
    token: '',
  },
};

/**
 * Ways Win result
 */
interface WaysWinResult {
  symbol: string;
  ways: number;
  matchLength: number;
  payout: number;
  wildMultiplier: number;
}

/**
 * Voi W2W blockchain adapter
 */
export class VoiW2WAdapter implements BlockchainAdapter {
  private config: VoiW2WAdapterConfig;
  private algodClient: algosdk.Algodv2 | null = null;
  private indexer: algosdk.Indexer | null = null;
  private slotMachineClient: SlotMachineClient | null = null;
  private initialized: boolean = false;

  // Cached contract data
  private cachedConfig: SlotMachineConfig | null = null;
  private cachedJackpot: number = JACKPOT_START;

  constructor(config: VoiW2WAdapterConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const log = logger.scope('VoiW2WAdapter');
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
    const walletAddress = this.config.walletSigner?.address;
    if (!walletAddress) {
      throw new Error('Wallet signer address is required for SlotMachineClient');
    }

    this.slotMachineClient = new SlotMachineClient(
      {
        resolveBy: 'id',
        id: Number(this.config.contractId),
        sender: { addr: walletAddress as unknown as algosdk.Address } as any, // Signer not needed for initialization
      },
      this.algodClient
    );

    this.initialized = true;
    log.info('initialized successfully');
  }

  async submitSpin(betPerLine: number, paylines: number, walletAddress: string): Promise<BetKey> {
    // 5reel format - not supported by W2W adapter
    throw new Error('W2W adapter does not support 5reel format. Use submitSpinW2W instead.');
  }

  async submitSpinW2W(betAmount: number, index: number, mode: number, walletAddress: string): Promise<BetKey> {
    const log = logger.scope('VoiW2WAdapter:submitSpinW2W');
    log.info('submitting W2W spin', { betAmount, index, mode, walletAddress });

    if (!this.slotMachineClient || !this.algodClient || !this.config.walletSigner) {
      throw new Error('Adapter not initialized or wallet signer missing');
    }

    try {
      // Get spin cost first
      const spinCost = await this.getSpinCost();
      log.info('spin cost', { spinCost });

      // Get current block
      const status = await this.algodClient.status().do();
      const currentRound = status.lastRound;

      // Get machine state to validate bet amounts for network/token modes
      const machineState = await this.getMachineState();
      
      // Validate and adjust bet amount based on mode
      let actualBetAmount = betAmount;
      let paymentAmount = 0; // No payment transaction by default

      if (mode === 0 || mode === 1) {
        // Bonus mode: bet_amount must be 0
        // No payment transaction - only fee (50_500) on spin transaction
        actualBetAmount = 0;
        paymentAmount = 50_500; // No payment transaction, only fee
      } else if (mode === 2) {
        // VOI mode: bet_amount must be network_base_bet_cost (40) or network_base_bet_cost + network_kicker_extra (60)
        // Note: network_base_bet_cost is already in microAlgos from contract
        const networkBaseBetCost = Number(machineState.network_base_bet_cost || 40 * 10**6);
        const networkKickerExtra = Number(machineState.network_kicker_extra || 20 * 10**6);
        const baseBet = networkBaseBetCost;
        const kickerBet = networkBaseBetCost + networkKickerExtra;
        
        if (betAmount !== baseBet && betAmount !== kickerBet) {
          throw new Error(`VOI mode requires bet amount of ${baseBet} or ${kickerBet} (got ${betAmount})`);
        }
        actualBetAmount = betAmount;
        // Pay bet amount (fee is on spin transaction, not payment)
        paymentAmount = betAmount; // Only bet amount, fee is separate on spin transaction
      } else if (mode === 4) {
        // ARC200 mode: bet_amount must be token_base_bet_cost or token_base_bet_cost + token_kicker_extra
        // Note: Token mode requires token transfers, which is more complex
        // For now, we'll handle the bet amount validation
        const tokenBaseBetCost = Number(machineState.token_base_bet_cost || 40 * 10**6);
        const tokenKickerExtra = Number(machineState.token_kicker_extra || 20 * 10**6);
        const baseBet = tokenBaseBetCost;
        const kickerBet = tokenBaseBetCost + tokenKickerExtra;
        
        if (betAmount !== baseBet && betAmount !== kickerBet) {
          throw new Error(`ARC200 mode requires bet amount of ${baseBet} or ${kickerBet} (got ${betAmount})`);
        }
        actualBetAmount = betAmount;
        // ARC200 mode requires token transfer, not VOI payment
        // This would need additional ARC200 token transfer logic
        throw new Error('ARC200 mode not yet implemented - requires ARC200 token transfer');
      } else {
        throw new Error(`Invalid mode: ${mode}. Must be 0 (bonus), 1 (credit/free-play), 2 (VOI), or 4 (ARC200)`);
      }

      const contractAddress = algosdk.getApplicationAddress(Number(this.config.contractId));
      const suggestedParams = await this.algodClient.getTransactionParams().do();

      // Create AlgoKit signer adapter for transactions
      const signerAdapter = createAlgoKitTransactionSigner(this.config.walletSigner);

      // Use SlotMachineClient composer to handle payment + spin
      const composer = this.slotMachineClient.compose();

      // Get the required transaction fee from the contract (spin_cost = 50_500)
      const requiredFee = await this.getSpinCost();
      log.info('required transaction fee', { requiredFee });

      // Add payment transaction if needed (only for VOI mode)
      // Bonus mode (0) and Credit mode (1) do NOT include a payment transaction - only fee on spin
      // ARC200 mode would need ARC200 token transfer instead
      if (paymentAmount > 0) {
        // Create payment transaction with minimal fee (1000 microAlgos)
        // The fee for the payment transaction should be minimal, not the spin cost
        const paymentParams = Object.assign({}, suggestedParams, { fee: 1000 });
        const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          sender: walletAddress as unknown as algosdk.Address,
          receiver: contractAddress,
          amount: paymentAmount,
          suggestedParams: paymentParams,
        });
        
        // Wrap transaction with signer (same pattern as 5-reel adapter)
        const paymentTxnWithSigner = await algokit.getTransactionWithSigner(
          paymentTxn,
          { addr: walletAddress as unknown as algosdk.Address, signer: signerAdapter }
        );
        
        composer.addTransaction(paymentTxnWithSigner);
      }

      console.log('spin', {
        betAmount: BigInt(actualBetAmount),
        index: BigInt(index),
        mode: BigInt(mode),
      });

      // Add spin method call with correct bet amount and fee
      // Note: ABI uses bet_amount (snake_case), but the generated client may use camelCase
      composer.spin(
        {
          betAmount: BigInt(actualBetAmount),
          index: BigInt(index),
          mode: BigInt(mode),
        },
        {
          sender: {
            addr: walletAddress as unknown as algosdk.Address,
            signer: signerAdapter,
          },
          sendParams: {
            fee: algokit.microAlgos(requiredFee)
          }
        }
      );

      // Execute transaction
      const result = await composer.execute();
      console.log('submitSpinW2W result', result);
      const txId = result.txIds[result.txIds.length - 1]; // Last tx is the spin call

      // Wait for confirmation
      await algosdk.waitForConfirmation(this.algodClient, txId, 4);

      // Extract bet_key from return value
      const betKeyBytes = result.returns[result.returns.length - 1] as Uint8Array;
      let betKeyHex: string;

      if (betKeyBytes && betKeyBytes.length === 56) {
        betKeyHex = Buffer.from(betKeyBytes).toString('hex');
        console.log('betKeyHex1', betKeyHex);
      } else {
        // Fallback: construct bet key from known values
        const addressBytes = algosdk.decodeAddress(walletAddress).publicKey;
        const betAmountBytes = algosdk.encodeUint64(actualBetAmount);
        const indexBytes = algosdk.encodeUint64(index);
        const modeBytes = algosdk.encodeUint64(mode);
        const constructed = new Uint8Array([...addressBytes, ...betAmountBytes, ...indexBytes, ...modeBytes]);
        const padded = new Uint8Array(56);
        padded.set(constructed, 0);
        betKeyHex = Buffer.from(padded).toString('hex');
        console.log('betKeyHex2', betKeyHex);
      }

      // Contract sets claim_round = confirmedRound + 2, so we must match that
      // Get confirmed round from the transaction - result may have confirmations array
      const confirmedRound = (result as any).confirmations?.[result.txIds.length - 1]?.confirmedRound;
      const claimBlock = confirmedRound ? Number(confirmedRound) + 2 : Number(currentRound) + 2;
      console.log('claimBlock', claimBlock);

      log.info('spin submitted', { txId, betKeyHex, claimBlock, mode, actualBetAmount });

      return {
        key: betKeyHex,
        betKey: betKeyHex,
        txId,
        submitBlock: Number(currentRound),
        claimBlock
      };
    } catch (error) {
      log.error('spin submission failed', error);
      throw error;
    }
  }

  async claimSpin(betKey: string, claimBlock: number, betPerLine: number, paylines: number): Promise<SpinOutcome> {
    // 5reel format - not supported by W2W adapter
    throw new Error('W2W adapter does not support 5reel format. Use claimSpinW2W instead.');
  }

  async claimSpinW2W(betKey: string, claimBlock: number, index?: number): Promise<SpinOutcome> {
    const log = logger.scope('VoiW2WAdapter:claimSpinW2W');
    log.info('claiming W2W spin', { betKey, claimBlock, index });

    if (!this.slotMachineClient || !this.algodClient || !this.config.walletSigner) {
      throw new Error('Adapter not initialized or wallet signer missing');
    }

    try {
      // Convert bet key hex to bytes
      const betKeyBytes = Buffer.from(betKey, 'hex');
      if (betKeyBytes.length !== 56) {
        throw new Error(`Invalid bet key length: expected 56 bytes, got ${betKeyBytes.length}`);
      }

      const walletAddress = this.config.walletSigner.address;

      await this.algodClient.statusAfterBlock(claimBlock).do();
      const status = await this.algodClient.status().do();
      const currentRound = Number(status.lastRound);
      console.log('currentRound', currentRound);
      console.log('claimBlock', claimBlock);

      // Use SlotMachineClient to call claim
      const signerAdapter = createAlgoKitTransactionSigner(this.config.walletSigner);
      const result = await this.slotMachineClient.claim(
        {
          betKey: betKeyBytes,
        },
        {
          sender: {
            addr: walletAddress as unknown as algosdk.Address,
            signer: signerAdapter,
          },
          sendParams: {
            fee: algokit.microAlgos(50_000)
          }
        }
      );

      console.log('result', result);

      // Get payout from return value - claim() returns uint64 (payout amount)
      const payout = result.return || 0n;
      const payoutAmount = typeof payout === 'bigint' ? Number(payout) : (typeof payout === 'number' ? payout : 0);

      log.info('claim completed', { payoutAmount });

      // Get block seed for this claim block (as hex string for reference)
      const blockSeedHex = await this.getBlockSeed(claimBlock);

      // Get grid from contract using getCdfGridFromSeedAndSpin if index is provided
      let symbolGrid: SymbolId[][] = [];
      if (index !== undefined) {
        try {
          // Get block seed as bytes (32 bytes) for the contract call
          // The confirmation block is where the claim transaction was confirmed
          // For now, we'll use the claimBlock itself
          const confirmationBlock = claimBlock;
          const blockSeedBytes = await this.getBlockSeedBytes(confirmationBlock);
          
          if (blockSeedBytes.length !== 32) {
            log.warn('Block seed is not 32 bytes, cannot get grid', { length: blockSeedBytes.length });
          } else {
            // Use composer to simulate getCdfGridFromSeedAndSpin (readonly call)
            const composer = this.slotMachineClient.compose();
            composer.getCdfGridFromSeedAndSpin(
              {
                seed: blockSeedBytes,
                spinIndex: BigInt(index),
              },
              {
                sender: {
                  addr: walletAddress as unknown as algosdk.Address,
                  signer: signerAdapter,
                },
                sendParams: {
                  populateAppCallResources: true,
                  skipSending: true, // Don't send, just simulate
                  fee: algokit.microAlgos(300_000)
                } as any, // skipSending is needed for simulation but not in type
                apps: [ 47060800 ]
              }
            );

            // Simulate the transaction to get the grid
            const simResult = await composer.simulate({
              allowEmptySignatures: true,
              allowMoreLogging: true
            });

            // Log raw simulation result for troubleshooting
            const rawReturns = simResult.returns as any;
            console.log('🔍 RAW CDF simulation result:', {
              returns: rawReturns,
              returns0: rawReturns?.[0],
              returns0Length: rawReturns?.[0]?.length
            });

            // Extract grid bytes from simulation result
            // The returns array contains the return values from each method call
            // simResult.returns[0] is an array of 15 numbers (byte values: 0-255)
            const returns = simResult.returns as any;
            const gridBytes = (returns && Array.isArray(returns) && returns.length > 0) 
              ? (returns[0] as Array<number>)
              : undefined;
            
            console.log('🔍 Extracted gridBytes:', {
              gridBytes,
              gridBytesType: typeof gridBytes,
              gridBytesIsArray: Array.isArray(gridBytes),
              gridBytesLength: gridBytes?.length,
              gridBytesValues: gridBytes
            });
            
            if (gridBytes && Array.isArray(gridBytes) && gridBytes.length === 15) {
              // Convert grid bytes to 2D array (5 reels × 3 rows)
              // Contract returns grid as COLUMN-MAJOR: [reel0_row0, reel0_row1, reel0_row2, reel1_row0, reel1_row1, ...]
              // So: bytes 0-2 = reel 0, bytes 3-5 = reel 1, bytes 6-8 = reel 2, bytes 9-11 = reel 3, bytes 12-14 = reel 4
              // Contract stores symbols as ASCII bytes that directly map to symbol IDs: '0'-'9' and 'A'-'F'
              
              // Convert bytes to characters (these are the symbol IDs)
              const gridString = gridBytes.map(byte => String.fromCharCode(byte)).join('');
              
              // Build grid as columns (reels) with rows
              // grid[reel][row] format expected by ReelGrid component
              // Index formula: reel * NUM_ROWS + row
              // Reel 0: indices 0,1,2 (rows 0-2)
              // Reel 1: indices 3,4,5 (rows 0-2)
              // Reel 2: indices 6,7,8 (rows 0-2)
              // Reel 3: indices 9,10,11 (rows 0-2)
              // Reel 4: indices 12,13,14 (rows 0-2)
              for (let reel = 0; reel < NUM_REELS; reel++) {
                const reelSymbols: SymbolId[] = [];
                for (let row = 0; row < NUM_ROWS; row++) {
                  const gridIndex = reel * NUM_ROWS + row;
                  const symbol = gridString[gridIndex] as SymbolId;
                  reelSymbols.push(symbol);
                }
                symbolGrid.push(reelSymbols);
              }
              
              log.info('Grid retrieved from contract', { 
                gridString: gridString,
                visualRows: {
                  row1: `${gridString[0]} ${gridString[3]} ${gridString[6]} ${gridString[9]} ${gridString[12]}`,
                  row2: `${gridString[1]} ${gridString[4]} ${gridString[7]} ${gridString[10]} ${gridString[13]}`,
                  row3: `${gridString[2]} ${gridString[5]} ${gridString[8]} ${gridString[11]} ${gridString[14]}`
                }
              });
            } else {
              console.warn('Invalid grid bytes from contract', { 
                length: gridBytes?.length || 0,
                isArray: Array.isArray(gridBytes),
                gridBytes: gridBytes
              });
            }
          }
        } catch (gridError) {
          log.warn('Failed to get grid from contract, continuing without grid', { error: gridError });
        }
      } else {
        log.warn('Index not provided, cannot retrieve grid from contract');
      }


      const outcome: SpinOutcome = {
        grid: symbolGrid,
        waysWins: [],
        totalPayout: payoutAmount,
        blockNumber: claimBlock,
        blockSeed: blockSeedHex,
        betKey,
        verified: true,
      };

      return outcome;
    } catch (error) {
      log.error('claim failed', error);
      throw error;
    }
  }

  async calculateOutcomeFromBlockSeed(
    betKey: string,
    claimBlock: number,
    betPerLine: number,
    paylines: number
  ): Promise<SpinOutcome> {
    // 5reel format - not supported by W2W adapter
    throw new Error('W2W adapter does not support 5reel format.');
  }

  /**
   * Get jackpot amount from machine state
   */
  private async getJackpotAmount(): Promise<number> {
    try {
      const machineState = await this.getMachineState();
      // Return network jackpot (in microAlgos)
      return Number(machineState.jackpot_network || 0);
    } catch (error) {
      logger.scope('VoiW2WAdapter:getJackpotAmount').warn('failed to get jackpot, using cached value', error);
      return this.cachedJackpot;
    }
  }

  async getContractConfig(): Promise<SlotMachineConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    if (!this.algodClient) {
      throw new Error('Adapter not initialized');
    }

    try {
      // Query contract for machine state
      const machineState = await this.getMachineState();
      
      // Extract config from machine state
      const minBet = Number(machineState.credit_bet_cost || 40_000_000); // 40 credits in microVOI
      const maxBet = Number(machineState.network_base_bet_cost || 60_000_000) + 
                      Number(machineState.network_kicker_extra || 20_000_000); // 60 + 20 = 80 max

      this.cachedConfig = {
        id: `voi-w2w-${this.config.contractId}`,
        name: 'W2W Slot Machine',
        displayName: 'Ways to Win Slots',
        contractId: this.config.contractId,
        chain: 'voi',
        rtpTarget: 96.0, // Default, should come from contract
        houseEdge: 4.0, // Default, should come from contract
        minBet: minBet,
        maxBet: maxBet,
        maxPaylines: 0, // W2W doesn't use paylines
        reelConfig: {
          reelCount: 5 as const,
          reelLength: 100 as const, // Required by type, but W2W doesn't use fixed reels
          windowLength: 3,
          reels: [] // W2W generates reels dynamically
        },
        paylinePatterns: [], // W2W doesn't use paylines
        paytable: {
          symbols: [], // W2W uses different payout calculation
          maxPayoutMultiplier: 900
        },
        isActive: true,
        launchedAt: new Date()
      };

      return this.cachedConfig!;
    } catch (error) {
      // Fallback to defaults if contract query fails
      this.cachedConfig = {
        id: `voi-w2w-${this.config.contractId}`,
        name: 'W2W Slot Machine',
        displayName: 'Ways to Win Slots',
        contractId: this.config.contractId,
        chain: 'voi',
        rtpTarget: 96.0,
        houseEdge: 4.0,
        minBet: 40_000_000, // 40 credits
        maxBet: 80_000_000, // 80 max
        maxPaylines: 0, // W2W doesn't use paylines
        reelConfig: {
          reelCount: 5 as const,
          reelLength: 100 as const, // Required by type, but W2W doesn't use fixed reels
          windowLength: 3,
          reels: [] // W2W generates reels dynamically
        },
        paylinePatterns: [], // W2W doesn't use paylines
        paytable: {
          symbols: [], // W2W uses different payout calculation
          maxPayoutMultiplier: 900
        },
        isActive: true,
        launchedAt: new Date()
      };
      return this.cachedConfig!;
    }
  }

  async getBalance(walletAddress: string): Promise<number> {
    if (!this.algodClient) {
      throw new Error('Adapter not initialized');
    }

    // For W2W, balance depends on mode:
    // - Credit mode: query get_user for credits
    // - VOI mode: query algod for VOI balance
    // - ARC200 mode: query ARC200 token balance
    // Default to VOI balance for now
    const accountInfo = await this.algodClient.accountInformation(walletAddress).do();
    return Number(accountInfo.amount); // Returns microVOI
  }

  async getCurrentBlock(): Promise<number> {
    if (!this.algodClient) {
      throw new Error('Adapter not initialized');
    }

    const status = await this.algodClient.status().do();
    return Number(status.lastRound);
  }

  async getUserData(address: string): Promise<{ credits: number; bonusSpins: number }> {
    const log = logger.scope('VoiW2WAdapter:getUserData');
    
    if (!this.algodClient) {
      throw new Error('Adapter not initialized');
    }

    try {
      // Use ulujs CONTRACT class with ABI - same pattern as algorand.ts
      const w2wABI = {
        name: "Slot Machine W2W",
        desc: "Ways to Win slot machine",
        methods: APP_SPEC.contract.methods,
        events: []
      };

      const ci = new CONTRACT(
        Number(this.config.contractId),
        this.algodClient,
        undefined, // indexer not needed for readonly call
        w2wABI,
        {
          addr: address,
          sk: new Uint8Array(64) // Dummy secret key for readonly calls
        }
      );

      // Call get_user method directly - returns { success, returnValue }
      const result = await ci.get_user(address);

      if (!result.success || !result.returnValue) {
        log.warn('get_user call failed or no return value', { result });
        return { credits: 0, bonusSpins: 0 };
      }

      // returnValue is a tuple: (address, uint64, uint64, uint64, uint64)
      // Which is: (who, credit, bonusSpin, spinCount, lastSpinTimestamp)
      const returnValue = result.returnValue;
      let credits = 0;
      let bonusSpins = 0;

      if (Array.isArray(returnValue) && returnValue.length >= 3) {
        credits = Number(returnValue[1] || 0);
        bonusSpins = Number(returnValue[2] || 0);
      } else if (returnValue && typeof returnValue === 'object') {
        credits = Number((returnValue as any).credit || (returnValue as any)[1] || 0);
        bonusSpins = Number((returnValue as any).bonusSpin || (returnValue as any).bonus_spin || (returnValue as any)[2] || 0);
      }
      
      return { credits, bonusSpins };
    } catch (error) {
      log.error('failed to get user data', error);
      return { credits: 0, bonusSpins: 0 };
    }
  }

  async getMachineState(): Promise<any> {
    const log = logger.scope('VoiW2WAdapter:getMachineState');
    
    if (!this.slotMachineClient) {
      throw new Error('Adapter not initialized');
    }

    try {
      // Use SlotMachineClient's getGlobalState to access machine state
      const globalState = await this.slotMachineClient.getGlobalState();
      
      // Return machine state as an object with the relevant fields
      return {
        jackpot_credit: globalState.jackpotCredit?.asNumber() || 0,
        jackpot_network: globalState.jackpotNetwork?.asNumber() || 0,
        jackpot_token: globalState.jackpotToken?.asByteArray() || new Uint8Array(0),
        credit_bet_cost: globalState.creditBetCost?.asNumber() || 0,
        network_base_bet_cost: globalState.networkBaseBetCost?.asNumber() || 0,
        network_kicker_extra: globalState.networkKickerExtra?.asNumber() || 0,
        mode_enabled: globalState.modeEnabled?.asNumber() || 7, // Default: all enabled
      };
    } catch (error) {
      log.error('failed to get machine state', error);
      throw error;
    }
  }

  /**
   * Get spin cost from contract
   */
  private async getSpinCost(): Promise<number> {
    const log = logger.scope('VoiW2WAdapter:getSpinCost');
    
     return 50_500; // Default spin cost
  }

  /**
   * Get block seed for a given round (as hex string)
   */
  private async getBlockSeed(round: number): Promise<string> {
    if (!this.algodClient) {
      throw new Error('Adapter not initialized');
    }

    try {
      const blockInfo = await this.algodClient.block(round).do();
      // Block seed is typically in block['seed'] or similar
      // For Voi/Algorand, seed might be in block header
      const seed = blockInfo.block.header.seed || blockInfo['block']?.header.seed || '';
      if (seed instanceof Uint8Array) {
        // Convert Uint8Array to hex string
        return Array.from(seed)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      }
      return typeof seed === 'string' ? seed : '';
    } catch (error) {
      // Fallback: generate a deterministic seed from round number
      const encoder = new TextEncoder();
      const bytes = encoder.encode(round.toString());
      return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
  }

  /**
   * Get block seed for a given round (as bytes, 32 bytes)
   */
  private async getBlockSeedBytes(round: number): Promise<Uint8Array> {
    if (!this.algodClient) {
      throw new Error('Adapter not initialized');
    }

    try {
      const blockInfo = await this.algodClient.block(round).do();
      const seed = blockInfo.block.header.seed || blockInfo['block']?.header.seed;
      if (seed instanceof Uint8Array) {
        // Ensure it's exactly 32 bytes (pad or truncate if needed)
        if (seed.length === 32) {
          return seed;
        } else if (seed.length > 32) {
          return seed.slice(0, 32);
        } else {
          // Pad with zeros if shorter
          const padded = new Uint8Array(32);
          padded.set(seed, 0);
          return padded;
        }
      } else if (typeof seed === 'string') {
        // Convert hex string to bytes
        const bytes = Buffer.from(seed, 'hex');
        if (bytes.length === 32) {
          return bytes;
        } else if (bytes.length > 32) {
          return bytes.slice(0, 32);
        } else {
          const padded = new Uint8Array(32);
          padded.set(bytes, 0);
          return padded;
        }
      }
      // Fallback: generate a deterministic seed from round number
      const encoder = new TextEncoder();
      const bytes = encoder.encode(round.toString());
      const padded = new Uint8Array(32);
      padded.set(bytes.slice(0, 32), 0);
      return padded;
    } catch (error) {
      // Fallback: generate a deterministic seed from round number
      const encoder = new TextEncoder();
      const bytes = encoder.encode(round.toString());
      const padded = new Uint8Array(32);
      padded.set(bytes.slice(0, 32), 0);
      return padded;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  destroy(): void {
    this.algodClient = null;
    this.indexer = null;
    this.initialized = false;
    this.cachedConfig = null;
  }
}
