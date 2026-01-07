/**
 * Machine State Reader
 * Reads on-chain state from game (SlotMachine) and treasury (YBT) contracts
 * Used for registering existing contracts and verifying contract pairs
 *
 * Supports multiple contract versions through the versioned-clients module.
 */

import algosdk from 'algosdk';
import { CONTRACT } from 'ulujs';
import { PUBLIC_VOI_NODE_URL, PUBLIC_VOI_INDEXER_URL } from '$env/static/public';
import type { MachineType } from '$lib/types/database';
import {
  getGameContractABI,
  getTreasuryContractABI,
  isGameVersionSupported,
  isTreasuryVersionSupported
} from '$lib/contracts/versioned-clients';

// Voi network configuration
const VOI_NODE_URL = PUBLIC_VOI_NODE_URL || 'https://testnet-api.voi.nodly.io';
const VOI_INDEXER_URL = PUBLIC_VOI_INDEXER_URL || 'https://testnet-idx.voi.nodly.io';

// Default decimals for YBT tokens
const DEFAULT_YBT_DECIMALS = 9;

// Versions to try when auto-detecting
const GAME_VERSIONS_TO_TRY = [2, 1]; // Try newest first
const TREASURY_VERSIONS_TO_TRY = [2, 1];

/**
 * Result of checking if an app exists
 */
interface AppExistsResult {
  exists: boolean;
  error?: string;
}

/**
 * Payment mode flags - bitmask values
 * 1 = credit, 2 = network, 4 = token
 *
 * Combined values:
 * 0 = disabled
 * 1 = credit enabled
 * 2 = network enabled
 * 3 = credit and network enabled
 * 4 = token enabled
 * 5 = credit and token enabled
 * 6 = network and token enabled
 * 7 = credit, network, and token enabled
 */
export const PaymentMode = {
  DISABLED: 0,
  CREDIT: 1,
  NETWORK: 2,
  TOKEN: 4,
  CREDIT_NETWORK: 3,
  CREDIT_TOKEN: 5,
  NETWORK_TOKEN: 6,
  ALL: 7
} as const;

export type PaymentModeValue = typeof PaymentMode[keyof typeof PaymentMode];

/**
 * Helper to check if a mode includes a specific payment type
 */
export function hasPaymentMode(modeEnabled: number, mode: 1 | 2 | 4): boolean {
  return (modeEnabled & mode) !== 0;
}

/**
 * Get human-readable payment modes from mode_enabled value
 */
export function getPaymentModes(modeEnabled: number): string[] {
  const modes: string[] = [];
  if (modeEnabled & PaymentMode.CREDIT) modes.push('credit');
  if (modeEnabled & PaymentMode.NETWORK) modes.push('network');
  if (modeEnabled & PaymentMode.TOKEN) modes.push('token');
  return modes;
}

/**
 * Contract references needed for transaction construction
 * These are stored in the game contract's global state
 */
export interface GameContractReferences {
  /**
   * ARC-200 token app ID when token mode is enabled (mode_enabled & 4)
   * Only relevant when modeEnabled includes TOKEN (4, 5, 6, or 7)
   */
  tokenAppId: number | null;
  /**
   * Storage contract for bet/user data persistence
   */
  storageAppId: number | null;
  /**
   * Safe jackpot contract for progressive jackpot
   */
  safeJackpotAppId: number | null;
  /**
   * Safe fee contract for fee distribution
   */
  safeFeeAppId: number | null;
}

/**
 * Fee configuration from contract global state
 * These are set during contract deployment
 */
export interface GameFeeConfig {
  /** Treasury fee in basis points (e.g., 30 = 0.3%) */
  treasuryBps: number;
  /** Treasury address for fee collection */
  treasuryAddress: string;
  /** Marketing fee in basis points (e.g., 20 = 0.2%) */
  marketingBps: number;
  /** Marketing address for fee collection */
  marketingAddress: string;
}

/**
 * Game contract (SlotMachine) state
 */
