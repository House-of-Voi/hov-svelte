/**
 * Admin Contract State API
 * Read on-chain state from game (SlotMachine) or treasury (YBT) contracts
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requirePermission, getCurrentProfileId, PERMISSIONS } from '$lib/auth/admin';
import {
  machineStateReader,
  type GameContractState,
  type TreasuryContractState,
} from '$lib/voi/machine-state-reader';

// Maximum valid app ID (safe integer limit)
const MAX_APP_ID = Number.MAX_SAFE_INTEGER;

/**
 * Serialized contract references for JSON response
 */
interface SerializedContractRefs {
  tokenAppId: number | null;
  storageAppId: number | null;
  safeJackpotAppId: number | null;
  safeFeeAppId: number | null;
}

/**
 * Serialized fee configuration for JSON response
 */
interface SerializedFeeConfig {
  treasuryBps: number;
  treasuryAddress: string;
  marketingBps: number;
  marketingAddress: string;
}

/**
 * Serialized game contract state for JSON response
 * BigInt values are converted to strings
 */
interface SerializedGameContractState {
  type: 'game';
  appId: number;
  contractAddress: string;
  owner: string;
  bootstrapped: boolean;
  balanceTotal: string;
  balanceAvailable: string;
  balanceLocked: string;
  balanceFuse: boolean;
  modeEnabled: number;
  contractRefs: SerializedContractRefs;
  feeConfig: SerializedFeeConfig | null;
  detectedVersion?: number;
}

/**
 * Serialized treasury contract state for JSON response
 * BigInt values are converted to strings
 */
interface SerializedTreasuryContractState {
  type: 'treasury';
  appId: number;
  contractAddress: string;
  owner: string;
  bootstrapped: boolean;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  yieldBearingSource: number | null;
}

/**
 * Serialized contract pair validation result
 */
interface SerializedContractPairValidation {
  valid: boolean;
  gameState: SerializedGameContractState | null;
  treasuryState: SerializedTreasuryContractState | null;
  errors: string[];
}

// Response types
interface ContractStateResponse {
  type: 'game' | 'treasury';
  data: SerializedGameContractState | SerializedTreasuryContractState;
}

interface ContractPairValidationResponse {
  validation: SerializedContractPairValidation;
}

/**
 * GET /api/admin/machines/contract-state/:appId
 * Read on-chain state from a contract
 *
 * Query params:
 * - type: 'game' | 'treasury' | 'auto' (default: 'auto')
 * - validate_with: number (optional, treasury app ID to validate pair)
 */
export const GET: RequestHandler = async ({ params, url, cookies }) => {
  try {
    // Explicit authentication check
    const profileId = await getCurrentProfileId(cookies);
    if (!profileId) {
      return json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    await requirePermission(cookies, PERMISSIONS.VIEW_GAMES, profileId);

    const appIdStr = params.appId;

    if (!appIdStr) {
      return json(
        { success: false, error: 'App ID is required' },
        { status: 400 }
      );
    }

    const appId = parseInt(appIdStr, 10);

    // Validate app ID is a safe positive integer
    if (isNaN(appId) || appId <= 0 || appId > MAX_APP_ID) {
      return json(
        { success: false, error: 'Invalid app ID. Must be a positive integer.' },
        { status: 400 }
      );
    }

    const contractType = url.searchParams.get('type') || 'auto';
    const validateWith = url.searchParams.get('validate_with');

    // If validate_with is provided, do pair validation
    if (validateWith) {
      const treasuryAppId = parseInt(validateWith, 10);

      if (isNaN(treasuryAppId) || treasuryAppId <= 0 || treasuryAppId > MAX_APP_ID) {
        return json(
          { success: false, error: 'Invalid validate_with app ID. Must be a positive integer.' },
          { status: 400 }
        );
      }

      try {
        const validation = await machineStateReader.validateContractPair(appId, treasuryAppId);

        // Convert to serialized types
        const response: ContractPairValidationResponse = {
          validation: {
            valid: validation.valid,
            errors: validation.errors,
            gameState: validation.gameState ? serializeGameState(validation.gameState) : null,
            treasuryState: validation.treasuryState ? serializeTreasuryState(validation.treasuryState) : null
          }
        };

        return json(
          { success: true, data: response },
          { status: 200 }
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error validating contract pair:', { appId, treasuryAppId, error: errorMessage });
        return json(
          { success: false, error: `Failed to validate contract pair: ${errorMessage}` },
          { status: 500 }
        );
      }
    }

    // Determine contract type
    let detectedType: 'game' | 'treasury' | 'unknown' = 'unknown';

    if (contractType === 'auto') {
      try {
        const detection = await machineStateReader.detectContractType(appId);
        detectedType = detection.type;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error detecting contract type:', { appId, error: errorMessage });
        return json(
          { success: false, error: `Failed to detect contract type: ${errorMessage}` },
          { status: 500 }
        );
      }
    } else if (contractType === 'game' || contractType === 'treasury') {
      detectedType = contractType;
    } else {
      return json(
        { success: false, error: 'Invalid type parameter. Must be "game", "treasury", or "auto".' },
        { status: 400 }
      );
    }

    if (detectedType === 'unknown') {
      return json(
        { success: false, error: 'Could not detect contract type. Contract may not be a valid SlotMachine or YBT.' },
        { status: 400 }
      );
    }

    // Read contract state based on type
    try {
      let data: SerializedGameContractState | SerializedTreasuryContractState;

      if (detectedType === 'game') {
        const gameState = await machineStateReader.readGameContractState(appId);
        data = serializeGameState(gameState);
      } else {
        const treasuryState = await machineStateReader.readTreasuryContractState(appId);
        data = serializeTreasuryState(treasuryState);
      }

      const response: ContractStateResponse = {
        type: detectedType,
        data
      };

      return json(
        { success: true, data: response },
        { status: 200 }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error reading contract state:', { appId, type: detectedType, error: errorMessage });
      return json(
        { success: false, error: `Failed to read contract state: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    if (error instanceof Error && (error.message?.includes('UNAUTHORIZED') || error.message?.includes('FORBIDDEN'))) {
      return json(
        { success: false, error: error.message },
        { status: error.message.includes('UNAUTHORIZED') ? 401 : 403 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in contract state API:', { error: errorMessage });
    return json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
};

/**
 * Serialize GameContractState for JSON response
 * Converts BigInt values to strings for safe JSON serialization
 */
function serializeGameState(state: GameContractState): SerializedGameContractState {
  return {
    type: 'game',
    appId: state.appId,
    contractAddress: state.contractAddress,
    owner: state.owner,
    bootstrapped: state.bootstrapped,
    balanceTotal: state.balanceTotal.toString(),
    balanceAvailable: state.balanceAvailable.toString(),
    balanceLocked: state.balanceLocked.toString(),
    balanceFuse: state.balanceFuse,
    modeEnabled: state.modeEnabled,
    contractRefs: state.contractRefs,
    feeConfig: state.feeConfig,
    detectedVersion: state.detectedVersion
  };
}

/**
 * Serialize TreasuryContractState for JSON response
 * Converts BigInt values to strings for safe JSON serialization
 */
function serializeTreasuryState(state: TreasuryContractState): SerializedTreasuryContractState {
  return {
    type: 'treasury',
    appId: state.appId,
    contractAddress: state.contractAddress,
    owner: state.owner,
    bootstrapped: state.bootstrapped,
    name: state.name,
    symbol: state.symbol,
    decimals: state.decimals,
    totalSupply: state.totalSupply.toString(),
    yieldBearingSource: state.yieldBearingSource
  };
}
