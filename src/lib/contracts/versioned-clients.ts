/**
 * Versioned Contract Client Registry
 *
 * Maps machine types and contract versions to their correct ABI specifications.
 * This enables the system to work with multiple contract versions.
 *
 * Version Mapping:
 * - slots_w2w v1: Original W2W contract (has bootstrap, post_update)
 * - slots_w2w v2: Newer W2W contract (has grant_delegate, participate, no bootstrap)
 * - slots_5reel v1: Traditional 5-reel payline slots
 * - YBT v1: Original Yield Bearing Token
 * - YBT v2: Newer Yield Bearing Token for W2W v2
 */

import type { MachineType } from '$lib/types/database';

// Import APP_SPEC from each client
import { APP_SPEC as SlotMachineW2W_v1_Spec } from '$lib/clients/SlotMachineClientW2W';
import { APP_SPEC as SlotMachineW2W_v2_Spec } from '$lib/clients/SlotMachineClientW2W_v2';
import { APP_SPEC as YBT_v1_Spec } from '$lib/voi/house/YieldBearingTokenClient';
import { APP_SPEC as YBT_v2_Spec } from '$lib/clients/YieldBearingTokenClient_v2';

/**
 * Contract type categories
 */
export type ContractType = 'game' | 'treasury';

/**
 * Get the ABI specification for a game contract
 *
 * @param machineType - The type of machine (slots_5reel, slots_w2w, keno, roulette)
 * @param version - The contract version number
 * @returns The ABI specification for the contract
 * @throws Error if no ABI is available for the specified type/version
 */
export function getGameContractABI(machineType: MachineType, version: number): unknown {
  const key = `${machineType}:${version}`;

  switch (key) {
    case 'slots_w2w:1':
      return {
        name: "Slot Machine W2W v1",
        desc: "Ways to Win slot machine contract (v1)",
        methods: SlotMachineW2W_v1_Spec.contract.methods,
        events: []
      };

    case 'slots_w2w:2':
      return {
        name: "Slot Machine W2W v2",
        desc: "Ways to Win slot machine contract (v2)",
        methods: SlotMachineW2W_v2_Spec.contract.methods,
        events: []
      };

    case 'slots_5reel:1':
      // 5-reel currently uses same ABI structure as W2W v1
      // TODO: Add dedicated 5-reel client when available
      return {
        name: "Slot Machine 5-Reel v1",
        desc: "5-reel payline slot machine contract (v1)",
        methods: SlotMachineW2W_v1_Spec.contract.methods,
        events: []
      };

    default:
      throw new Error(`No game contract ABI available for ${machineType} version ${version}`);
  }
}

/**
 * Get the ABI specification for a treasury contract
 *
 * @param version - The contract version number
 * @returns The ABI specification for the contract
 * @throws Error if no ABI is available for the specified version
 */
export function getTreasuryContractABI(version: number): unknown {
  switch (version) {
    case 1:
      return {
        name: "Yield Bearing Token v1",
        desc: "Treasury contract for house pool management (v1)",
        methods: YBT_v1_Spec.contract.methods,
        events: []
      };

    case 2:
      return {
        name: "Yield Bearing Token v2",
        desc: "Treasury contract for house pool management (v2)",
        methods: YBT_v2_Spec.contract.methods,
        events: []
      };

    default:
      throw new Error(`No treasury contract ABI available for version ${version}`);
  }
}

/**
 * Get the APP_SPEC for a game contract (for deployment)
 *
 * @param machineType - The type of machine
 * @param version - The contract version number
 * @returns The full APP_SPEC for deployment
 */
export function getGameContractAppSpec(machineType: MachineType, version: number): unknown {
  const key = `${machineType}:${version}`;

  switch (key) {
    case 'slots_w2w:1':
      return SlotMachineW2W_v1_Spec;

    case 'slots_w2w:2':
      return SlotMachineW2W_v2_Spec;

    case 'slots_5reel:1':
      // TODO: Add dedicated 5-reel APP_SPEC
      return SlotMachineW2W_v1_Spec;

    default:
      throw new Error(`No game contract APP_SPEC available for ${machineType} version ${version}`);
  }
}

/**
 * Get the APP_SPEC for a treasury contract (for deployment)
 *
 * @param version - The contract version number
 * @returns The full APP_SPEC for deployment
 */
export function getTreasuryContractAppSpec(version: number): unknown {
  switch (version) {
    case 1:
      return YBT_v1_Spec;

    case 2:
      return YBT_v2_Spec;

    default:
      throw new Error(`No treasury contract APP_SPEC available for version ${version}`);
  }
}

/**
 * Check if a game contract version is supported
 */
export function isGameVersionSupported(machineType: MachineType, version: number): boolean {
  const supportedVersions: Record<MachineType, number[]> = {
    'slots_w2w': [1, 2],
    'slots_5reel': [1],
    'keno': [],      // Not yet implemented
    'roulette': []   // Not yet implemented
  };

  return supportedVersions[machineType]?.includes(version) ?? false;
}

/**
 * Check if a treasury contract version is supported
 */
export function isTreasuryVersionSupported(version: number): boolean {
  return [1, 2].includes(version);
}

/**
 * Get the latest supported version for a machine type
 */
export function getLatestGameVersion(machineType: MachineType): number {
  const latestVersions: Record<MachineType, number> = {
    'slots_w2w': 2,
    'slots_5reel': 1,
    'keno': 0,       // Not yet implemented
    'roulette': 0    // Not yet implemented
  };

  return latestVersions[machineType] ?? 0;
}

/**
 * Get the latest supported treasury version
 */
export function getLatestTreasuryVersion(): number {
  return 2;
}