export interface GameContractState {
  type: 'game';
  appId: number;
  contractAddress: string;
  owner: string;
  bootstrapped: boolean;
  balanceTotal: bigint;
  balanceAvailable: bigint;
  balanceLocked: bigint;
  balanceFuse: boolean;
  /**
   * Payment mode bitmask: 1=credit, 2=network, 4=token
   * Use hasPaymentMode() or getPaymentModes() helpers to interpret
   */
  modeEnabled: number;
  /**
   * Contract references needed for transaction construction
   */
  contractRefs: GameContractReferences;
  /**
   * Fee configuration from contract global state
   * null if not available (e.g., current 5-reel contracts)
   */
  feeConfig: GameFeeConfig | null;
  /** Detected or specified contract version */
  detectedVersion?: number;
}

/**
 * Treasury contract (YBT) state
 */
export interface TreasuryContractState {
  type: 'treasury';
  appId: number;
  contractAddress: string;
  owner: string;
  bootstrapped: boolean;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  yieldBearingSource: number | null;
  /** Detected or specified contract version */
  detectedVersion?: number;
}

/**
 * Contract validation result
 */
export interface ContractPairValidation {
  valid: boolean;
  gameState: GameContractState | null;
  treasuryState: TreasuryContractState | null;
  errors: string[];
}

/**
 * Parse global state key from various formats
 * Handles both base64 strings (legacy) and Uint8Array (algosdk 3.x)
 */
function parseGlobalStateKey(keyValue: unknown): string | null {
  if (typeof keyValue === 'string') {
    // Legacy format - base64 encoded
    try {
      return atob(keyValue);
    } catch {
      return null;
    }
  } else if (keyValue instanceof Uint8Array) {
    return new TextDecoder().decode(keyValue);
  }
  return null;
}

/**
 * Safely convert a value to BigInt
 * Handles number, bigint, and string inputs
 */
function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string') {
    return BigInt(value);
  }
  return 0n;
}

/**
 * Decode bytes to string, handling various input formats
 */
function bytesToString(value: unknown): string {
  if (typeof value === 'string') {
    return value.replace(/\0/g, '').trim();
  }
  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value).replace(/\0/g, '').trim();
  }
  if (Array.isArray(value)) {
    return new TextDecoder().decode(new Uint8Array(value)).replace(/\0/g, '').trim();
  }
  return '';
}

/**
 * Options for reading game contract state
 */
export interface ReadGameContractOptions {
  /** Machine type for version lookup. Defaults to 'slots_w2w' */
  machineType?: MachineType;
  /** Specific version to use. If not provided, will auto-detect */
  version?: number;
}

/**
 * Options for reading treasury contract state
 */
export interface ReadTreasuryContractOptions {
  /** Specific version to use. If not provided, will auto-detect */
  version?: number;
}

/**
 * Options for validating a contract pair
 */
export interface ValidateContractPairOptions {
  /** Machine type for game contract. Defaults to 'slots_w2w' */
  machineType?: MachineType;
  /** Game contract version. If not provided, will auto-detect */
  gameVersion?: number;
  /** Treasury contract version. If not provided, will auto-detect */
  treasuryVersion?: number;
}

/**
 * Result of contract type detection
 */
export interface ContractTypeDetectionResult {
  type: 'game' | 'treasury' | 'unknown';
  version?: number;
}

class MachineStateReader {
  private algodClient: algosdk.Algodv2;
  private indexerClient: algosdk.Indexer;

  constructor() {
    this.algodClient = new algosdk.Algodv2('', VOI_NODE_URL, '');
    this.indexerClient = new algosdk.Indexer('', VOI_INDEXER_URL, '');
  }

  /**
   * Get the ABI for a game contract, with fallback to auto-detection
   */
  private getGameABI(machineType: MachineType, version: number): unknown {
    return getGameContractABI(machineType, version);
  }

  /**
   * Get the ABI for a treasury contract, with fallback to auto-detection
   */
  private getTreasuryABI(version: number): unknown {
    return getTreasuryContractABI(version);
  }

