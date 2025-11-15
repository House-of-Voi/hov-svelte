/**
 * Blockchain Adapters
 *
 * Export all available adapters for different blockchain networks.
 */

export { MockSlotMachineAdapter } from './MockSlotMachineAdapter';
export type { MockAdapterConfig } from './MockSlotMachineAdapter';

export { VoiFiveReelAdapter } from './VoiFiveReelAdapter';
export type { VoiAdapterConfig } from './VoiFiveReelAdapter';

export { VoiW2WAdapter } from './VoiW2WAdapter';
export type { VoiW2WAdapterConfig } from './VoiW2WAdapter';

// Legacy export for backward compatibility
export { VoiFiveReelAdapter as VoiSlotMachineAdapter } from './VoiFiveReelAdapter';

// Adapter Factory
export { AdapterFactory, getAdapterFactory, resetAdapterFactory } from './AdapterFactory';
export type { AdapterFactoryConfig } from './AdapterFactory';
