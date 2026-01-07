/**
 * Contract Registry
 *
 * Maps machine types and versions to their corresponding contract specifications.
 * This allows the deployer to dynamically select the correct contract client
 * based on the machine configuration.
 *
 * Structure:
 * - Game contracts: (machine_type, version) → ContractSpec
 * - Treasury contracts: version → ContractSpec
 *
 * When adding new contract versions:
 * 1. Import the new client's APP_SPEC
 * 2. Add an entry to the appropriate registry map
 * 3. Update the LATEST_VERSION constants if this is the newest version
 */

import type { AppSpec } from '@algorandfoundation/algokit-utils/types/app-spec';
import type { MachineType } from '$lib/types/database';

// Import contract APP_SPECs
import { APP_SPEC as SlotMachineW2W_v1 } from '$lib/clients/SlotMachineClientW2W';
import { APP_SPEC as YieldBearingToken_v1 } from '$lib/voi/house/YieldBearingTokenClient';

/**
 * Contract specification containing everything needed to deploy and interact
 * with a contract.
 */
export interface ContractSpec {
  /** The AlgoKit APP_SPEC with approval/clear programs and ABI */
  appSpec: AppSpec;
  /** Human-readable name for display */
  displayName: string;
  /** Brief description of this contract version */
  description: string;
  /** Whether this version supports upgrades */
  upgradeable: boolean;
  /** Minimum network version required (optional) */
  minNetworkVersion?: string;
  /** Bootstrap cost in microVOI (payment required for bootstrap call) */
  bootstrapCost: bigint;
  /** Additional box storage cost estimate in microVOI */
  boxStorageCost?: bigint;
}

/**
 * Registry key for game contracts
 */
export interface GameContractKey {
  machineType: MachineType;
  version: number;
}

/**
 * Latest versions for each contract type
 */
export const LATEST_GAME_VERSIONS: Record<MachineType, number> = {
  slots_w2w: 1,
  slots_5reel: 1, // Not yet implemented
  keno: 1, // Not yet implemented
  roulette: 1 // Not yet implemented
};

export const LATEST_TREASURY_VERSION = 1;

/**
 * Game contract registry
 * Maps (machine_type, version) → ContractSpec
 */
const gameContractRegistry: Map<string, ContractSpec> = new Map();

// Helper to create registry key
function makeGameKey(machineType: MachineType, version: number): string {
  return `${machineType}:v${version}`;
}

// Register SlotMachine W2W v1
// Bootstrap cost: min_balance (100,000) + ownable_bootstrap_cost (17,300) + box storage
// See contract.py Ownable._bootstrap_cost() and BOX_COST_BALANCE (28,500)
gameContractRegistry.set(makeGameKey('slots_w2w', 1), {
  appSpec: SlotMachineW2W_v1,
  displayName: 'Slot Machine (Ways to Win) v1',
  description: 'Ways to Win slot machine with 5 reels and configurable paylines',
  upgradeable: true,
  bootstrapCost: 135_000n, // 100,000 min_balance + 17,300 ownable + 17,700 buffer
  boxStorageCost: 28_500n // BOX_COST_BALANCE for owner box
});

// Future: Register SlotMachine 5Reel v1
// gameContractRegistry.set(makeGameKey('slots_5reel', 1), {
//   appSpec: SlotMachine5Reel_v1,
//   displayName: 'Slot Machine (5-Reel) v1',
//   description: 'Classic 5-reel slot machine with fixed paylines',
//   upgradeable: true
// });

/**
 * Treasury contract registry
 * Maps version → ContractSpec
 */
const treasuryContractRegistry: Map<number, ContractSpec> = new Map();

// Register YieldBearingToken v1
// Bootstrap cost: min_balance (100,000) for basic setup
// See YieldBearingTokenClient.ts APP_SPEC for schema requirements
treasuryContractRegistry.set(1, {
  appSpec: YieldBearingToken_v1,
  displayName: 'Yield Bearing Token v1',
  description: 'ARC200-compatible token for house pool deposits with yield distribution',
  upgradeable: true,
  bootstrapCost: 100_000n // min_balance for bootstrap
});

/**
 * Get a game contract spec by machine type and version
 *
 * @param machineType - The type of game machine
 * @param version - The contract version (defaults to latest)
 * @returns The contract spec or null if not found
 */
export function getGameContractSpec(
  machineType: MachineType,
  version?: number
): ContractSpec | null {
  const v = version ?? LATEST_GAME_VERSIONS[machineType];
  const key = makeGameKey(machineType, v);
  return gameContractRegistry.get(key) ?? null;
}

/**
 * Get a treasury contract spec by version
 *
 * @param version - The contract version (defaults to latest)
 * @returns The contract spec or null if not found
 */
export function getTreasuryContractSpec(version?: number): ContractSpec | null {
  const v = version ?? LATEST_TREASURY_VERSION;
  return treasuryContractRegistry.get(v) ?? null;
}

/**
 * Check if a game contract version exists
 */
export function gameContractVersionExists(
  machineType: MachineType,
  version: number
): boolean {
  return gameContractRegistry.has(makeGameKey(machineType, version));
}

/**
 * Check if a treasury contract version exists
 */
export function treasuryContractVersionExists(version: number): boolean {
  return treasuryContractRegistry.has(version);
}

/**
 * Get all available versions for a machine type
 */
export function getAvailableGameVersions(machineType: MachineType): number[] {
  const versions: number[] = [];
  for (const key of gameContractRegistry.keys()) {
    if (key.startsWith(`${machineType}:`)) {
      const match = key.match(/:v(\d+)$/);
      if (match) {
        versions.push(parseInt(match[1], 10));
      }
    }
  }
  return versions.sort((a, b) => a - b);
}

/**
 * Get all available treasury versions
 */
export function getAvailableTreasuryVersions(): number[] {
  return Array.from(treasuryContractRegistry.keys()).sort((a, b) => a - b);
}

/**
 * Extract state schema from an AppSpec
 * Used for building application create transactions
 */
export function getStateSchema(appSpec: AppSpec): {
  globalByteSlices: number;
  globalUints: number;
  localByteSlices: number;
  localUints: number;
} {
  const state = appSpec.state as {
    global?: { num_byte_slices?: number; num_uints?: number };
    local?: { num_byte_slices?: number; num_uints?: number };
  };

  return {
    globalByteSlices: state?.global?.num_byte_slices ?? 0,
    globalUints: state?.global?.num_uints ?? 0,
    localByteSlices: state?.local?.num_byte_slices ?? 0,
    localUints: state?.local?.num_uints ?? 0
  };
}

/**
 * Get compiled TEAL programs from an AppSpec
 * Returns base64-encoded approval and clear programs
 */
export function getCompiledPrograms(appSpec: AppSpec): {
  approvalProgram: string;
  clearProgram: string;
} {
  const source = appSpec.source as {
    approval?: string;
    clear?: string;
  };

  if (!source?.approval || !source?.clear) {
    throw new Error('AppSpec missing compiled source programs');
  }

  return {
    approvalProgram: source.approval,
    clearProgram: source.clear
  };
}
