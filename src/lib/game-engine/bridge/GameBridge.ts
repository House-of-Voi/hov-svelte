/**
 * Game Bridge
 * 
 * Manages postMessage communication between third-party games and the SlotMachineEngine.
 * Handles all blockchain operations internally - games never have wallet access.
 */

import { SlotMachineEngine } from '../SlotMachineEngine';
import { VoiSlotMachineAdapter, type WalletSigner } from '../adapters/VoiSlotMachineAdapter';
import type { SpinResult, GameError } from '../types';
import type {
  GameRequest,
  GameResponse,
  SpinRequest,
  OutcomeMessage,
  BalanceUpdateMessage,
  ErrorMessage,
  ConfigMessage,
  BalanceResponse,
  SpinSubmittedMessage,
} from './types';
import { isGameRequest, isSpinRequest } from './types';

export interface GameBridgeConfig {
  contractId: bigint;
  walletAddress: string;
  walletSigner: WalletSigner;
  targetOrigin?: string; // Optional origin validation for postMessage
}

/**
 * Game Bridge - Manages communication between games and blockchain
 */
export class GameBridge {
  private config: GameBridgeConfig;
  private engine: SlotMachineEngine | null = null;
  private adapter: VoiSlotMachineAdapter | null = null;
  private initialized: boolean = false;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private spinRequestCount: number = 0;
  private lastSpinTime: number = 0;
  private readonly RATE_LIMIT_MS = 1000; // Minimum 1 second between spins

  constructor(config: GameBridgeConfig) {
    this.config = config;
  }

  /**
   * Initialize the bridge and engine
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Create Voi adapter with wallet signer
      this.adapter = new VoiSlotMachineAdapter({
        contractId: this.config.contractId,
        network: 'mainnet',
        walletSigner: this.config.walletSigner,
      });

      // Create engine
      this.engine = new SlotMachineEngine(
        { walletAddress: this.config.walletAddress },
        this.adapter
      );

      // Set up event listeners
      this.setupEngineListeners();

      // Initialize engine
      await this.engine.initialize();

      // Set up postMessage listener
      this.setupMessageListener();

      this.initialized = true;

      // Send initial balance and config
      await this.sendInitialState();
    } catch (error) {
      console.error('Failed to initialize GameBridge:', error);
      this.sendError({
        code: 'INIT_FAILED',
        message: error instanceof Error ? error.message : 'Initialization failed',
        recoverable: false,
      });
      throw error;
    }
  }

  /**
   * Set up engine event listeners and convert to postMessage
   */
  private setupEngineListeners(): void {
    if (!this.engine) return;

    // Listen for outcomes
    this.engine.onOutcome((result: SpinResult) => {
      this.sendOutcome(result).catch((error) => {
        console.error('Failed to send outcome:', error);
      });
    });

    // Listen for balance updates
    this.engine.onBalanceUpdate((balance: number, previous: number) => {
      const state = this.engine!.getState();
      // Calculate available balance: total balance minus reserved for pending spins
      const availableBalance = Math.max(0, balance - state.reservedBalance);
      this.sendToGame({
        type: 'BALANCE_UPDATE',
        payload: {
          balance,
          availableBalance,
        },
      } as BalanceUpdateMessage);
    });

    // Listen for spin submitted
    this.engine.onSpinSubmitted((spinId: string, txId: string) => {
      this.sendToGame({
        type: 'SPIN_SUBMITTED',
        payload: {
          spinId,
          txId,
        },
      } as SpinSubmittedMessage);
    });

    // Listen for errors
    this.engine.onError((error: GameError) => {
      this.sendError(error);
    });
  }

  /**
   * Set up postMessage listener for incoming messages
   */
  private setupMessageListener(): void {
    this.messageHandler = (event: MessageEvent) => {
      // Optional origin validation
      if (this.config.targetOrigin && event.origin !== this.config.targetOrigin) {
        console.warn('Rejected message from unauthorized origin:', event.origin);
        return;
      }

      this.handleMessage(event);
    };

    window.addEventListener('message', this.messageHandler);
  }

