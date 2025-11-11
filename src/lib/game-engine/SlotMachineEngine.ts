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

/**
 * Blockchain adapter interface
 * Implemented by VoiSlotMachineAdapter or MockSlotMachineAdapter
 */
export interface BlockchainAdapter {
  initialize(): Promise<void>;
  submitSpin(betPerLine: number, paylines: number, walletAddress: string): Promise<BetKey>;
  claimSpin(betKey: string, claimBlock: number, betPerLine: number, paylines: number): Promise<SpinOutcome>;
  calculateOutcomeFromBlockSeed(betKey: string, claimBlock: number, betPerLine: number, paylines: number): Promise<SpinOutcome>;
  getBalance(address: string): Promise<number>;
  getCurrentBlock(): Promise<number>;
  getContractConfig(): Promise<SlotMachineConfig>;
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
   * Place a spin
   */
  async spin(betAmount: number, paylines: number): Promise<string> {
    this.ensureInitialized();

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

      // Stop spinning state
      this.store.setSpinning(false);
      this.store.setWaitingForOutcome(false);
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
      // Submit to blockchain
      const betKey = await this.adapter.submitSpin(
        spin.betPerLine,
        spin.paylines,
        this.walletAddress!
      );

      // Update spin with bet key (store and local copy)
      const betKeyData = {
        status: SpinStatus.WAITING,
        betKey: betKey.key,
        spinTxId: betKey.txId,
        submitBlock: betKey.submitBlock,
        claimBlock: betKey.claimBlock,
      } as const;

      this.store.updateSpin(spin.id, betKeyData);
      Object.assign(spin, betKeyData);

      // Emit submitted event
      this.eventBus.emit({
        type: GameEventType.SPIN_SUBMITTED,
        timestamp: Date.now(),
        payload: {
          spinId: spin.id,
          txId: betKey.txId,
          betKey: betKey.key,
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

    // Calculate outcome immediately from block seed for instant UX
    const outcome = await this.adapter.calculateOutcomeFromBlockSeed(
      spin.betKey,
      spin.claimBlock,
      spin.betPerLine,
      spin.paylines
    );

    // Update spin with calculated outcome (store and local copy)
    const outcomeData = {
      status: SpinStatus.COMPLETED,
      outcome,
      winnings: outcome.totalPayout,
    } as const;

    this.store.updateSpin(spin.id, outcomeData);
    Object.assign(spin, outcomeData);

    // Check if this is a win
    const isWin = outcome.totalPayout > 0;

    // Attempt contract claim in the background; if it verifies, we can later update
    this.attemptClaimInBackground(spin, isWin).catch(() => {
      // Claim failed, but that's okay - outcome already shown
    });
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

    // Create spin result
    const result: SpinResult = {
      id: spin.id,
      outcome,
      betPerLine: spin.betPerLine,
      paylines: spin.paylines,
      totalBet: spin.totalBet,
      winnings: outcome.totalPayout,
      netProfit: outcome.totalPayout - spin.totalBet,
      winLevel: getWinLevel(outcome.totalPayout, spin.totalBet),
      isWin: outcome.totalPayout > 0,
      timestamp: Date.now(),
      spinTxId: spin.spinTxId || '',
      claimTxId: spin.claimTxId || '',
    };

    // Stop spinning state
    this.store.setSpinning(false);
    this.store.setWaitingForOutcome(false);

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

      await this.adapter.claimSpin(
        spin.betKey,
        spin.claimBlock,
        spin.betPerLine,
        spin.paylines
      );
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
        betPerLine: spin.betPerLine,
        paylines: spin.paylines,
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
