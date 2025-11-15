/**
 * Adapter Factory
 *
 * Creates the appropriate blockchain adapter based on game configuration.
 * Supports 5reel (traditional paylines) and w2w (ways-to-win) game types.
 */

import { VoiFiveReelAdapter } from './VoiFiveReelAdapter';
import type { VoiAdapterConfig } from './VoiFiveReelAdapter';
import { VoiW2WAdapter } from './VoiW2WAdapter';
import type { VoiW2WAdapterConfig } from './VoiW2WAdapter';
import type { BlockchainAdapter } from '../SlotMachineEngine';
import type { GameConfig } from '$lib/services/gameConfigService';
import { logger } from '$lib/utils/logger';

/**
 * Factory configuration
 */
export interface AdapterFactoryConfig {
  algodUrl?: string;
  algodToken?: string;
  indexerUrl?: string;
  network?: 'mainnet' | 'testnet' | 'betanet';
}

/**
 * Adapter Factory
 * Creates blockchain adapters based on game configuration
 */
export class AdapterFactory {
  private config: AdapterFactoryConfig;
  private log = logger.scope('AdapterFactory');

  constructor(config: AdapterFactoryConfig = {}) {
    this.config = config;
  }

  /**
   * Create an adapter based on game configuration
   */
  createAdapter(gameConfig: GameConfig, walletSigner?: any): BlockchainAdapter {
    this.log.info('Creating adapter', {
      game_type: gameConfig.game_type,
      contract_id: gameConfig.contract_id.toString(),
      name: gameConfig.name
    });

    const baseAdapterConfig: VoiAdapterConfig = {
      algodUrl: this.config.algodUrl,
      algodToken: this.config.algodToken,
      indexerUrl: this.config.indexerUrl,
      network: this.config.network || 'mainnet',
      contractId: gameConfig.contract_id,
      walletSigner
    };

    switch (gameConfig.game_type) {
      case '5reel':
        this.log.info('Creating 5reel adapter');
        return new VoiFiveReelAdapter(baseAdapterConfig);

      case 'w2w':
        this.log.info('Creating w2w adapter');
        const w2wConfig: VoiW2WAdapterConfig = {
          algodUrl: this.config.algodUrl,
          algodToken: this.config.algodToken,
          indexerUrl: this.config.indexerUrl,
          network: this.config.network || 'mainnet',
          contractId: gameConfig.contract_id,
          walletSigner,
        };
        return new VoiW2WAdapter(w2wConfig);

      default:
        throw new Error(
          `Unsupported game type: ${gameConfig.game_type}. Supported types: 5reel, w2w`
        );
    }
  }

  /**
   * Create an adapter directly from contract ID
   * (requires querying database)
   */
  async createAdapterFromContractId(
    contractId: bigint | string,
    gameConfigService: any,
    walletSigner?: any
  ): Promise<BlockchainAdapter> {
    this.log.info('Creating adapter from contract ID', {
      contract_id: contractId.toString()
    });

    const gameConfig = await gameConfigService.getConfigByContractId(contractId);

    if (!gameConfig) {
      throw new Error(`No active game configuration found for contract ${contractId}`);
    }

    if (!gameConfig.is_active) {
      throw new Error(`Game configuration for contract ${contractId} is not active`);
    }

    return this.createAdapter(gameConfig, walletSigner);
  }

  /**
   * Update factory configuration
   */
  updateConfig(newConfig: Partial<AdapterFactoryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): AdapterFactoryConfig {
    return { ...this.config };
  }
}

/**
 * Create a singleton factory instance with default configuration
 */
let defaultFactory: AdapterFactory | null = null;

export function getAdapterFactory(config?: AdapterFactoryConfig): AdapterFactory {
  if (!defaultFactory || config) {
    defaultFactory = new AdapterFactory(config);
  }
  return defaultFactory;
}

/**
 * Reset the default factory (useful for testing)
 */
export function resetAdapterFactory(): void {
  defaultFactory = null;
}
