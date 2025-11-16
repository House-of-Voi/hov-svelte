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
import { calculateW2WPayouts, isJackpotTriggered, isBonusTriggered, countScatterSymbols, calculateCompletePayout, type CompletePayoutResult } from '../utils/w2wPayoutCalculator';

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

const ARC200_APPROVE_METHOD = new algosdk.ABIMethod({
  name: 'arc200_approve',
  args: [
    { type: 'address', name: 'spender' },
    { type: 'uint256', name: 'amount' },
  ],
  returns: { type: 'bool' },
});

function decodeBinaryStateNumber(state?: { asByteArray(): Uint8Array }): number {
  if (!state) {
    return 0;
  }
  const bytes = state.asByteArray();
  if (!bytes || bytes.length === 0) {
    return 0;
  }
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return Number(value);
}

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
      const contractAddress = algosdk.getApplicationAddress(Number(this.config.contractId));
      const suggestedParams = await this.algodClient.getTransactionParams().do();
      const signerAdapter = createAlgoKitTransactionSigner(this.config.walletSigner);
      const walletAddress = this.config.walletSigner.address;
      
      // Validate and adjust bet amount based on mode
      let actualBetAmount = betAmount;
      let paymentAmount = 0; // No payment transaction by default
      let arc200ApproveTxnWithSigner: Awaited<ReturnType<typeof algokit.getTransactionWithSigner>> | null = null;

      if (mode === 0 || mode === 1) {
        // Bonus mode: bet_amount must be 0
        // No payment transaction - only fee (50_500) on spin transaction
        actualBetAmount = 0;
        paymentAmount = 50_500;
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
        const tokenBaseBetCost = Number(
          machineState.token_base_bet_cost ||
            machineState.tokenBaseBetCost ||
            40 * 10 ** 6
        );
        const tokenKickerExtra = Number(
          machineState.token_kicker_extra ||
            machineState.tokenKickerExtra ||
            20 * 10 ** 6
        );
        const baseBet = tokenBaseBetCost;
        const kickerBet = tokenBaseBetCost + tokenKickerExtra;
        const tokenAppId = Number(
          machineState.token_app_id || machineState.tokenAppId || 0
        );

        if (!tokenAppId) {
          throw new Error('ARC200 mode requires token_app_id in machine state');
        }
        
        if (betAmount !== baseBet && betAmount !== kickerBet) {
          throw new Error(`ARC200 mode requires bet amount of ${baseBet} or ${kickerBet} (got ${betAmount})`);
        }
        actualBetAmount = betAmount;

        // Build ARC200 approve transaction (approve contract to spend bet amount)
        const approveTxn = this.createArc200ApproveTransaction(
          walletAddress,
          tokenAppId,
          algosdk.encodeAddress(contractAddress.publicKey),
          actualBetAmount,
          suggestedParams
        );
        arc200ApproveTxnWithSigner = await algokit.getTransactionWithSigner(
          approveTxn,
          { addr: walletAddress as unknown as algosdk.Address, signer: signerAdapter }
        );

        // ARC200 spins still pay VOI fees via a small payment transaction
        paymentAmount = spinCost;
      } else {
        throw new Error(`Invalid mode: ${mode}. Must be 0 (bonus), 1 (credit/free-play), 2 (VOI), or 4 (ARC200)`);
      }

      // Use SlotMachineClient composer to handle payment + spin
      const composer = this.slotMachineClient.compose();

      // Get the required transaction fee from the contract (spin_cost = 50_500)
      const requiredFee = spinCost;
      log.info('required transaction fee', { requiredFee });

      if (arc200ApproveTxnWithSigner) {
        composer.addTransaction(arc200ApproveTxnWithSigner);
      }

      // Add payment transaction if needed (only for VOI mode)
      // Bonus mode (0) and Credit mode (1) do NOT include a payment transaction - only fee on spin
      // ARC200 mode includes a small VOI payment for the network fee (50_500)
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

      // Extract spin_count from global state delta
      let spinIndex: number | undefined;
      try {
        const lastTxIndex = result.txIds.length - 1;
        const confirmation = (result as any).confirmations?.[lastTxIndex];
        const globalStateDelta = confirmation?.globalStateDelta;
        
        if (globalStateDelta && Array.isArray(globalStateDelta)) {
          // Base64 encode "spin_count" to match against keys
          const spinCountKey = Buffer.from('spin_count').toString('base64');
          
          // Find the entry with matching key
          const spinCountEntry = globalStateDelta.find((entry: any) => entry.key === spinCountKey);
          
          if (spinCountEntry && spinCountEntry.value && typeof spinCountEntry.value.uint === 'bigint') {
            spinIndex = Number(spinCountEntry.value.uint) - 1;
            log.info('extracted spin_count from global state delta', { spinIndex });
          } else {
            log.warn('spin_count not found in global state delta', { 
              globalStateDeltaKeys: globalStateDelta.map((e: any) => e.key),
              expectedKey: spinCountKey
            });
          }
        } else {
          log.warn('globalStateDelta not found or not an array', { 
            hasConfirmation: !!confirmation,
            globalStateDelta 
          });
        }
      } catch (extractError) {
        log.warn('failed to extract spin_count from global state delta', extractError);
      }

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

      log.info('spin submitted', { txId, betKeyHex, claimBlock, mode, actualBetAmount, spinIndex });

      return {
        key: betKeyHex,
        betKey: betKeyHex,
        txId,
        submitBlock: Number(currentRound),
        claimBlock,
        spinIndex
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

  /**
   * Get grid for a W2W spin without claiming
   * Must be called after claim block is reached (block seed needed)
   * 
   * @param betKey Bet key for the spin
   * @param claimBlock Block number where outcome can be claimed
   * @param spinIndex Spin index from global state (spin_count)
   * @returns Grid as SymbolId[][]
   */
  async getGridW2W(betKey: string, claimBlock: number, spinIndex: number): Promise<SymbolId[][]> {
    const log = logger.scope('VoiW2WAdapter:getGridW2W');
    log.info('getting W2W grid', { betKey, claimBlock, spinIndex });

    if (!this.slotMachineClient || !this.algodClient || !this.config.walletSigner) {
      throw new Error('Adapter not initialized or wallet signer missing');
    }

    try {
      const walletAddress = this.config.walletSigner.address;
      
      // Get block seed as bytes (32 bytes) for the contract call
      // The contract's _get_spin_results uses: seed = _get_block_seed(claim_round)
      const blockSeedBytes = await this.getBlockSeedBytes(claimBlock);
      
      if (blockSeedBytes.length !== 32) {
        throw new Error(`Block seed is not 32 bytes, got ${blockSeedBytes.length}`);
      }

      log.info('retrieving grid from contract', {
        claimBlock,
        spinIndex,
        blockSeedLength: blockSeedBytes.length
      });

      // Use composer to simulate getCdfGridFromSeedAndSpin (readonly call)
      // The contract method does: grid_seed = sha256(seed + spin_index.bytes)
      const signerAdapter = createAlgoKitTransactionSigner(this.config.walletSigner);
      const composer = this.slotMachineClient.compose();
      composer.getCdfGridFromSeedAndSpin(
        {
          seed: blockSeedBytes,
          spinIndex: BigInt(spinIndex),
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

      // Extract grid bytes from simulation result
      // The returns array contains the return values from each method call
      // simResult.returns[0] is an array of 15 numbers (byte values: 0-255)
      const returns = simResult.returns as any;
      const gridBytes = (returns && Array.isArray(returns) && returns.length > 0) 
        ? (returns[0] as Array<number>)
        : undefined;
      
      if (!gridBytes || !Array.isArray(gridBytes) || gridBytes.length !== 15) {
        throw new Error(`Invalid grid bytes from contract: ${gridBytes?.length || 0} bytes`);
      }

      // Convert grid bytes to 2D array (5 reels × 3 rows)
      // Contract returns grid as COLUMN-MAJOR: [reel0_row0, reel0_row1, reel0_row2, reel1_row0, reel1_row1, ...]
      // So: bytes 0-2 = reel 0, bytes 3-5 = reel 1, bytes 6-8 = reel 2, bytes 9-11 = reel 3, bytes 12-14 = reel 4
      // Contract stores symbols as ASCII bytes that directly map to symbol IDs: '0'-'9' and 'A'-'F'
      
      // Convert bytes to characters (these are the symbol IDs)
      const gridString = gridBytes.map(byte => String.fromCharCode(byte)).join('');
      
      // Build grid as columns (reels) with rows
      // grid[reel][row] format expected by ReelGrid component
      const symbolGrid: SymbolId[][] = [];
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

      return symbolGrid;
    } catch (error) {
      log.error('failed to get grid', error);
      throw error;
    }
  }

  /**
   * Extract bet amount from bet key
   * Bet key format: address (32 bytes) + betAmount (8 bytes) + index (8 bytes) + mode (8 bytes) = 56 bytes
   */
  private extractBetAmountFromBetKey(betKey: string): number {
    try {
      const betKeyBytes = Buffer.from(betKey, 'hex');
      if (betKeyBytes.length !== 56) {
        throw new Error(`Invalid bet key length: expected 56 bytes, got ${betKeyBytes.length}`);
      }
      // Bet amount is at bytes 32-40 (8 bytes, uint64)
      const betAmountBytes = betKeyBytes.slice(32, 40);
      return Number(algosdk.decodeUint64(betAmountBytes, 'bigint'));
    } catch (error) {
      logger.scope('VoiW2WAdapter:extractBetAmountFromBetKey').warn('failed to extract bet amount from bet key', error);
      return 0;
    }
  }

  /**
   * Calculate payout for a W2W grid using client-side logic
   * Validates against contract logic
   * 
   * @param grid The symbol grid
   * @param mode Spin mode: 0=bonus, 1=credit, 2=network, 4=token
   * @param isBonusSpin Whether this is a bonus spin (mode === 0)
   * @param betAmount Bet amount in microAlgos (for network/token modes) or credits (for credit mode)
   * @returns Complete payout result with ways wins, total payout, bonus spins, jackpot info
   */
  async calculatePayoutW2W(
    grid: SymbolId[][],
    mode: number,
    isBonusSpin: boolean,
    betAmount?: number
  ): Promise<CompletePayoutResult> {
    const log = logger.scope('VoiW2WAdapter:calculatePayoutW2W');
    log.info('calculating W2W payout', { mode, isBonusSpin, betAmount });

    if (!this.slotMachineClient) {
      throw new Error('Adapter not initialized');
    }

    try {
      // Get machine state to retrieve jackpot values
      const machineState = await this.getMachineState();
      
      // Determine jackpot value based on mode
      // Contract uses jackpot_network for network mode, jackpot_token for token mode, jackpot_credit for credit mode
      let jackpotValue = 0;
      if (mode === 2) {
        // Network mode: use network jackpot (in microAlgos)
        jackpotValue = Number(machineState.jackpot_network || 0);
      } else if (mode === 4) {
        // Token mode: use token jackpot (in microAlgos equivalent)
        const tokenJackpot = machineState.jackpot_token;
        if (tokenJackpot && tokenJackpot.length > 0) {
          // Token jackpot is stored as Uint256 bytes, convert to number
          // Take last 8 bytes (Uint64) for the value
          const bytes = new Uint8Array(tokenJackpot);
          if (bytes.length >= 8) {
            const last8Bytes = bytes.slice(-8);
            jackpotValue = Number(algosdk.decodeUint64(Buffer.from(last8Bytes), 'bigint'));
          }
        }
      } else if (mode === 1) {
        // Credit mode: use credit jackpot (in credits/microVOI)
        jackpotValue = Number(machineState.jackpot_credit || 0);
      } else if (mode === 0) {
        // Bonus mode: use network jackpot (bonus spins can win jackpot)
        jackpotValue = Number(machineState.jackpot_network || 0);
      }

      log.info('jackpot value', { mode, jackpotValue });

      // Calculate complete payout using client-side logic
      const payoutResult = calculateCompletePayout(grid, isBonusSpin, jackpotValue);

      // Apply mode-specific multipliers
      // Contract applies multipliers in claim methods:
      // - Bonus mode (0): 1.75x multiplier (contract line 5245)
      // - Credit mode (1): 1x multiplier (contract line 5309)
      // - Network mode (2): payout = spin_result.payout.native * bet_amount.native (contract line 5369)
      // - Token mode (4): payout = spin_result.payout.native * bet_amount.native (contract line 5411)
      
      let finalTotalPayout = payoutResult.totalPayout;
      let finalLinePayout = payoutResult.linePayout;

      if (mode === 0) {
        // Bonus mode: payout = base_payout * 40_000_000 (40 VOI in microAlgos)
        // This represents the fixed bet amount for bonus spins
        finalTotalPayout = payoutResult.totalPayout * 40_000_000;
        finalLinePayout = payoutResult.linePayout * 40_000_000;
        log.info('applied bonus mode multiplier (40_000_000)', { 
          original: payoutResult.totalPayout, 
          final: finalTotalPayout 
        });
      } else if (mode === 2 || mode === 4) {
        // Network/Token mode: payout = base_payout * bet_amount
        // Contract line 5369/5411: payout = spin_result.payout.native * bet.bet_amount.native
        // Our calculateCompletePayout returns in credits (same units as paytable)
        // So we multiply by bet_amount (which is in microAlgos for network/token modes)
        if (!betAmount || betAmount === 0) {
          log.warn('betAmount not provided for network/token mode, payout may be incorrect');
        } else {
          finalTotalPayout = payoutResult.totalPayout * betAmount;
          finalLinePayout = payoutResult.linePayout * betAmount;
          log.info('applied network/token mode multiplier (bet amount)', { 
            original: payoutResult.totalPayout, 
            betAmount,
            final: finalTotalPayout 
          });
        }
      }
      // Credit mode (1): no multiplier, payout stays as is

      return {
        ...payoutResult,
        totalPayout: finalTotalPayout,
        linePayout: finalLinePayout
      };
    } catch (error) {
      log.error('failed to calculate payout', error);
      throw error;
    }
  }

  /**
   * Get outcome for a W2W spin (grid + calculated payouts) without claiming
   * Returns immediately after claim block is reached, before claim transaction completes
   * 
   * @param betKey Bet key for the spin
   * @param claimBlock Block number where outcome can be claimed
   * @param spinIndex Spin index from global state (spin_count)
   * @param mode Spin mode: 0=bonus, 1=credit, 2=network, 4=token
   * @returns SpinOutcome with grid and calculated payouts
   */
  async getOutcomeW2W(
    betKey: string,
    claimBlock: number,
    spinIndex: number,
    mode: number
  ): Promise<SpinOutcome> {
    const log = logger.scope('VoiW2WAdapter:getOutcomeW2W');
    log.info('getting W2W outcome', { betKey, claimBlock, spinIndex, mode });

    if (!spinIndex) {
      throw new Error('spinIndex is required for getOutcomeW2W');
    }

    try {
      // Get grid using getGridW2W (requires claim block to be reached)
      const symbolGrid = await this.getGridW2W(betKey, claimBlock, spinIndex);

      // Determine if this is a bonus spin
      const isBonusSpin = mode === 0;

      // Extract bet amount from bet key for network/token modes
      const betAmount = this.extractBetAmountFromBetKey(betKey);
      log.info('extracted bet amount from bet key', { betAmount, mode });

      // Calculate payouts using client-side logic
      const payoutResult = await this.calculatePayoutW2W(symbolGrid, mode, isBonusSpin, betAmount);

      // Get block seed for reference
      const blockSeedHex = await this.getBlockSeed(claimBlock);

      // Build SpinOutcome with calculated values
      const outcome: SpinOutcome = {
        grid: symbolGrid,
        waysWins: payoutResult.waysWins || [],
        totalPayout: payoutResult.totalPayout,
        blockNumber: claimBlock,
        blockSeed: blockSeedHex,
        betKey,
        verified: false, // Not yet verified via claim transaction
        bonusSpinsAwarded: payoutResult.bonusSpinsAwarded,
        jackpotHit: payoutResult.jackpotHit === 1,
        jackpotAmount: payoutResult.jackpotAmount
      };

      log.info('outcome calculated', {
        totalPayout: outcome.totalPayout,
        bonusSpinsAwarded: outcome.bonusSpinsAwarded,
        jackpotHit: outcome.jackpotHit,
        waysWinsCount: outcome.waysWins?.length || 0
      });

      return outcome;
    } catch (error) {
      log.error('failed to get outcome', error);
      throw error;
    }
  }

  /**
   * Execute claim transaction for a W2W spin
   * This should be called in background after getOutcomeW2W returns
   * Returns the actual payout from contract for validation
   * 
   * @param betKey Bet key for the spin
   * @param claimBlock Block number where outcome can be claimed
   * @param calculatedPayout The payout calculated by getOutcomeW2W (for validation)
   * @returns Actual payout amount from contract (for validation)
   */
  async claimSpinW2W(betKey: string, claimBlock: number, calculatedPayout?: number): Promise<number> {
    const log = logger.scope('VoiW2WAdapter:claimSpinW2W');
    log.info('executing claim transaction', { betKey, claimBlock, calculatedPayout });

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

      // Ensure claim block has been reached
      const status = await this.algodClient.statusAfterBlock(claimBlock).do();
      const currentRound = Number(status.lastRound);
      log.info('claim block status', { claimBlock, currentRound });

      // Execute claim transaction
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

      // Get payout from return value - claim() returns uint64 (payout amount)
      const payout = result.return || 0n;
      const payoutAmount = typeof payout === 'bigint' ? Number(payout) : (typeof payout === 'number' ? payout : 0);

      log.info('claim transaction completed', { payoutAmount });

      // Validate calculated payout against actual payout from contract
      if (calculatedPayout !== undefined) {
        const difference = Math.abs(payoutAmount - calculatedPayout);
        const tolerance = 1; // Allow 1 unit difference for rounding
        
        if (difference > tolerance) {
          log.warn('Payout mismatch detected', {
            calculated: calculatedPayout,
            actual: payoutAmount,
            difference
          });
        } else {
          log.info('Payout validation passed', {
            calculated: calculatedPayout,
            actual: payoutAmount
          });
        }
      }

      return payoutAmount;
    } catch (error) {
      log.error('claim transaction failed', error);
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
        token_app_id: globalState.tokenAppId?.asNumber() || 0,
        token_base_bet_cost: decodeBinaryStateNumber(globalState.tokenBaseBetCost),
        token_kicker_extra: decodeBinaryStateNumber(globalState.tokenKickerExtra),
        mode_enabled: globalState.modeEnabled?.asNumber() || 7, // Default: all enabled
      };
    } catch (error) {
      log.error('failed to get machine state', error);
      throw error;
    }
  }

  private createArc200ApproveTransaction(
    walletAddress: string,
    tokenAppId: number,
    spenderAddress: string,
    amount: number | bigint,
    suggestedParams: algosdk.SuggestedParams
  ): algosdk.Transaction {
    if (!tokenAppId) {
      throw new Error('ARC200 approve requested without token_app_id');
    }

    const approveComposer = new algosdk.AtomicTransactionComposer();
    approveComposer.addMethodCall({
      method: ARC200_APPROVE_METHOD,
      methodArgs: [spenderAddress, BigInt(amount)],
      sender: walletAddress,
      signer: async () => [],
      appID: tokenAppId,
      suggestedParams: {
        ...suggestedParams,
        fee: Math.max(Number(suggestedParams.fee || 1000), 1000),
      },
    });

    const approveGroup = approveComposer.buildGroup();
    if (approveGroup.length !== 1) {
      throw new Error('Failed to build ARC200 approve transaction');
    }

    return approveGroup[0].txn;
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