  /**
   * Check if an application exists on-chain
   *
   * @param appId - The application ID to check
   * @returns Object with exists boolean and optional error message
   */
  async appExistsWithError(appId: number): Promise<AppExistsResult> {
    try {
      await this.algodClient.getApplicationByID(appId).do();
      return { exists: true };
    } catch (error) {
      // Check if it's a "not found" error vs a network error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        return { exists: false };
      }
      // Network or other error - report it
      return { exists: false, error: errorMessage };
    }
  }

  /**
   * Check if an application exists on-chain (simple boolean version)
   *
   * @param appId - The application ID to check
   * @returns true if the app exists, false otherwise
   */
  async appExists(appId: number): Promise<boolean> {
    const result = await this.appExistsWithError(appId);
    return result.exists;
  }

  /**
   * Get the account balance for a contract address
   *
   * @param address - The Algorand/Voi address
   * @returns The account balance in microVOI
   */
  async getAccountBalance(address: string): Promise<bigint> {
    try {
      const accountInfo = await this.algodClient.accountInformation(address).do();
      return toBigInt(accountInfo.amount);
    } catch (error) {
      // Log but don't throw - balance check is often non-critical
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn('Could not get account balance:', { address, error: errorMessage });
      return 0n;
    }
  }

  /**
   * Try to read game contract state with a specific version
   * Returns null if the version doesn't work
   */
  private async tryReadGameContractStateWithVersion(
    appId: number,
    contractAddress: string,
    machineType: MachineType,
    version: number
  ): Promise<GameContractState | null> {
    try {
      const abi = this.getGameABI(machineType, version);

      // Create CONTRACT instance for read-only calls
      const ci = new CONTRACT(
        appId,
        this.algodClient,
        undefined,
        abi,
        {
          addr: contractAddress,
          sk: new Uint8Array(0)
        }
      );

      // Get owner - this is the key test for version compatibility and bootstrap status
      // If owner is set, the contract has been bootstrapped
      let owner = '';
      try {
        const ownerResult = await ci.get_owner();
        if (ownerResult.success && ownerResult.returnValue) {
          owner = ownerResult.returnValue.toString();
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn('Could not get game owner:', { appId, version, error: errorMessage });
        // If get_owner fails, this version doesn't work
        return null;
      }

      // If we couldn't get owner, this version doesn't match
      if (!owner) {
        return null;
      }

      // Owner is set - contract is bootstrapped
      // Bootstrap detection is based on owner being set, not get_balances
      const bootstrapped = true;

      // Try to get balances (optional - not all contract variants have this method)
      let balanceTotal = 0n;
      let balanceAvailable = 0n;
      let balanceLocked = 0n;
      let balanceFuse = false;

      try {
        const balancesResult = await ci.get_balances();
        if (balancesResult.success && balancesResult.returnValue) {
          // The return value is an array: [balance_available, balance_total, balance_locked, balance_fuse]
          const balances = balancesResult.returnValue as unknown[];
          balanceAvailable = toBigInt(balances[0]);
          balanceTotal = toBigInt(balances[1]);
          balanceLocked = toBigInt(balances[2]);
          balanceFuse = Boolean(balances[3]);
        }
      } catch {
        // get_balances not available in this contract variant - use account balance as fallback
        balanceTotal = await this.getAccountBalance(contractAddress);
        balanceAvailable = balanceTotal;
      }

      // Read mode_enabled, contract references, and fee config from global state
      // Default modeEnabled: 5-reel defaults to network mode (2), others default to 0
      let modeEnabled = machineType === 'slots_5reel' ? 2 : 0;
      const contractRefs: GameContractReferences = {
        tokenAppId: null,
        storageAppId: null,
        safeJackpotAppId: null,
        safeFeeAppId: null
      };
      let feeConfig: GameFeeConfig | null = null;

      try {
        const appInfo = await this.algodClient.getApplicationByID(appId).do();
        const globalState = appInfo.params.globalState || [];

        for (const state of globalState) {
          const key = parseGlobalStateKey(state.key);
          if (key === null) continue;

          // Handle integer values (type === 2)
          if (state.value.type === 2) {
            const value = state.value.uint;
            const numValue = typeof value === 'bigint' ? Number(value) : value;

            switch (key) {
              case 'mode_enabled':
                modeEnabled = numValue; // Override default if present
                break;
              case 'token_app_id':
                contractRefs.tokenAppId = numValue === 0 ? null : numValue;
                break;
              case 'storage_app_id':
                contractRefs.storageAppId = numValue === 0 ? null : numValue;
                break;
              case 'safe_jackpot_app_id':
                contractRefs.safeJackpotAppId = numValue === 0 ? null : numValue;
                break;
              case 'safe_fee_app_id':
                contractRefs.safeFeeAppId = numValue === 0 ? null : numValue;
                break;
              case 'fee_treasury_bps':
                if (!feeConfig) feeConfig = { treasuryBps: 0, treasuryAddress: '', marketingBps: 0, marketingAddress: '' };
                feeConfig.treasuryBps = numValue;
                break;
              case 'fee_marketing_bps':
                if (!feeConfig) feeConfig = { treasuryBps: 0, treasuryAddress: '', marketingBps: 0, marketingAddress: '' };
                feeConfig.marketingBps = numValue;
                break;
            }
          }
          // Handle bytes/address values (type === 1)
          else if (state.value.type === 1) {
            const bytes = state.value.bytes;
            // Addresses are 32 bytes, encoded as base64 in API response or Uint8Array in SDK
            let address = '';
            try {
              if (typeof bytes === 'string') {
                // Base64 encoded - decode and convert to address
                const decoded = Uint8Array.from(atob(bytes), c => c.charCodeAt(0));
                if (decoded.length === 32) {
                  address = algosdk.encodeAddress(decoded);
                }
              } else if (bytes instanceof Uint8Array && bytes.length === 32) {
                address = algosdk.encodeAddress(bytes);
              }
            } catch {
              // Invalid address format, skip
            }

            if (address) {
              switch (key) {
                case 'fee_treasury_address':
                  if (!feeConfig) feeConfig = { treasuryBps: 0, treasuryAddress: '', marketingBps: 0, marketingAddress: '' };
                  feeConfig.treasuryAddress = address;
                  break;
                case 'fee_marketing_address':
                  if (!feeConfig) feeConfig = { treasuryBps: 0, treasuryAddress: '', marketingBps: 0, marketingAddress: '' };
                  feeConfig.marketingAddress = address;
                  break;
              }
            }
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn('Could not read global state:', { appId, error: errorMessage });
      }

      return {
        type: 'game',
        appId,
        contractAddress,
        owner,
        bootstrapped,
        balanceTotal,
        balanceAvailable,
        balanceLocked,
        balanceFuse,
        modeEnabled,
        contractRefs,
        feeConfig,
        detectedVersion: version
      };
    } catch (error) {
      // This version doesn't work with this contract
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.info(`Version ${version} failed for game contract ${appId}:`, errorMessage);
      return null;
    }
  }

  /**
   * Read game contract (SlotMachine) state from the blockchain
   *
   * Reads the following from the contract:
   * - Owner address
   * - Balance information (total, available, locked)
   * - Balance fuse status
   * - Bootstrap status
   *
   * @param appId - The game contract application ID
   * @param options - Optional configuration for version and machine type
   * @returns The game contract state
   * @throws Error if the contract doesn't exist or no compatible version found
   */
  async readGameContractState(
    appId: number,
    options: ReadGameContractOptions = {}
  ): Promise<GameContractState> {
    const { machineType = 'slots_w2w', version } = options;
    const contractAddress = algosdk.getApplicationAddress(appId).toString();

    // Check if app exists with detailed error
    const existsResult = await this.appExistsWithError(appId);
    if (!existsResult.exists) {
      if (existsResult.error) {
        throw new Error(`Failed to check game contract ${appId}: ${existsResult.error}`);
      }
      throw new Error(`Game contract ${appId} does not exist`);
    }

    // If version is specified, use it directly
    if (version !== undefined) {
      if (!isGameVersionSupported(machineType, version)) {
        throw new Error(`Game contract version ${version} is not supported for ${machineType}`);
      }

      const state = await this.tryReadGameContractStateWithVersion(
        appId, contractAddress, machineType, version
      );

      if (state) {
        return state;
      }

      // Version specified but failed - still return basic state
      const accountBalance = await this.getAccountBalance(contractAddress);
      return {
        type: 'game',
        appId,
        contractAddress,
        owner: '',
        bootstrapped: false,
        balanceTotal: accountBalance,
        balanceAvailable: accountBalance,
        balanceLocked: 0n,
        balanceFuse: false,
        modeEnabled: machineType === 'slots_5reel' ? 2 : 0,
        contractRefs: {
          tokenAppId: null,
          storageAppId: null,
          safeJackpotAppId: null,
          safeFeeAppId: null
        },
        feeConfig: null,
        detectedVersion: version
      };
    }

    // Auto-detect version by trying each supported version
    for (const tryVersion of GAME_VERSIONS_TO_TRY) {
      if (!isGameVersionSupported(machineType, tryVersion)) {
        continue;
      }

      const state = await this.tryReadGameContractStateWithVersion(
        appId, contractAddress, machineType, tryVersion
      );

      if (state) {
        console.log(`Auto-detected game contract ${appId} as version ${tryVersion}`);
        return state;
      }
    }

    // No version worked - return basic state with account balance
    console.warn(`Could not determine version for game contract ${appId}, returning basic state`);
    const accountBalance = await this.getAccountBalance(contractAddress);
    return {
      type: 'game',
      appId,
      contractAddress,
      owner: '',
      bootstrapped: false,
      balanceTotal: accountBalance,
      balanceAvailable: accountBalance,
      balanceLocked: 0n,
      balanceFuse: false,
      modeEnabled: machineType === 'slots_5reel' ? 2 : 0,
      contractRefs: {
        tokenAppId: null,
        storageAppId: null,
        safeJackpotAppId: null,
        safeFeeAppId: null
      },
      feeConfig: null
    };
  }

  /**
   * Try to read treasury contract state with a specific version
   * Returns null if the version doesn't work
   */
  private async tryReadTreasuryContractStateWithVersion(
    appId: number,
    contractAddress: string,
    version: number
  ): Promise<TreasuryContractState | null> {
    try {
      const abi = this.getTreasuryABI(version);

      // Create CONTRACT instance for read-only calls
      const ci = new CONTRACT(
        appId,
        this.algodClient,
        undefined,
        abi,
        {
          addr: contractAddress,
          sk: new Uint8Array(0)
        }
      );

      // Get owner
      let owner = '';
      try {
        const ownerResult = await ci.get_owner();
        if (ownerResult.success && ownerResult.returnValue) {
          owner = ownerResult.returnValue.toString();
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn('Could not get treasury owner:', { appId, version, error: errorMessage });
      }

      // Get token name - this is the key test for version compatibility
      let name = '';
      const nameResult = await ci.arc200_name();
      if (nameResult.success && nameResult.returnValue) {
        name = bytesToString(nameResult.returnValue);
      } else {
        // Name call didn't succeed - version probably wrong
        return null;
      }

      // Get token symbol
      let symbol = '';
      try {
        const symbolResult = await ci.arc200_symbol();
        if (symbolResult.success && symbolResult.returnValue) {
          symbol = bytesToString(symbolResult.returnValue);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn('Could not get token symbol:', { appId, version, error: errorMessage });
      }

      // Get decimals
      let decimals = DEFAULT_YBT_DECIMALS;
      try {
        const decimalsResult = await ci.arc200_decimals();
        if (decimalsResult.success && decimalsResult.returnValue !== undefined) {
          decimals = Number(decimalsResult.returnValue);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn('Could not get token decimals:', { appId, version, error: errorMessage });
      }

      // Get total supply - use toBigInt to safely handle large values
      let totalSupply = 0n;
      let bootstrapped = false;
      try {
        const supplyResult = await ci.arc200_totalSupply();
        if (supplyResult.success && supplyResult.returnValue !== undefined) {
          totalSupply = toBigInt(supplyResult.returnValue);
          bootstrapped = true;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn('Could not get total supply:', { appId, version, error: errorMessage });
      }

      // Get yield bearing source from global state
      let yieldBearingSource: number | null = null;
      try {
        const appInfo = await this.algodClient.getApplicationByID(appId).do();
        const globalState = appInfo.params.globalState || [];

        for (const state of globalState) {
          const key = parseGlobalStateKey(state.key);
          if (key === null) continue;

          if (key === 'yield_bearing_source') {
            if (state.value.type === 2) {
              const value = state.value.uint;
              yieldBearingSource = typeof value === 'bigint' ? Number(value) : value;
            }
            break;
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn('Could not read yield_bearing_source from global state:', { appId, version, error: errorMessage });
      }

      return {
        type: 'treasury',
        appId,
        contractAddress,
        owner,
        bootstrapped,
        name,
        symbol,
        decimals,
        totalSupply,
        yieldBearingSource,
        detectedVersion: version
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.info(`Version ${version} failed for treasury contract ${appId}:`, errorMessage);
      return null;
    }
  }

  /**
   * Read treasury contract (YBT - Yield Bearing Token) state from the blockchain
   *
   * Reads the following from the contract:
   * - Owner address
   * - Token metadata (name, symbol, decimals)
   * - Total supply
   * - Yield bearing source (linked game contract ID)
   * - Bootstrap status
   *
   * @param appId - The treasury contract application ID
   * @param options - Optional configuration for version
   * @returns The treasury contract state
   * @throws Error if the contract doesn't exist
   */
  async readTreasuryContractState(
    appId: number,
    options: ReadTreasuryContractOptions = {}
  ): Promise<TreasuryContractState> {
    const { version } = options;
    const contractAddress = algosdk.getApplicationAddress(appId).toString();

    // Check if app exists with detailed error
    const existsResult = await this.appExistsWithError(appId);
    if (!existsResult.exists) {
      if (existsResult.error) {
        throw new Error(`Failed to check treasury contract ${appId}: ${existsResult.error}`);
      }
      throw new Error(`Treasury contract ${appId} does not exist`);
    }

    // If version is specified, use it directly
    if (version !== undefined) {
      if (!isTreasuryVersionSupported(version)) {
        throw new Error(`Treasury contract version ${version} is not supported`);
      }

      const state = await this.tryReadTreasuryContractStateWithVersion(
        appId, contractAddress, version
      );

      if (state) {
        return state;
      }

      // Version specified but failed - return basic state
      return {
        type: 'treasury',
        appId,
        contractAddress,
        owner: '',
        bootstrapped: false,
        name: '',
        symbol: '',
        decimals: DEFAULT_YBT_DECIMALS,
        totalSupply: 0n,
        yieldBearingSource: null,
        detectedVersion: version
      };
    }

    // Auto-detect version by trying each supported version
    for (const tryVersion of TREASURY_VERSIONS_TO_TRY) {
      if (!isTreasuryVersionSupported(tryVersion)) {
        continue;
      }

      const state = await this.tryReadTreasuryContractStateWithVersion(
        appId, contractAddress, tryVersion
      );

      if (state) {
        console.log(`Auto-detected treasury contract ${appId} as version ${tryVersion}`);
        return state;
      }
    }

    // No version worked - return basic state
    console.warn(`Could not determine version for treasury contract ${appId}, returning basic state`);
    return {
      type: 'treasury',
      appId,
      contractAddress,
      owner: '',
      bootstrapped: false,
      name: '',
      symbol: '',
      decimals: DEFAULT_YBT_DECIMALS,
      totalSupply: 0n,
      yieldBearingSource: null
    };
  }

  /**
   * Validate that a game and treasury contract are properly linked
   *
   * A valid pair must meet these requirements:
   * 1. Both contracts exist and are readable
   * 2. Both contracts are bootstrapped
   * 3. Treasury's yield_bearing_source points to the game contract
   * 4. Game's owner is the treasury contract address
   *
   * @param gameAppId - The game contract application ID
   * @param treasuryAppId - The treasury contract application ID
   * @param options - Optional configuration for versions
   * @returns Validation result with detailed error messages
   */
  async validateContractPair(
    gameAppId: number,
    treasuryAppId: number,
    options: ValidateContractPairOptions = {}
  ): Promise<ContractPairValidation> {
    const { machineType = 'slots_w2w', gameVersion, treasuryVersion } = options;
    const errors: string[] = [];
    let gameState: GameContractState | null = null;
    let treasuryState: TreasuryContractState | null = null;

    // Read game contract state
    try {
      gameState = await this.readGameContractState(gameAppId, {
        machineType,
        version: gameVersion
      });
    } catch (error) {
      errors.push(`Failed to read game contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Read treasury contract state
    try {
      treasuryState = await this.readTreasuryContractState(treasuryAppId, {
        version: treasuryVersion
      });
    } catch (error) {
      errors.push(`Failed to read treasury contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // If we couldn't read either contract, return early
    if (!gameState || !treasuryState) {
      return {
        valid: false,
        gameState,
        treasuryState,
        errors
      };
    }

    // Validate the link: treasury's yield_bearing_source should point to game
    if (treasuryState.yieldBearingSource !== gameAppId) {
      errors.push(
        `Treasury's yield_bearing_source (${treasuryState.yieldBearingSource}) does not match game contract ID (${gameAppId})`
      );
    }

    // Validate ownership: game's owner should be treasury contract address
    if (gameState.owner && gameState.owner !== treasuryState.contractAddress) {
      errors.push(
        `Game contract owner (${gameState.owner}) is not the treasury contract address (${treasuryState.contractAddress})`
      );
    }

    // Both contracts should be bootstrapped
    if (!gameState.bootstrapped) {
      errors.push('Game contract is not bootstrapped');
    }

    if (!treasuryState.bootstrapped) {
      errors.push('Treasury contract is not bootstrapped');
    }

    return {
      valid: errors.length === 0,
      gameState,
      treasuryState,
      errors
    };
  }

  /**
   * Detect contract type and version by trying to read type-specific methods
   *
   * Detection strategy:
   * - Treasury contracts are checked FIRST using `arc200_name()` (ARC-200 specific)
   * - Game contracts are checked second using `get_owner()`
   * - Treasury is checked first because both contract types have `get_owner()`,
   *   but only treasury contracts have `arc200_name()`
   * - Tries all supported versions to find a match
   *
   * @param appId - The contract application ID
   * @param machineType - Machine type to try for game contracts. Defaults to 'slots_w2w'
   * @returns The detected contract type, version, or 'unknown'
   */
  async detectContractType(
    appId: number,
    machineType: MachineType = 'slots_w2w'
  ): Promise<ContractTypeDetectionResult> {
    const contractAddress = algosdk.getApplicationAddress(appId).toString();

    // Try treasury contracts FIRST using arc200_name (ARC-200 specific method)
    // This must come before game detection because both contract types have get_owner(),
    // but only treasury contracts (YBT/ARC-200) have arc200_name()
    for (const version of TREASURY_VERSIONS_TO_TRY) {
      if (!isTreasuryVersionSupported(version)) {
        continue;
      }

      try {
        const abi = this.getTreasuryABI(version);
        const ci = new CONTRACT(
          appId,
          this.algodClient,
          undefined,
          abi,
          {
            addr: contractAddress,
            sk: new Uint8Array(0)
          }
        );

        const result = await ci.arc200_name();
        if (result.success) {
          return { type: 'treasury', version };
        }
      } catch {
        // This version doesn't work - continue checking
      }
    }

    // Try to detect game contract by calling get_owner with each version
    // (get_owner is more reliable than get_balances which doesn't exist in split architecture)
    for (const version of GAME_VERSIONS_TO_TRY) {
      if (!isGameVersionSupported(machineType, version)) {
        continue;
      }

      try {
        const abi = this.getGameABI(machineType, version);
        const ci = new CONTRACT(
          appId,
          this.algodClient,
          undefined,
          abi,
          {
            addr: contractAddress,
            sk: new Uint8Array(0)
          }
        );

        const result = await ci.get_owner();
        if (result.success && result.returnValue) {
          // Additional check: game contract owners are typically treasury contract addresses
          // (58 char base32 address), not zero address
          const ownerStr = result.returnValue.toString();
          if (ownerStr && ownerStr.length === 58) {
            return { type: 'game', version };
          }
        }
      } catch {
        // This version doesn't work - continue checking
      }
    }

    return { type: 'unknown' };
  }
}

// Export singleton instance
export const machineStateReader = new MachineStateReader();

// Export class for testing
export { MachineStateReader };
