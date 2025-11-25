/**
 * Game Bridge
 *
 * Manages postMessage communication between third-party games and the SlotMachineEngine.
 * Handles all blockchain operations internally - games never have wallet access.
 */

import { SlotMachineEngine } from '../SlotMachineEngine';
import type { BlockchainAdapter } from '../SlotMachineEngine';
import { AdapterFactory } from '../adapters/AdapterFactory';
import { gameConfigService } from '$lib/services/gameConfigService';
import type { WalletSigner } from '$lib/wallet/algokitTransactionSigner';
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
  CreditBalanceMessage,
  ExitRequest,
} from './types';
import { isGameRequest, isSpinRequest, MESSAGE_NAMESPACE } from './types';

export interface GameBridgeConfig {
  contractId: bigint;
  walletAddress: string;
  walletSigner: WalletSigner;
  targetOrigin?: string; // Optional origin validation for postMessage
  algodUrl?: string; // Optional Algod URL override
  algodToken?: string; // Optional Algod token override
  indexerUrl?: string; // Optional Indexer URL override
  network?: 'mainnet' | 'testnet' | 'betanet'; // Network selection
}

/**
 * Game Bridge - Manages communication between games and blockchain
 */
export class GameBridge {
  private config: GameBridgeConfig;
  private engine: SlotMachineEngine | null = null;
  private adapter: BlockchainAdapter | null = null;
  private adapterFactory: AdapterFactory;
  private initialized: boolean = false;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private spinRequestCount: number = 0;
  private lastSpinTime: number = 0;
  private currentMode: number = 2; // Track current mode: 1=credit, 2=VOI/network, 4=ARC200/token (default to VOI)

  constructor(config: GameBridgeConfig) {
    this.config = config;
    this.adapterFactory = new AdapterFactory({
      algodUrl: config.algodUrl,
      algodToken: config.algodToken,
      indexerUrl: config.indexerUrl,
      network: config.network || 'mainnet',
    });
  }

