/**
 * Slot Machine Engine
 *
 * Main API class for interacting with the slot machine.
 * This is the primary interface that third-party developers use.
 *
 * SVELTE VERSION: Adapted to use Svelte 5 stores instead of Zustand
 */

import { EventBus } from './EventBus';
import { gameStore } from './stores/gameStore.svelte';
import type {
  EngineConfig,
  GameState,
  SlotMachineConfig,
  SpinResult,
  SpinOutcome,
  BetKey,
  ValidationResult,
  GameError,
  QueuedSpin,
  SpinCompletedEvent,
  BalanceUpdatedEvent,
  SpinQueuedEvent,
  SpinSubmittedEvent,
  ErrorEvent,
} from './types';
import { GameEventType, SpinStatus } from './types';
import { validateBet, validateBalance } from './utils/validation';
import { getWinLevel } from './types/results';
import { logger } from '$lib/utils/logger';

/**
 * Spin parameters for 5reel games
 */
export interface SpinParams5Reel {
  betPerLine: number;
  paylines: number;
  walletAddress: string;
}

/**
 * Spin parameters for W2W games
 */
export interface SpinParamsW2W {
  betAmount: number;
  index: number;
  mode: number; // 0=bonus, 1=credit (free-play), 2=VOI, 4=ARC200
  reserved?: number;
  walletAddress: string;
}

/**
 * Blockchain adapter interface
 * Implemented by VoiSlotMachineAdapter or MockSlotMachineAdapter
 * Supports both 5reel and W2W game types
 */
export interface BlockchainAdapter {
  initialize(): Promise<void>;
  // 5reel format
  submitSpin(betPerLine: number, paylines: number, walletAddress: string): Promise<BetKey>;
  // W2W format (overload - adapters can implement either or both)
  submitSpinW2W?(betAmount: number, index: number, mode: number, walletAddress: string): Promise<BetKey>;
  // 5reel format
  claimSpin(betKey: string, claimBlock: number, betPerLine: number, paylines: number): Promise<SpinOutcome>;
  // W2W format - get outcome (grid + calculated payouts) without claiming
  getOutcomeW2W?(betKey: string, claimBlock: number, spinIndex: number, mode: number): Promise<SpinOutcome>;
  // W2W format - execute claim transaction (returns actual payout for validation)
  claimSpinW2W?(betKey: string, claimBlock: number, calculatedPayout?: number): Promise<number>;
  // 5reel format
  calculateOutcomeFromBlockSeed(betKey: string, claimBlock: number, betPerLine: number, paylines: number): Promise<SpinOutcome>;
  getBalance(address: string): Promise<number>;
  getCurrentBlock(): Promise<number>;
  getContractConfig(): Promise<SlotMachineConfig>;
  // W2W-specific methods
  getUserData?(address: string): Promise<{ credits: number; bonusSpins: number }>;
  getMachineState?(): Promise<any>;
  isInitialized(): boolean;
  destroy(): void;
}

/**
 * Main Slot Machine Engine
 */
