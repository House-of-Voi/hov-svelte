/**
 * @deprecated This file is deprecated. Use machineService.ts instead.
 * This file re-exports from machineService.ts for backwards compatibility.
 *
 * Migration guide:
 * - Replace `import { gameConfigService } from '$lib/services/gameConfigService'`
 *   with `import { machineService } from '$lib/services/machineService'`
 * - Replace `GameConfig` type with `MachineConfig`
 * - Replace `SlotGameType` with `MachineType`
 * - Update method calls:
 *   - getConfigByContractId() -> getMachineByContractId()
 *   - getAllActiveConfigs() -> getAllActiveMachines()
 *   - getConfigsByGameType() -> getMachinesByType()
 */

export {
  machineService as gameConfigService,
  MachineService as GameConfigService,
  type MachineConfig as GameConfig,
  type MachineType,
  type MachineStatus,
} from './machineService';

// Legacy type alias
export type SlotGameType = '5reel' | 'w2w';
