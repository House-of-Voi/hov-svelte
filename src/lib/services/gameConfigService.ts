/**
 * Game Config Service
 * Queries slot_machine_configs from Supabase to determine game type and configuration
 */

import { supabaseBrowser } from '$lib/db/supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SlotGameType = '5reel' | 'w2w';

export interface GameConfig {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  theme: string | null;
  contract_id: bigint;
  game_type: SlotGameType;
  chain: string;
  treasury_address: string | null;
  rtp_target: number;
  house_edge: number;
  min_bet: bigint;
  max_bet: bigint;
  max_paylines: number;
  reel_config: Record<string, any>;
  is_active: boolean;
  launched_at: string;
  deprecated_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

class GameConfigService {
  private supabase: SupabaseClient;
  private cache: Map<string, GameConfig> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(supabaseClient?: SupabaseClient) {
    this.supabase = supabaseClient || supabaseBrowser;
  }

  /**
   * Get game configuration by contract ID
   * Uses API endpoint in browser to bypass RLS issues
   */
  async getConfigByContractId(contractId: bigint | string): Promise<GameConfig | null> {
    const contractIdStr = contractId.toString();

    // Check cache first
    const cached = this.getFromCache(contractIdStr);
    if (cached) {
      return cached;
    }

    try {
      // In browser, use API endpoint to bypass RLS issues
      if (typeof window !== 'undefined') {
        const response = await fetch(`/api/games/slot-configs?contract_id=${contractIdStr}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
          throw new Error(`Failed to fetch game config: ${response.statusText}`);
        }

        const result = await response.json();
        
        if (!result.success || !result.data) {
          return null;
        }

        const data = result.data;

        // Validate and set default for game_type if missing
        // This handles cases where the migration hasn't been run or records are missing the field
        let gameType = data.game_type as SlotGameType;
        if (!gameType) {
          console.warn('GameConfigService: Missing game_type in API response, defaulting to "5reel":', {
            contract_id: data.contract_id,
            id: data.id,
            availableFields: Object.keys(data)
          });
          gameType = '5reel'; // Default to 5reel as per migration
        }

        // Transform to GameConfig type
        const config: GameConfig = {
          id: data.id,
          name: data.name,
          display_name: data.display_name,
          description: data.description,
          theme: data.theme,
          contract_id: BigInt(data.contract_id),
          game_type: gameType,
          chain: data.chain,
          treasury_address: data.treasury_address,
          rtp_target: Number(data.rtp_target),
          house_edge: Number(data.house_edge),
          min_bet: BigInt(data.min_bet),
          max_bet: BigInt(data.max_bet),
          max_paylines: data.max_paylines,
          reel_config: data.reel_config,
          is_active: data.is_active,
          launched_at: data.launched_at,
          deprecated_at: data.deprecated_at,
          version: data.version,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };

        // Cache the result
        this.setCache(contractIdStr, config);

        return config;
      }

      // Server-side: use direct Supabase query
      const { data, error } = await this.supabase
        .from('slot_machine_configs')
        .select('*')
        .eq('contract_id', contractIdStr)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        console.error('Error fetching game config:', error);
        throw error;
      }

      if (!data) {
        return null;
      }

      // Transform to GameConfig type
      const config: GameConfig = {
        id: data.id,
        name: data.name,
        display_name: data.display_name,
        description: data.description,
        theme: data.theme,
        contract_id: BigInt(data.contract_id),
        game_type: data.game_type as SlotGameType,
        chain: data.chain,
        treasury_address: data.treasury_address,
        rtp_target: Number(data.rtp_target),
        house_edge: Number(data.house_edge),
        min_bet: BigInt(data.min_bet),
        max_bet: BigInt(data.max_bet),
        max_paylines: data.max_paylines,
        reel_config: data.reel_config,
        is_active: data.is_active,
        launched_at: data.launched_at,
        deprecated_at: data.deprecated_at,
        version: data.version,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };

      // Cache the result
      this.setCache(contractIdStr, config);

      return config;
    } catch (error) {
      console.error('Failed to fetch game config:', error);
      throw error;
    }
  }

  /**
   * Get all active game configurations
   */
  async getAllActiveConfigs(): Promise<GameConfig[]> {
    try {
      const { data, error } = await this.supabase
        .from('slot_machine_configs')
        .select('*')
        .eq('is_active', true)
        .order('launched_at', { ascending: false });

      if (error) {
        console.error('Error fetching all game configs:', error);
        throw error;
      }

      if (!data) {
        return [];
      }

      return data.map((row: any) => ({
        id: row.id,
        name: row.name,
        display_name: row.display_name,
        description: row.description,
        theme: row.theme,
        contract_id: BigInt(row.contract_id),
        game_type: row.game_type as SlotGameType,
        chain: row.chain,
        treasury_address: row.treasury_address,
        rtp_target: Number(row.rtp_target),
        house_edge: Number(row.house_edge),
        min_bet: BigInt(row.min_bet),
        max_bet: BigInt(row.max_bet),
        max_paylines: row.max_paylines,
        reel_config: row.reel_config,
        is_active: row.is_active,
        launched_at: row.launched_at,
        deprecated_at: row.deprecated_at,
        version: row.version,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    } catch (error) {
      console.error('Failed to fetch all game configs:', error);
      throw error;
    }
  }

  /**
   * Get configs filtered by game type
   */
  async getConfigsByGameType(gameType: SlotGameType): Promise<GameConfig[]> {
    const allConfigs = await this.getAllActiveConfigs();
    return allConfigs.filter((config) => config.game_type === gameType);
  }

  /**
   * Check if a contract ID exists and is active
   */
  async isContractActive(contractId: bigint | string): Promise<boolean> {
    const config = await this.getConfigByContractId(contractId);
    return config !== null && config.is_active;
  }

  /**
   * Get from cache if not expired
   */
  private getFromCache(contractIdStr: string): GameConfig | null {
    const cached = this.cache.get(contractIdStr);
    const expiry = this.cacheExpiry.get(contractIdStr);

    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    // Clear expired cache
    if (cached) {
      this.cache.delete(contractIdStr);
      this.cacheExpiry.delete(contractIdStr);
    }

    return null;
  }

  /**
   * Set cache with expiry
   */
  private setCache(contractIdStr: string, config: GameConfig): void {
    this.cache.set(contractIdStr, config);
    this.cacheExpiry.set(contractIdStr, Date.now() + this.CACHE_TTL);
  }

  /**
   * Clear cache for a specific contract or all
   */
  clearCache(contractId?: bigint | string): void {
    if (contractId) {
      const contractIdStr = contractId.toString();
      this.cache.delete(contractIdStr);
      this.cacheExpiry.delete(contractIdStr);
    } else {
      this.cache.clear();
      this.cacheExpiry.clear();
    }
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

// Export singleton instance (uses browser client by default)
export const gameConfigService = new GameConfigService();

// Export class for server-side instantiation with admin client
export { GameConfigService };