export class SlotMachineEngine {
  private config: EngineConfig;
  private adapter: BlockchainAdapter;
  private eventBus: EventBus;
  private store: typeof gameStore;
  private initialized: boolean = false;
  private slotConfig: SlotMachineConfig | null = null;
  private walletAddress: string | null = null;
  private processingQueue: Set<string> = new Set();
  private balancePollTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: EngineConfig, adapter?: BlockchainAdapter) {
    this.config = config;
    this.eventBus = new EventBus();
    this.store = gameStore;

    // Use provided adapter or create based on config
    if (adapter) {
      this.adapter = adapter;
    } else if (config.sandbox) {
      // Lazy load mock adapter
      throw new Error('Mock adapter must be provided for sandbox mode');
    } else {
      // Lazy load Voi adapter
      throw new Error('Voi adapter must be provided for production mode');
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the engine
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize blockchain adapter
      await this.adapter.initialize();

      // Load slot machine configuration
      this.slotConfig = await this.adapter.getContractConfig();

      // Get wallet address (from adapter or config)
      this.walletAddress = this.config.walletAddress || await this.getWalletAddress();

      if (!this.walletAddress) {
        throw new Error('No wallet address available');
      }

      // Load initial balance
      const balance = await this.adapter.getBalance(this.walletAddress);
      this.store.setBalance(balance);

      this.initialized = true;

      // Emit initialized event
      this.eventBus.emit({
        type: GameEventType.GAME_INITIALIZED,
        timestamp: Date.now(),
        payload: {
          contractId: BigInt(this.slotConfig.contractId),
          chain: 'voi',
        },
      });

      // Start balance polling (every 5 seconds)
      this.startBalancePolling();
    } catch (error) {
      const gameError = this.createError(
        'NOT_INITIALIZED',
        error instanceof Error ? error.message : 'Initialization failed',
        false
      );
      this.emitError(gameError);
      throw gameError;
    }
  }

  /**
   * Get wallet address from adapter or throw
   */
  private async getWalletAddress(): Promise<string> {
    // In production, this would get address from wallet provider
    // For now, throw if not provided in config
    if (!this.config.walletAddress) {
      throw new Error('Wallet address must be provided in config or via wallet provider');
    }
    return this.config.walletAddress;
  }

  /**
   * Start polling for balance updates
   */
  private startBalancePolling(): void {
    if (!this.walletAddress) return;

    // Ensure previous timer is cleared before starting a new loop
    if (this.balancePollTimeout) {
      clearTimeout(this.balancePollTimeout);
      this.balancePollTimeout = null;
    }

    const poll = async () => {
      try {
        const balance = await this.adapter.getBalance(this.walletAddress!);
        const previousBalance = this.store.balance;

        if (balance !== previousBalance) {
          this.store.setBalance(balance);

          this.eventBus.emit({
            type: GameEventType.BALANCE_UPDATED,
            timestamp: Date.now(),
            payload: {
              balance: {
                current: balance,
                reserved: this.store.reservedBalance,
                available: balance - this.store.reservedBalance,
                lastUpdated: Date.now(),
              },
              previousBalance,
              change: balance - previousBalance,
            },
          });
        }
      } catch (error) {
        console.error('Balance polling error:', error);
      }

      // Schedule next poll and keep the handle so we can cancel on destroy
      this.balancePollTimeout = setTimeout(poll, 30000);
    };

    poll();
  }

  // ============================================================================
  // SPIN METHODS
  // ============================================================================

  /**
   * Check if adapter supports W2W format
   */
  private isW2WAdapter(): boolean {
    return typeof (this.adapter as any).submitSpinW2W === 'function';
  }

  /**
   * Place a spin (5reel format)
   */
  async spin(betAmount: number, paylines: number): Promise<string> {
    this.ensureInitialized();

    // Check if this is a W2W adapter - if so, throw error
    if (this.isW2WAdapter()) {
      throw new Error('Use spinW2W() method for W2W games');
    }

    // Generate spin ID
    const spinId = this.generateSpinId();

    try {
      // Validate bet
      const betValidation = this.validateBetConfig(betAmount, paylines);
      if (!betValidation.isValid) {
        throw new Error(betValidation.errors[0]);
      }

      // Validate balance
      const balanceValidation = validateBalance(
        betAmount,
        paylines,
        this.store.balance,
        this.store.reservedBalance
      );
      if (!balanceValidation.isValid) {
        throw new Error(balanceValidation.errors[0]);
      }

      // Create queued spin
      const queuedSpin: QueuedSpin = {
        id: spinId,
        status: SpinStatus.PENDING,
        betPerLine: betAmount,
        paylines,
        totalBet: betAmount * paylines,
        timestamp: Date.now(),
        gameType: '5reel',
      };

      // Add to queue
      this.store.addSpin(queuedSpin);

      // Update current bet
      this.store.setBet(betAmount, paylines);

      // Set spinning state
      this.store.setSpinning(true, spinId);
      this.store.setWaitingForOutcome(true);

      // Emit spin start event
      this.eventBus.emit({
        type: GameEventType.SPIN_QUEUED,
        timestamp: Date.now(),
        payload: { spin: queuedSpin },
      });

      // Process spin asynchronously
      this.processSpin(spinId);

      return spinId;
    } catch (error) {
      // Clean up on error
      this.store.setSpinning(false);
      this.store.setWaitingForOutcome(false);

      const gameError = this.createError(
        'INVALID_BET',
        error instanceof Error ? error.message : 'Spin failed',
        true
      );
      this.emitError(gameError);
      throw gameError;
    }
  }

  /**
   * Place a W2W spin
   */
  async spinW2W(betAmount: number, index: number, mode: number): Promise<string> {
    this.ensureInitialized();

    // Check if this is a W2W adapter
    if (!this.isW2WAdapter()) {
      throw new Error('spinW2W() requires a W2W adapter. Use spin() for 5reel games.');
    }

    // Generate spin ID
    const spinId = this.generateSpinId();

    try {
      // betAmount is already in microAlgos (converted by GameBridge or caller)
      // DO NOT multiply - it's already in the correct units
      const betAmountMicroAlgos = betAmount;
      
      console.log('[SlotMachineEngine:spinW2W] Starting spin', { betAmount, betAmountMicroAlgos, index, mode, walletAddress: this.walletAddress });
      
      // Validate mode
      if (![0, 1, 2, 4].includes(mode)) {
        throw new Error('Invalid mode. Must be 0 (bonus), 1 (credit/free-play), 2 (VOI), or 4 (ARC200)');
      }

      console.log('[SlotMachineEngine:spinW2W] Mode validated', { mode });

      // Check user data for credit/bonus modes ONLY
      // IMPORTANT: Only check getUserData for mode 0 (bonus) or mode 1 (credit)
      // DO NOT check for mode 2 (VOI) or mode 4 (ARC200)
      if (mode === 0 || mode === 1) {
        console.log('[SlotMachineEngine:spinW2W] Checking user data for mode', { mode });
        if (this.adapter.getUserData) {
          const userData = await this.adapter.getUserData(this.walletAddress!);
          console.log('[SlotMachineEngine:spinW2W] User data retrieved', { credits: userData.credits, bonusSpins: userData.bonusSpins, mode });
          
          if (mode === 0) {
            // Bonus spin mode - check bonus spins
            if (userData.bonusSpins < 1) {
              console.error('[SlotMachineEngine:spinW2W] Insufficient bonus spins', { bonusSpins: userData.bonusSpins });
              throw new Error('Insufficient bonus spins');
            }
          } else if (mode === 1) {
            // Credit mode - check credits
            // Credits are stored in microAlgos, same as betAmountMicroAlgos
            if (userData.credits < betAmountMicroAlgos) {
              console.error('[SlotMachineEngine:spinW2W] Insufficient credits', { credits: userData.credits, betAmountMicroAlgos });
              throw new Error('Insufficient credits');
            }
          }
        } else {
          console.warn('[SlotMachineEngine:spinW2W] getUserData not available on adapter');
        }
      } else {
        console.log('[SlotMachineEngine:spinW2W] Skipping user data check for mode', { mode });
      }

      // Validate balance for VOI/ARC200 modes (NOT credit mode)
      if (mode === 2 || mode === 4) {
        console.log('[SlotMachineEngine:spinW2W] Checking balance for VOI/ARC200 mode', { mode });
        const balance = await this.adapter.getBalance(this.walletAddress!);
        const spinCost = 50_500; // Default spin cost
        const totalCost = betAmountMicroAlgos + spinCost;
        
        console.log('[SlotMachineEngine:spinW2W] Balance check', { balance, betAmountMicroAlgos, spinCost, totalCost });
        
        if (balance < totalCost) {
          console.error('[SlotMachineEngine:spinW2W] Insufficient balance', { balance, totalCost });
          throw new Error('Insufficient balance');
        }
      }

      // Create queued spin (store in microAlgos)
      const queuedSpin: QueuedSpin = {
        id: spinId,
        status: SpinStatus.PENDING,
        betAmount: betAmountMicroAlgos,
        index,
        mode,
        totalBet: betAmountMicroAlgos,
        timestamp: Date.now(),
        gameType: 'w2w',
      };

      // Add to queue
      this.store.addSpin(queuedSpin);

      // Update current bet (W2W format) - store in microAlgos
      this.store.setBetW2W(betAmountMicroAlgos, mode, index);

      // Set spinning state
      this.store.setSpinning(true, spinId);
      this.store.setWaitingForOutcome(true);

      // Emit spin start event
      this.eventBus.emit({
        type: GameEventType.SPIN_QUEUED,
        timestamp: Date.now(),
        payload: { spin: queuedSpin },
      });

      // Process spin asynchronously
      this.processSpin(spinId);

      return spinId;
    } catch (error) {
      // Clean up on error
      this.store.setSpinning(false);
      this.store.setWaitingForOutcome(false);

      const gameError = this.createError(
        'INVALID_BET',
        error instanceof Error ? error.message : 'Spin failed',
        true
      );
      this.emitError(gameError);
      throw gameError;
    }
  }

  /**
   * Place a bet (alias for spin method)
   * This provides a more intuitive API name for placing bets
   */
  async placeBet(betPerLine: number, paylines: number): Promise<string> {
    return this.spin(betPerLine, paylines);
  }

  /**
   * Process a spin through its lifecycle
   */
  private async processSpin(spinId: string): Promise<void> {
    if (this.processingQueue.has(spinId)) {
      return; // Already processing
    }

    this.processingQueue.add(spinId);

    try {
      const spin = this.getSpinFromQueue(spinId);
      if (!spin) {
        throw new Error('Spin not found in queue');
      }

      // Step 1: Submit spin transaction
      await this.submitSpinTransaction(spin);

      // Step 2: Wait for block confirmation and claim
      await this.waitAndClaimOutcome(spin);

      // Step 3: Process and emit outcome
      await this.processOutcome(spin);
    } catch (error) {
      console.error(`Error processing spin ${spinId}:`, error);

      // Mark spin as failed
      this.store.updateSpin(spinId, {
        status: SpinStatus.FAILED,
        error: error instanceof Error ? error.message : 'Processing failed',
      });

      // Emit failure event
      this.eventBus.emit({
        type: GameEventType.SPIN_FAILED,
        timestamp: Date.now(),
        payload: {
          spinId,
          error: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        },
      });

      // Stop spinning state only if no other spins are pending
      const pendingSpins = this.store.spinQueue.filter(
        (s) =>
          s.id !== spinId &&
          s.status !== SpinStatus.COMPLETED &&
          s.status !== SpinStatus.FAILED &&
          s.status !== SpinStatus.EXPIRED
      );
      
      if (pendingSpins.length === 0) {
        this.store.setSpinning(false);
        this.store.setWaitingForOutcome(false);
      }
    } finally {
      this.processingQueue.delete(spinId);
    }
  }

  /**
   * Submit spin transaction to blockchain
   */
  private async submitSpinTransaction(spin: QueuedSpin): Promise<void> {
    // Update status
    this.store.updateSpin(spin.id, { status: SpinStatus.SUBMITTING });

    try {
      let betKey: BetKey;

      // Handle W2W format
      if (spin.gameType === 'w2w' && this.isW2WAdapter() && spin.betAmount !== undefined && spin.index !== undefined && spin.mode !== undefined) {
        const w2wAdapter = this.adapter as any;
        betKey = await w2wAdapter.submitSpinW2W(
          spin.betAmount,
          spin.index,
          spin.mode,
          this.walletAddress!
        );
      } 
      // Handle 5reel format
      else if (spin.betPerLine !== undefined && spin.paylines !== undefined) {
        betKey = await this.adapter.submitSpin(
          spin.betPerLine,
          spin.paylines,
          this.walletAddress!
        );
      } else {
        throw new Error('Invalid spin format - missing required parameters');
      }

      // Update spin with bet key (store and local copy)
      const betKeyData = {
        status: SpinStatus.WAITING,
        betKey: betKey.key || betKey.betKey,
        spinTxId: betKey.txId,
        submitBlock: betKey.submitBlock,
        claimBlock: betKey.claimBlock,
        spinIndex: betKey.spinIndex,
      } as const;

      this.store.updateSpin(spin.id, betKeyData);
      Object.assign(spin, betKeyData);

      // Emit submitted event
      const betKeyValue = betKey.key || betKey.betKey || '';
      this.eventBus.emit({
        type: GameEventType.SPIN_SUBMITTED,
        timestamp: Date.now(),
        payload: {
          spinId: spin.id,
          txId: betKey.txId,
          betKey: betKeyValue,
          submitBlock: betKey.submitBlock,
          claimBlock: betKey.claimBlock,
        },
      });
    } catch (error) {
      throw new Error(`Transaction submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Wait for claim block and claim outcome
   */
  private async waitAndClaimOutcome(spin: QueuedSpin): Promise<void> {
    if (!spin.claimBlock || !spin.betKey) {
      throw new Error('Spin missing claim data');
    }

    // Wait for claim block
    await this.waitForBlock(spin.claimBlock);

    // Update status
    this.store.updateSpin(spin.id, { status: SpinStatus.CLAIMING });

    let outcome: SpinOutcome;

    // Handle W2W format - get outcome immediately, claim in background
    if (spin.gameType === 'w2w' && this.isW2WAdapter()) {
      const w2wAdapter = this.adapter as any;
      
      // Check for required methods
      if (!w2wAdapter.getOutcomeW2W) {
        throw new Error('W2W adapter missing getOutcomeW2W method');
      }
      if (!w2wAdapter.claimSpinW2W) {
        throw new Error('W2W adapter missing claimSpinW2W method');
      }
      
      // Validate required parameters
      // IMPORTANT: We must use spin.spinIndex (which is spin_count - 1 from global state delta)
      // NOT spin.index (which is the user-provided index parameter)
      // The contract's Bet.spin_index field stores self.spin_count, which is what we need for grid retrieval
      if (!spin.spinIndex && spin.spinIndex !== 0) {
        throw new Error('W2W spin missing spinIndex (spin_count from global state) - cannot retrieve grid');
      }
      if (spin.mode === undefined) {
        throw new Error('W2W spin missing mode - cannot calculate payout');
      }
      
      // Get outcome immediately (grid + calculated payouts)
      // This is fast and returns before claim transaction completes
      // Uses spin.spinIndex which is the spin_count value from contract's global state
      let calculatedPayout = 0;
      console.log('spin', spin);
      try {
        outcome = await w2wAdapter.getOutcomeW2W(
          spin.betKey,
          spin.claimBlock,
          spin.spinIndex, // This is spin_count - 1 from global state delta, required for getCdfGridFromSeedAndSpin
          spin.mode
        );
        calculatedPayout = outcome.totalPayout;
      } catch (outcomeError) {
        // If outcome retrieval fails, we still need to claim
        // Create a minimal outcome for now, claim will provide actual data
        const log = logger.scope('SlotMachineEngine:waitAndClaimOutcome');
        log.warn('failed to get outcome, will still claim', { spinId: spin.id, error: outcomeError });
        outcome = {
          grid: [],
          waysWins: [],
          totalPayout: 0,
          blockNumber: spin.claimBlock,
          blockSeed: '',
          betKey: spin.betKey,
          verified: false
        };
      }
      
      // Always execute claim transaction in background (regardless of win/loss)
      // This is required to:
      // - Transfer funds if there's a payout (even if 0)
      // - Update bonus spins on contract (if bonus was triggered)
      // - Clean up the bet from contract storage
      // - Update user's bonus spin balance
      w2wAdapter.claimSpinW2W(spin.betKey, spin.claimBlock, calculatedPayout)
        .then((actualPayout: number) => {
          // Update outcome as verified after claim completes
          const log = logger.scope('SlotMachineEngine:waitAndClaimOutcome');
          log.info('background claim completed', {
            spinId: spin.id,
            calculatedPayout,
            actualPayout
          });
          
          // Update outcome to verified and use actual payout if outcome was incomplete
          if (outcome) {
            outcome.verified = true;
            // If we had a failed outcome retrieval, update with actual payout
            if (outcome.totalPayout === 0 && actualPayout > 0) {
              outcome.totalPayout = actualPayout;
            }
            this.store.updateSpin(spin.id, { outcome });
          }
        })
        .catch((error: Error) => {
          const log = logger.scope('SlotMachineEngine:waitAndClaimOutcome');
          log.error('background claim failed', { spinId: spin.id, error });
          // Don't fail the spin - outcome is already shown to user
          // Just log the error for debugging
        });
    }
    // Handle 5reel format
    else if (spin.betPerLine !== undefined && spin.paylines !== undefined) {
      outcome = await this.adapter.calculateOutcomeFromBlockSeed(
        spin.betKey,
        spin.claimBlock,
        spin.betPerLine,
        spin.paylines
      );
    } else {
      throw new Error('Invalid spin format - missing required parameters');
    }

    // Update spin with outcome (store and local copy)
    const outcomeData = {
      status: SpinStatus.COMPLETED,
      outcome,
      winnings: outcome.totalPayout,
    } as const;

    this.store.updateSpin(spin.id, outcomeData);
    Object.assign(spin, outcomeData);
  }

  /**
   * Process outcome and emit result
   */
  private async processOutcome(spin: QueuedSpin): Promise<void> {
    if (!spin.outcome) {
      throw new Error('Spin missing outcome');
    }

    const outcome = spin.outcome;

    // Update visible grid
    this.store.setVisibleGrid(outcome.grid);

    // Create spin result (supports both formats)
    const result: SpinResult = {
      id: spin.id,
      outcome,
      betPerLine: spin.betPerLine,
      paylines: spin.paylines,
      betAmount: spin.betAmount,
      mode: spin.mode,
      totalBet: spin.totalBet,
      winnings: outcome.totalPayout,
      netProfit: outcome.totalPayout - spin.totalBet,
      winLevel: getWinLevel(outcome.totalPayout, spin.totalBet, outcome.jackpotHit),
      isWin: outcome.totalPayout > 0,
      timestamp: Date.now(),
      spinTxId: spin.spinTxId || '',
      claimTxId: spin.claimTxId || '',
    };

    // Stop spinning state only if no other spins are pending
    // With queue system, we keep spinning state active if there are pending spins
    const pendingSpins = this.store.spinQueue.filter(
      (s) =>
        s.id !== spin.id &&
        s.status !== SpinStatus.COMPLETED &&
        s.status !== SpinStatus.FAILED &&
        s.status !== SpinStatus.EXPIRED
    );
    
    // Only clear spinning state if no other spins are pending
    if (pendingSpins.length === 0) {
      this.store.setSpinning(false);
      this.store.setWaitingForOutcome(false);
    }

    // Emit completed event
    this.eventBus.emit({
      type: GameEventType.SPIN_COMPLETED,
      timestamp: Date.now(),
      payload: { result },
    });

    // Emit win event if applicable
    if (result.isWin) {
      const winEventType =
        result.winLevel === 'jackpot'
          ? GameEventType.WIN_JACKPOT
          : result.winLevel === 'large'
          ? GameEventType.WIN_LARGE
          : result.winLevel === 'medium'
          ? GameEventType.WIN_MEDIUM
          : GameEventType.WIN_SMALL;

      this.eventBus.emit({
        type: winEventType,
        timestamp: Date.now(),
        payload: {
          result,
          winAmount: result.winnings,
          multiplier: result.winnings / result.totalBet,
        },
      });
    }

    // Update balance (will be picked up by polling, but update immediately)
    const newBalance = await this.adapter.getBalance(this.walletAddress!);
    this.store.setBalance(newBalance);
  }

  /**
   * Attempt to verify claim on-chain without blocking the UI
   */
  private async attemptClaimInBackground(spin: QueuedSpin, isWin: boolean): Promise<void> {
    if (!spin.claimBlock || !spin.betKey) return;

    try {
      // Ensure we are PAST the claim block before attempting on-chain claim
      // Contract/SDK may require the claim round seed to be finalized and indexable
      while (true) {
        const current = await this.adapter.getCurrentBlock();
        if (current > spin.claimBlock) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Small grace delay for indexer/rpc availability
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Handle W2W format
      // Note: This is an old code path - the new flow uses getOutcomeW2W + claimSpinW2W in waitAndClaimOutcome
      // This method may not be called anymore, but keeping for backward compatibility
      if (spin.gameType === 'w2w' && this.isW2WAdapter()) {
        const w2wAdapter = this.adapter as any;
        if (w2wAdapter.claimSpinW2W) {
          // claimSpinW2W now takes calculatedPayout, not spinIndex
          // If we don't have outcome yet, pass undefined
          await w2wAdapter.claimSpinW2W(spin.betKey, spin.claimBlock, undefined);
        }
      }
      // Handle 5reel format
      else if (spin.betPerLine !== undefined && spin.paylines !== undefined) {
        await this.adapter.claimSpin(
          spin.betKey,
          spin.claimBlock,
          spin.betPerLine,
          spin.paylines
        );
      }
    } catch {
      // Non-fatal: leave calculated outcome in place
    } finally {
      // If it was a win, schedule balance refresh 5 seconds after claim completes
      if (isWin) {
        setTimeout(async () => {
          try {
            const previousBalance = this.store.balance;
            const balance = await this.adapter.getBalance(this.walletAddress!);
            this.store.setBalance(balance);
            
            // Emit balance update event so GameBridge can send it via postMessage
            this.eventBus.emit({
              type: GameEventType.BALANCE_UPDATED,
              timestamp: Date.now(),
              payload: {
                balance: {
                  current: balance,
                  reserved: this.store.reservedBalance,
                  available: balance - this.store.reservedBalance,
                  lastUpdated: Date.now(),
                },
                previousBalance,
                change: balance - previousBalance,
              },
            });
          } catch (error) {
            console.error('Failed to refresh balance after claim:', error);
          }
        }, 5000);
      }
    }
  }

  /**
   * Wait for a specific block
   */
  private async waitForBlock(targetBlock: number): Promise<void> {
    while (true) {
      const currentBlock = await this.adapter.getCurrentBlock();

      if (currentBlock >= targetBlock) {
        return;
      }

      // Wait 1 second before checking again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // ============================================================================
  // STATE QUERIES
  // ============================================================================

  /**
   * Get current game state
   */
  getState(): GameState {
    const state = this.store;
    return {
      isSpinning: state.isSpinning,
      currentSpinId: state.currentSpinId,
      waitingForOutcome: state.waitingForOutcome,
      spinQueue: state.spinQueue,
      visibleGrid: state.visibleGrid,
      balance: state.balance,
      reservedBalance: state.reservedBalance,
      currentBet: state.currentBet,
      isAutoSpinning: state.isAutoSpinning,
      autoSpinCount: state.autoSpinCount,
      activePaylineHighlights: state.activePaylineHighlights,
      showingWinCelebration: state.showingWinCelebration,
      lastError: state.lastError,
    };
  }

  /**
   * Get slot machine configuration
   */
  getConfig(): SlotMachineConfig {
    this.ensureInitialized();
    if (!this.slotConfig) {
      throw new Error('Configuration not loaded');
    }
    return this.slotConfig;
  }

  /**
   * Get current balance
   */
  async getBalance(): Promise<number> {
    this.ensureInitialized();
    const balance = await this.adapter.getBalance(this.walletAddress!);
    this.store.setBalance(balance);
    return balance;
  }

  /**
   * Get pending spins
   */
  getPendingSpins(): QueuedSpin[] {
    const state = this.store;
    return state.spinQueue.filter(
      (spin) =>
        spin.status === SpinStatus.SUBMITTING ||
        spin.status === SpinStatus.WAITING ||
        spin.status === SpinStatus.CLAIMING
    );
  }

  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================

  /**
   * Listen for spin outcomes
   */
  onOutcome(callback: (result: SpinResult) => void): () => void {
    return this.eventBus.on<SpinCompletedEvent>(GameEventType.SPIN_COMPLETED, (event) => {
      callback(event.payload.result);
    });
  }

  /**
   * Listen for balance updates
   */
  onBalanceUpdate(callback: (balance: number, previous: number) => void): () => void {
    return this.eventBus.on<BalanceUpdatedEvent>(GameEventType.BALANCE_UPDATED, (event) => {
      callback(event.payload.balance.current, event.payload.previousBalance);
    });
  }

  /**
   * Listen for spin start
   */
  onSpinStart(
    callback: (
      spinId: string,
      bet: { betPerLine: number; paylines: number; totalBet: number }
    ) => void
  ): () => void {
    return this.eventBus.on<SpinQueuedEvent>(GameEventType.SPIN_QUEUED, (event) => {
      const spin = event.payload.spin;
      callback(spin.id, {
        betPerLine: spin.betPerLine || 0,
        paylines: spin.paylines || 0,
        totalBet: spin.totalBet,
      });
    });
  }

  /**
   * Listen for spin submitted
   */
  onSpinSubmitted(callback: (spinId: string, txId: string) => void): () => void {
    return this.eventBus.on<SpinSubmittedEvent>(GameEventType.SPIN_SUBMITTED, (event) => {
      callback(event.payload.spinId, event.payload.txId);
    });
  }

  /**
   * Listen for errors
   */
  onError(callback: (error: GameError) => void): () => void {
    return this.eventBus.on<ErrorEvent>(GameEventType.ERROR_OCCURRED, (event) => {
      callback(event.payload.error);
    });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Reset engine to initial state
   */
  reset(): void {
    this.store.reset();
    this.processingQueue.clear();
  }

  /**
   * Cleanup timers and resources
   */
  destroy(): void {
    if (this.balancePollTimeout) {
      clearTimeout(this.balancePollTimeout);
      this.balancePollTimeout = null;
    }
    this.initialized = false;
  }

  /**
   * Validate bet configuration
   */
  private validateBetConfig(betAmount: number, paylines: number): ValidationResult {
    if (!this.slotConfig) {
      return {
        isValid: false,
        errors: ['Configuration not loaded'],
        warnings: [],
      };
    }

    return validateBet(betAmount, paylines, this.slotConfig);
  }

  /**
   * Get spin from queue
   */
  private getSpinFromQueue(spinId: string): QueuedSpin | null {
    return this.store.spinQueue.find((s) => s.id === spinId) || null;
  }

  /**
   * Generate unique spin ID
   */
  private generateSpinId(): string {
    return `spin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Ensure engine is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }
  }

  /**
   * Create game error
   */
  private createError(
    code: GameError['code'],
    message: string,
    recoverable: boolean
  ): GameError {
    return {
      code,
      message,
      recoverable,
    };
  }

  /**
   * Emit error event
   */
  private emitError(error: GameError): void {
    this.store.setError(error.message);

    this.eventBus.emit({
      type: GameEventType.ERROR_OCCURRED,
      timestamp: Date.now(),
      payload: { error },
    });
  }
}