  /**
   * Handle incoming postMessage
   */
  private async handleMessage(event: MessageEvent): Promise<void> {
    try {
      // Optional origin validation
      if (this.config.targetOrigin && event.origin !== this.config.targetOrigin) {
        console.warn('Rejected message from unauthorized origin:', event.origin);
        this.sendError({
          code: 'UNAUTHORIZED_ORIGIN',
          message: 'Message from unauthorized origin',
          recoverable: false,
        });
        return;
      }

      const message = event.data;

      // Validate message structure
      if (!isGameRequest(message)) {
        console.warn('Invalid message format:', message);
        this.sendError({
          code: 'INVALID_MESSAGE',
          message: 'Invalid message format',
          recoverable: true,
        });
        return;
      }

      switch (message.type) {
        case 'INIT':
          await this.handleInit(message);
          break;
        case 'SPIN_REQUEST':
          await this.handleSpinRequest(message);
          break;
        case 'GET_BALANCE':
          await this.handleGetBalance();
          break;
        case 'GET_CONFIG':
          await this.handleGetConfig();
          break;
        default:
          console.warn('Unknown message type:', message);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.sendError({
        code: 'MESSAGE_HANDLER_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        recoverable: true,
      });
    }
  }

  /**
   * Handle INIT request
   */
  private async handleInit(message: any): Promise<void> {
    // Already initialized, just send current state
    if (this.initialized) {
      await this.sendInitialState();
    } else {
      // If not initialized, try to initialize
      await this.initialize();
    }
  }

  /**
   * Handle SPIN_REQUEST
   */
  private async handleSpinRequest(message: unknown): Promise<void> {
    if (!this.engine || !this.initialized) {
      this.sendError({
        code: 'NOT_INITIALIZED',
        message: 'Game bridge not initialized',
        recoverable: false,
      });
      return;
    }

    // Validate message structure
    if (!isSpinRequest(message)) {
      this.sendError({
        code: 'INVALID_REQUEST',
        message: 'Invalid spin request format',
        recoverable: true,
      });
      return;
    }

    // Rate limiting
    const now = Date.now();
    if (now - this.lastSpinTime < this.RATE_LIMIT_MS) {
      this.sendError({
        code: 'RATE_LIMIT',
        message: 'Please wait before spinning again',
        recoverable: true,
      });
      return;
    }

    // Validate request
    const validation = this.validateSpinRequest(message);
    if (!validation.valid) {
      this.sendError({
        code: 'INVALID_REQUEST',
        message: validation.error || 'Invalid spin request',
        recoverable: true,
      });
      return;
    }

    const { paylines, betPerLine } = message.payload;

    // Check balance
    const state = this.engine.getState();
    const totalBet = betPerLine * paylines;
    const availableBalance = Math.max(0, state.balance - state.reservedBalance);
    if (availableBalance < totalBet) {
      this.sendError({
        code: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient balance for this bet',
        recoverable: true,
      });
      return;
    }

    // Check if already spinning
    if (state.isSpinning) {
      this.sendError({
        code: 'ALREADY_SPINNING',
        message: 'A spin is already in progress',
        recoverable: true,
      });
      return;
    }

    try {
      this.lastSpinTime = now;
      this.spinRequestCount++;

      // Place spin
      const spinId = await this.engine.spin(betPerLine, paylines);
      
      // Outcome will be sent via onOutcome listener
    } catch (error) {
      console.error('Spin failed:', error);
      this.sendError({
        code: 'SPIN_FAILED',
        message: error instanceof Error ? error.message : 'Spin failed',
        recoverable: true,
      });
    }
  }

  /**
   * Handle GET_BALANCE request
   */
  private async handleGetBalance(): Promise<void> {
    if (!this.engine || !this.initialized) {
      this.sendError({
        code: 'NOT_INITIALIZED',
        message: 'Game bridge not initialized',
        recoverable: false,
      });
      return;
    }

    // Refresh balance from blockchain before sending
    try {
      const currentBalance = await this.engine.getBalance();
      const state = this.engine.getState();
      // Calculate available balance: total balance minus reserved for pending spins
      const availableBalance = Math.max(0, currentBalance - state.reservedBalance);
      
      this.sendToGame({
        type: 'BALANCE_RESPONSE',
        payload: {
          balance: currentBalance,
          availableBalance,
        },
      } as BalanceResponse);
    } catch (error) {
      console.error('Failed to get balance:', error);
      // Still send state balance even if refresh fails
      const state = this.engine.getState();
      const availableBalance = Math.max(0, (state.balance || 0) - state.reservedBalance);
      this.sendToGame({
        type: 'BALANCE_RESPONSE',
        payload: {
          balance: state.balance || 0,
          availableBalance,
        },
      } as BalanceResponse);
    }
  }

  /**
   * Handle GET_CONFIG request
   */
  private async handleGetConfig(): Promise<void> {
    if (!this.engine || !this.initialized) {
      this.sendError({
        code: 'NOT_INITIALIZED',
        message: 'Game bridge not initialized',
        recoverable: false,
      });
      return;
    }

    const config = this.engine.getConfig();
    this.sendToGame({
      type: 'CONFIG',
      payload: {
        contractId: config.contractId.toString(),
        minBet: config.minBet,
        maxBet: config.maxBet,
        maxPaylines: config.maxPaylines,
        rtpTarget: config.rtpTarget,
        houseEdge: config.houseEdge,
      },
    } as ConfigMessage);
  }

  /**
   * Send initial state (balance and config) to game
   */
  private async sendInitialState(): Promise<void> {
    if (!this.engine) return;

    // Send balance and config in parallel
    await Promise.all([
      this.handleGetBalance(),
      this.handleGetConfig()
    ]);
  }

  /**
   * Send outcome to game
   */
  private async sendOutcome(result: SpinResult): Promise<void> {
    // Ensure all data is serializable for postMessage
    // Deep clone arrays and objects to avoid DataCloneError
    const serializableGrid = result.outcome.grid.map((reel) => [...reel]);
    const serializableWinningLines = result.outcome.winningLines.map((line) => ({
      paylineIndex: line.paylineIndex,
      symbol: String(line.symbol), // Ensure string
      matchCount: Number(line.matchCount), // Ensure number
      payout: Number(line.payout), // Ensure number
    }));

    this.sendToGame({
      type: 'OUTCOME',
      payload: {
        spinId: String(result.id),
        grid: serializableGrid,
        winnings: Number(result.winnings),
        isWin: Boolean(result.isWin),
        winningLines: serializableWinningLines,
        winLevel: String(result.winLevel),
        betPerLine: Number(result.betPerLine),
        paylines: Number(result.paylines),
        totalBet: Number(result.totalBet),
      },
    } as OutcomeMessage);

    // Refresh and send balance update after outcome (especially important after wins)
    // The engine should trigger onBalanceUpdate, but we also refresh to ensure accuracy
    try {
      const currentBalance = await this.engine!.getBalance();
      const state = this.engine!.getState();
      const availableBalance = Math.max(0, currentBalance - state.reservedBalance);
      this.sendToGame({
        type: 'BALANCE_UPDATE',
        payload: {
          balance: currentBalance,
          availableBalance,
        },
      } as BalanceUpdateMessage);
    } catch (error) {
      console.error('Failed to refresh balance after outcome:', error);
      // Balance update will come via onBalanceUpdate listener if it triggers
    }
  }

  /**
   * Send error to game
   */
  private sendError(error: { code: string; message: string; recoverable: boolean; requestId?: string }): void {
    this.sendToGame({
      type: 'ERROR',
      payload: {
        code: error.code,
        message: error.message,
        recoverable: error.recoverable,
        requestId: error.requestId,
      },
    } as ErrorMessage);
  }

  /**
   * Send message to game (via postMessage to iframe)
   */
  private sendToGame(message: GameResponse): void {
    if (this.targetIframe && this.targetIframe.contentWindow) {
      // Send via postMessage to iframe
      try {
        this.targetIframe.contentWindow.postMessage(message, '*'); // Use targetOrigin in production
      } catch (error) {
        console.error('Failed to send message to iframe:', error);
      }
    } else {
      // Fallback: dispatch custom event if iframe not available
      window.dispatchEvent(
        new CustomEvent('gameBridgeMessage', {
          detail: message,
        })
      );
    }
  }

  /**
   * Validate spin request
   */
  private validateSpinRequest(message: SpinRequest): { valid: boolean; error?: string } {
    const { paylines, betPerLine } = message.payload;

    if (!this.engine) {
      return { valid: false, error: 'Engine not initialized' };
    }

    const config = this.engine.getConfig();

    // Validate paylines
    if (paylines < 1 || paylines > config.maxPaylines) {
      return {
        valid: false,
        error: `Paylines must be between 1 and ${config.maxPaylines}`,
      };
    }

    // Validate bet amount
    if (betPerLine < config.minBet || betPerLine > config.maxBet) {
      return {
        valid: false,
        error: `Bet per line must be between ${config.minBet / 1_000_000} and ${config.maxBet / 1_000_000} VOI`,
      };
    }

    return { valid: true };
  }

  private targetIframe: HTMLIFrameElement | null = null;

  /**
   * Get the target iframe element (set by container)
   */
  setTargetIframe(iframe: HTMLIFrameElement | null): void {
    this.targetIframe = iframe;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }

    this.initialized = false;
  }
}