  /**
   * Initialize the bridge and engine
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      console.log('GameBridge: Starting initialization for contract:', this.config.contractId.toString());
      
      // Query game configuration from database
      console.log('GameBridge: Fetching game config from database...');
      const gameConfig = await gameConfigService.getConfigByContractId(this.config.contractId);

      if (!gameConfig) {
        const errorMsg = `No active game configuration found for contract ${this.config.contractId}`;
        console.error('GameBridge:', errorMsg);
        throw new Error(errorMsg);
      }

      if (!gameConfig.is_active) {
        const errorMsg = `Game configuration for contract ${this.config.contractId} is not active`;
        console.error('GameBridge:', errorMsg);
        throw new Error(errorMsg);
      }

      console.log('GameBridge: Initializing with game type:', gameConfig.game_type);

      // Create adapter using factory (automatically selects 5reel or w2w adapter)
      console.log('GameBridge: Creating adapter...');
      this.adapter = this.adapterFactory.createAdapter(gameConfig, this.config.walletSigner);
      console.log('GameBridge: Adapter created successfully');

      // Create engine
      console.log('GameBridge: Creating engine...');
      this.engine = new SlotMachineEngine(
        { walletAddress: this.config.walletAddress },
        this.adapter
      );
      console.log('GameBridge: Engine created successfully');

      // Set up event listeners
      console.log('GameBridge: Setting up event listeners...');
      this.setupEngineListeners();

      // Initialize engine
      console.log('GameBridge: Initializing engine...');
      await this.engine.initialize();
      console.log('GameBridge: Engine initialized successfully');

      // Set up postMessage listener
      console.log('GameBridge: Setting up postMessage listener...');
      this.setupMessageListener();

      this.initialized = true;
      console.log('GameBridge: Bridge initialized successfully');

      // Send initial balance and config
      console.log('GameBridge: Sending initial state...');
      await this.sendInitialState();
      console.log('GameBridge: Initial state sent');
    } catch (error) {
      console.error('GameBridge: Failed to initialize:', error);
      if (error instanceof Error) {
        console.error('GameBridge: Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
      }
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
      // Convert from microVOI (engine) to normalized VOI (game)
      const availableBalanceMicroVOI = Math.max(0, balance - state.reservedBalance);
      this.sendToGame({
        type: 'BALANCE_UPDATE',
        payload: {
          balance: balance / 1_000_000,
          availableBalance: availableBalanceMicroVOI / 1_000_000,
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

      // Filter messages by namespace (silently ignore non-matching messages)
      if (!message || typeof message !== 'object' || !('namespace' in message)) {
        console.debug('GameBridge: Ignoring message without namespace field');
        return;
      }

      if (message.namespace !== MESSAGE_NAMESPACE) {
        console.debug(
          `GameBridge: Ignoring message with non-matching namespace: "${message.namespace}" (expected "${MESSAGE_NAMESPACE}")`
        );
        return;
      }

      // Validate message structure - only process request messages
      if (!isGameRequest(message)) {
        // Not a request message - could be a response message we sent, just ignore it silently
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
        case 'GET_CREDIT_BALANCE':
          await this.handleGetCreditBalance();
          break;
        case 'GET_CONFIG':
          await this.handleGetConfig();
          break;
        case 'EXIT':
          this.handleExit();
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

    // Detect format (5reel or w2w)
    const is5ReelFormat = 'paylines' in message.payload && 'betPerLine' in message.payload;
    const isW2WFormat = 'betAmount' in message.payload && 'reserved' in message.payload;

    // Validate request based on format
    const validation = this.validateSpinRequest(message);
    if (!validation.valid) {
      this.sendError({
        code: 'INVALID_REQUEST',
        message: validation.error || 'Invalid spin request',
        recoverable: true,
      });
      return;
    }

    // Note: Rate limiting and ALREADY_SPINNING checks removed to allow rapid queueing
    // The engine's queue system will handle sequential processing

    try {
      const now = Date.now();
      this.lastSpinTime = now;
      this.spinRequestCount++;

      let spinId: string | undefined;
      let totalBet: number;

      // Handle W2W format
      if (isW2WFormat) {
        const { betAmount: betAmountVOI, mode: requestedMode, reserved, spinId: clientSpinId } = message.payload as { betAmount: number; mode?: number; reserved: number; spinId?: string };
        // Generate spin index (should be unique per user, but for now use timestamp)
        const index = Date.now() % 1000000;
        // Determine mode: use explicit mode if provided, otherwise derive from reserved
        // reserved: 1 = bonus (mode 0), 0 = regular spin (default to VOI mode 2 if mode not specified)
        let mode: number;
        if (requestedMode !== undefined) {
          // Use explicit mode from request
          mode = requestedMode;
        } else {
          // Backward compatibility: derive from reserved
          // reserved: 1 = bonus (mode 0), 0 = default to VOI (mode 2)
          mode = reserved === 1 ? 0 : 2; // Default to VOI mode instead of credit
        }
        
        // Track current mode (only for non-bonus modes)
        if (mode !== 0) {
          this.currentMode = mode;
        }

        // Convert betAmount from normalized VOI to microVOI for engine
        // Game sends normalized VOI (40), engine expects microVOI (40,000,000)
        const betAmountMicroAlgos = mode === 0 ? 0 : betAmountVOI * 1_000_000;

        // Validate bet amount (in VOI units for user-friendly validation)
        if (mode !== 0 && betAmountVOI !== 40 && betAmountVOI !== 60) {
          this.sendError({
            code: 'INVALID_BET',
            message: 'Bet amount must be 40 or 60 for W2W games',
            recoverable: true,
            requestId: clientSpinId,
          });
          return;
        }

        totalBet = betAmountMicroAlgos;
        spinId = await (this.engine as any).spinW2W(betAmountMicroAlgos, index, mode);
      }
      // Handle 5reel format
      else if (is5ReelFormat) {
        const { paylines, betPerLine } = message.payload as { paylines: number; betPerLine: number };
        // Convert betPerLine from normalized VOI to microVOI for engine
        const betPerLineMicroVOI = betPerLine * 1_000_000;
        totalBet = betPerLineMicroVOI * paylines;

        // Check balance (engine uses microVOI)
        const state = this.engine.getState();
        const availableBalance = Math.max(0, state.balance - state.reservedBalance);
        if (availableBalance < totalBet) {
          this.sendError({
            code: 'INSUFFICIENT_BALANCE',
            message: 'Insufficient balance for this bet',
            recoverable: true,
          });
          return;
        }

        spinId = await this.engine.spin(betPerLineMicroVOI, paylines);
      } else {
        this.sendError({
          code: 'INVALID_REQUEST',
          message: 'Invalid spin request format',
          recoverable: true,
        });
        return;
      }
      
      // Immediately send balance update reflecting the reserved balance
      // Convert from microVOI (engine) to normalized VOI (game)
      const state = this.engine.getState();
      const availableBalanceMicroVOI = Math.max(0, state.balance - state.reservedBalance);
      this.sendToGame({
        type: 'BALANCE_UPDATE',
        payload: {
          balance: state.balance / 1_000_000,
          availableBalance: availableBalanceMicroVOI / 1_000_000,
        },
      } as BalanceUpdateMessage);
      
      // Outcome will be sent via onOutcome listener
    } catch (error) {
      console.error('Spin failed:', error);
      // Try to extract clientSpinId from the request payload for error matching
      const clientSpinId = (message.payload as any)?.spinId;
      this.sendError({
        code: 'SPIN_FAILED',
        message: error instanceof Error ? error.message : 'Spin failed',
        recoverable: true,
        requestId: clientSpinId,
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
    // Convert from microVOI (engine) to normalized VOI (game)
    try {
      const currentBalanceMicroVOI = await this.engine.getBalance();
      const state = this.engine.getState();
      // Calculate available balance: total balance minus reserved for pending spins
      const availableBalanceMicroVOI = Math.max(0, currentBalanceMicroVOI - state.reservedBalance);
      
      this.sendToGame({
        type: 'BALANCE_RESPONSE',
        payload: {
          balance: currentBalanceMicroVOI / 1_000_000,
          availableBalance: availableBalanceMicroVOI / 1_000_000,
        },
      } as BalanceResponse);
    } catch (error) {
      console.error('Failed to get balance:', error);
      // Still send state balance even if refresh fails
      const state = this.engine.getState();
      const availableBalanceMicroVOI = Math.max(0, (state.balance || 0) - state.reservedBalance);
      this.sendToGame({
        type: 'BALANCE_RESPONSE',
        payload: {
          balance: (state.balance || 0) / 1_000_000,
          availableBalance: availableBalanceMicroVOI / 1_000_000,
        },
      } as BalanceResponse);
    }
  }

  /**
   * Handle GET_CREDIT_BALANCE request (W2W only)
   */
  private async handleGetCreditBalance(): Promise<void> {
    if (!this.engine || !this.initialized) {
      this.sendError({
        code: 'NOT_INITIALIZED',
        message: 'Game bridge not initialized',
        recoverable: false,
      });
      return;
    }

    try {
      const adapter = (this.engine as any).adapter;
      if (adapter && typeof adapter.getUserData === 'function') {
        const walletAddress = (this.engine as any).walletAddress;
        if (!walletAddress) {
          this.sendError({
            code: 'NO_WALLET',
            message: 'Wallet address not available',
            recoverable: false,
          });
          return;
        }

        const userData = await adapter.getUserData(walletAddress);
        this.sendToGame({
          type: 'CREDIT_BALANCE',
          payload: {
            credits: userData.credits || 0,
            bonusSpins: userData.bonusSpins || 0,
            spinCount: 0, // TODO: Get from userData if available
          },
        } as CreditBalanceMessage);
      } else {
        // Not a W2W adapter - return zeros
        this.sendToGame({
          type: 'CREDIT_BALANCE',
          payload: {
            credits: 0,
            bonusSpins: 0,
            spinCount: 0,
          },
        } as CreditBalanceMessage);
      }
    } catch (error) {
      console.error('Failed to get credit balance:', error);
      this.sendError({
        code: 'CREDIT_BALANCE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get credit balance',
        recoverable: true,
      });
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
    const adapter = (this.engine as any).adapter;
    
    // Check if this is a W2W adapter
    const isW2W = adapter && typeof adapter.getMachineState === 'function';
    
    if (isW2W) {
      // W2W format - try to get jackpot and modeEnabled from machine state
      let jackpotAmount = 0; // Default
      let modeEnabled = 7; // Default: all modes enabled
      try {
        const machineState = await adapter.getMachineState();
        
        // Get modeEnabled from machine state
        if (machineState && machineState.mode_enabled !== undefined) {
          modeEnabled = Number(machineState.mode_enabled);
        }
        
        // Select the correct jackpot based on current mode
        // Mode 1 = credit -> jackpot_credit
        // Mode 2 = VOI/network -> jackpot_network
        // Mode 4 = ARC200/token -> jackpot_token
        // Try to get mode from engine state as fallback
        let mode = this.currentMode;
        const state = this.engine.getState();
        if (state.currentBet?.mode !== undefined && state.currentBet.mode !== 0) {
          mode = state.currentBet.mode;
        }
        
        // Select jackpot based on mode
        if (machineState) {
          if (mode === 1 && machineState.jackpot_credit) {
            // Credit mode - use jackpot_credit
            jackpotAmount = Number(machineState.jackpot_credit) / 1_000_000; // Convert from microVOI
          } else if (mode === 2 && machineState.jackpot_network) {
            // VOI/network mode - use jackpot_network
            jackpotAmount = Number(machineState.jackpot_network) / 1_000_000; // Convert from microVOI
          } else if (mode === 4 && machineState.jackpot_token) {
            // ARC200/token mode - use jackpot_token
            // jackpot_token is BigUInt, convert from byte array
            const tokenJackpotBytes = machineState.jackpot_token;
            if (tokenJackpotBytes && tokenJackpotBytes.length > 0) {
              // Convert BigUInt byte array to number
              let tokenJackpot = 0n;
              for (let i = 0; i < tokenJackpotBytes.length; i++) {
                tokenJackpot = (tokenJackpot << 8n) | BigInt(tokenJackpotBytes[i]);
              }
              jackpotAmount = Number(tokenJackpot) / 1_000_000; // Convert from microVOI
            }
          } else {
            // Fallback: use jackpot_credit if available, otherwise jackpot_network
            if (machineState.jackpot_credit) {
              jackpotAmount = Number(machineState.jackpot_credit) / 1_000_000;
            } else if (machineState.jackpot_network) {
              jackpotAmount = Number(machineState.jackpot_network) / 1_000_000;
            }
          }
        }
      } catch (error) {
        console.warn('Failed to get machine state for jackpot:', error);
      }

      this.sendToGame({
        type: 'CONFIG',
        payload: {
          contractId: config.contractId.toString(),
          minBet: config.minBet / 1_000_000, // Convert from microVOI to VOI
          maxBet: config.maxBet / 1_000_000, // Convert from microVOI to VOI
          rtpTarget: config.rtpTarget,
          houseEdge: config.houseEdge,
          jackpotAmount,
          bonusSpinMultiplier: 1.5, // Default bonus multiplier
          modeEnabled,
        },
      } as ConfigMessage);
    } else {
      // 5reel format
      this.sendToGame({
        type: 'CONFIG',
        payload: {
          contractId: config.contractId.toString(),
          minBet: config.minBet / 1_000_000, // Convert from microVOI to VOI
          maxBet: config.maxBet / 1_000_000, // Convert from microVOI to VOI
          maxPaylines: config.maxPaylines,
          rtpTarget: config.rtpTarget,
          houseEdge: config.houseEdge,
        },
      } as ConfigMessage);
    }
  }

  /**
   * Handle EXIT request
   */
  private handleExit(): void {
    console.log('GameBridge: Handling EXIT request, navigating to /games');
    // Navigate to game lobby
    window.location.href = '/games';
  }

  /**
   * Send initial state (balance, credits, and config) to game
   */
  private async sendInitialState(): Promise<void> {
    if (!this.engine) return;

    // Send balance, credit balance (if W2W), and config in parallel
    const promises = [
      this.handleGetBalance(),
      this.handleGetConfig()
    ];

    // Check if this is a W2W adapter and send credit balance
    const adapter = (this.engine as any).adapter;
    if (adapter && typeof adapter.getUserData === 'function') {
      promises.push(this.handleGetCreditBalance());
    }

    await Promise.all(promises);
  }

  /**
   * Send outcome to game (supports both 5reel and w2w formats)
   */
  private async sendOutcome(result: SpinResult): Promise<void> {
    // Ensure all data is serializable for postMessage
    // Deep clone arrays and objects to avoid DataCloneError
    const serializableGrid = result.outcome.grid.map((reel) => [...reel]);

    // Get fresh state after spin is marked as COMPLETED (reserved balance should be updated)
    const state = this.engine!.getState();
    
    // Determine format based on result
    const isW2W = result.mode !== undefined || result.betAmount !== undefined;
    
    if (isW2W) {
      // W2W format
      // Convert all amounts from microVOI (engine) to normalized VOI (game)
      const serializableWaysWins = (result.outcome.waysWins || []).map((win) => ({
        symbol: String(win.symbol),
        ways: Number(win.ways),
        matchLength: Number(win.matchLength),
        payout: Number(win.payout), // Keep in microVOI for breakdown calculation
        wildMultiplier: Number(win.wildMultiplier || 1), // Include wild multiplier, default to 1
      }));

      this.sendToGame({
        type: 'OUTCOME',
        payload: {
          spinId: String(result.id),
          grid: serializableGrid,
          winnings: Number(result.winnings) / 1_000_000, // Convert microVOI to VOI
          isWin: Boolean(result.isWin),
          waysWins: serializableWaysWins,
          betAmount: Number(result.betAmount || 0) / 1_000_000, // Convert from microVOI to VOI
          bonusSpinsAwarded: Number(result.outcome.bonusSpinsAwarded || 0),
          jackpotHit: Boolean(result.outcome.jackpotHit),
          jackpotAmount: result.outcome.jackpotAmount ? Number(result.outcome.jackpotAmount) / 1_000_000 : undefined, // Convert microVOI to VOI
          winLevel: String(result.winLevel),
          totalBet: Number(result.totalBet) / 1_000_000, // Convert from microVOI to VOI
        },
      } as OutcomeMessage);
    } else {
      // 5reel format
      // Convert all amounts from microVOI (engine) to normalized VOI (game)
      const serializableWinningLines = (result.outcome.winningLines || []).map((line) => ({
        paylineIndex: line.paylineIndex,
        symbol: String(line.symbol), // Ensure string
        matchCount: Number(line.matchCount), // Ensure number
        payout: Number(line.payout) / 1_000_000, // Convert from microVOI to VOI
      }));

      this.sendToGame({
        type: 'OUTCOME',
        payload: {
          spinId: String(result.id),
          grid: serializableGrid,
          winnings: Number(result.winnings) / 1_000_000, // Convert microVOI to VOI
          isWin: Boolean(result.isWin),
          winningLines: serializableWinningLines,
          winLevel: String(result.winLevel),
          betPerLine: Number(result.betPerLine || 0) / 1_000_000, // Convert from microVOI to VOI
          paylines: Number(result.paylines || 0),
          totalBet: Number(result.totalBet) / 1_000_000, // Convert from microVOI to VOI
        },
      } as OutcomeMessage);
    }

    // Immediately send balance update with correct reserved balance
    // The spin is now COMPLETED, so reserved balance should exclude it
    // Convert from microVOI (engine) to normalized VOI (game)
    const availableBalanceMicroVOI = Math.max(0, state.balance - state.reservedBalance);
    this.sendToGame({
      type: 'BALANCE_UPDATE',
      payload: {
        balance: state.balance / 1_000_000,
        availableBalance: availableBalanceMicroVOI / 1_000_000,
      },
    } as BalanceUpdateMessage);

    // Also refresh balance from blockchain in background (especially important after wins)
    // This will trigger onBalanceUpdate which will send another update if balance changed
    try {
      const currentBalanceMicroVOI = await this.engine!.getBalance();
      const updatedState = this.engine!.getState();
      const updatedAvailableBalanceMicroVOI = Math.max(0, currentBalanceMicroVOI - updatedState.reservedBalance);
      
      // Only send update if balance actually changed
      if (currentBalanceMicroVOI !== state.balance || updatedAvailableBalanceMicroVOI !== availableBalanceMicroVOI) {
        this.sendToGame({
          type: 'BALANCE_UPDATE',
          payload: {
            balance: currentBalanceMicroVOI / 1_000_000,
            availableBalance: updatedAvailableBalanceMicroVOI / 1_000_000,
          },
        } as BalanceUpdateMessage);
      }
    } catch (error) {
      console.error('Failed to refresh balance after outcome:', error);
      // Balance update already sent above with correct reserved balance
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
    // Add namespace to all outgoing messages
    const messageWithNamespace = {
      ...message,
      namespace: MESSAGE_NAMESPACE,
    };

    if (this.targetIframe && this.targetIframe.contentWindow) {
      // Send via postMessage to iframe
      try {
        this.targetIframe.contentWindow.postMessage(messageWithNamespace, '*'); // Use targetOrigin in production
      } catch (error) {
        console.error('Failed to send message to iframe:', error);
      }
    } else {
      // Fallback: send postMessage to same window (for non-iframe setup)
      try {
        window.postMessage(messageWithNamespace, '*');
      } catch (error) {
        console.error('Failed to send message to window:', error);
      }

      // Also dispatch custom event for backwards compatibility
      window.dispatchEvent(
        new CustomEvent('gameBridgeMessage', {
          detail: messageWithNamespace,
        })
      );
    }
  }

  /**
   * Validate spin request (supports both 5reel and w2w formats)
   */
  private validateSpinRequest(message: SpinRequest): { valid: boolean; error?: string } {
    if (!this.engine) {
      return { valid: false, error: 'Engine not initialized' };
    }

    const config = this.engine.getConfig();

    // Check format
    const is5ReelFormat = 'paylines' in message.payload && 'betPerLine' in message.payload;
    const isW2WFormat = 'betAmount' in message.payload && 'reserved' in message.payload;

    if (is5ReelFormat) {
      const { paylines, betPerLine } = message.payload as { paylines: number; betPerLine: number };

      // Validate paylines
      if (paylines < 1 || paylines > config.maxPaylines) {
        return {
          valid: false,
          error: `Paylines must be between 1 and ${config.maxPaylines}`,
        };
      }

      // Validate bet amount
      // betPerLine is in normalized VOI, config values are in microVOI - convert for comparison
      const minBetVOI = config.minBet / 1_000_000;
      const maxBetVOI = config.maxBet / 1_000_000;
      if (betPerLine < minBetVOI || betPerLine > maxBetVOI) {
        return {
          valid: false,
          error: `Bet per line must be between ${minBetVOI} and ${maxBetVOI} VOI`,
        };
      }
    } else if (isW2WFormat) {
      const { betAmount } = message.payload as { betAmount: number; reserved: number };

      // Validate bet amount (must be 40 or 60)
      if (betAmount !== 40 && betAmount !== 60) {
        return {
          valid: false,
          error: 'Bet amount must be 40 or 60 for W2W games',
        };
      }
    } else {
      return {
        valid: false,
        error: 'Invalid spin request format - must be either 5reel (paylines, betPerLine) or w2w (betAmount, reserved)',
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

