/**
 * Machine Service
 * Queries the machines table from Supabase to get game/machine configuration
 * Replaces the old gameConfigService.ts
 */

import { supabaseBrowser } from '$lib/db/supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Machine, MachineType, MachineStatus } from '$lib/types/database';

/**
 * Extended machine config with BigInt conversions for contract use
 */
export interface MachineConfig extends Omit<Machine, 'min_bet' | 'max_bet' | 'game_contract_id' | 'treasury_contract_id'> {
  min_bet: bigint;
  max_bet: bigint;
  game_contract_id: bigint | null;
  treasury_contract_id: bigint | null;
}

class MachineService {
  private supabase: SupabaseClient;
  private cache: Map<string, MachineConfig> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(supabaseClient?: SupabaseClient) {
    this.supabase = supabaseClient || supabaseBrowser;
  }

  /**
   * Get machine by game contract ID
   * Uses API endpoint in browser to bypass RLS issues
   */
  async getMachineByContractId(contractId: bigint | string | number): Promise<MachineConfig | null> {
    const contractIdStr = contractId.toString();

    // Check cache first
    const cached = this.getFromCache(`contract:${contractIdStr}`);
    if (cached) {
      return cached;
    }

    try {
      // In browser, use API endpoint to bypass RLS issues
      if (typeof window !== 'undefined') {
        const response = await fetch(`/api/machines?game_contract_id=${contractIdStr}`);

        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
          throw new Error(`Failed to fetch machine: ${response.statusText}`);
        }

        const result = await response.json();

        if (!result.success || !result.data) {
          return null;
        }

        const config = this.transformToMachineConfig(result.data);
        this.setCache(`contract:${contractIdStr}`, config);
        return config;
      }

      // Server-side: use direct Supabase query
      const { data, error } = await this.supabase
        .from('machines')
        .select('*')
        .eq('game_contract_id', contractIdStr)
        .eq('status', 'active')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        console.error('Error fetching machine:', error);
        throw error;
      }

      if (!data) {
        return null;
      }

      const config = this.transformToMachineConfig(data);
      this.setCache(`contract:${contractIdStr}`, config);
      return config;
    } catch (error) {
      console.error('Failed to fetch machine:', error);
      throw error;
    }
  }

  /**
   * Get machine by database ID
   */
  async getMachineById(id: string): Promise<MachineConfig | null> {
    const cached = this.getFromCache(`id:${id}`);
    if (cached) {
      return cached;
    }

    try {
      const { data, error } = await this.supabase
        .from('machines')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        console.error('Error fetching machine by ID:', error);
        throw error;
      }

      if (!data) {
        return null;
      }

      const config = this.transformToMachineConfig(data);
      this.setCache(`id:${id}`, config);
      return config;
    } catch (error) {
      console.error('Failed to fetch machine by ID:', error);
      throw error;
    }
  }

  /**
   * Get all active machines
   */
  async getAllActiveMachines(): Promise<MachineConfig[]> {
    try {
      const { data, error } = await this.supabase
        .from('machines')
        .select('*')
        .eq('is_active', true)
        .eq('status', 'active')
        .order('launched_at', { ascending: false });

      if (error) {
        console.error('Error fetching all machines:', error);
        throw error;
      }

      if (!data) {
        return [];
      }

      return data.map((row) => this.transformToMachineConfig(row));
    } catch (error) {
      console.error('Failed to fetch all machines:', error);
      throw error;
    }
  }

  /**
   * Get machines filtered by type
   */
  async getMachinesByType(machineType: MachineType): Promise<MachineConfig[]> {
    try {
      const { data, error } = await this.supabase
        .from('machines')
        .select('*')
        .eq('machine_type', machineType)
        .eq('is_active', true)
        .eq('status', 'active')
        .order('launched_at', { ascending: false });

      if (error) {
        console.error('Error fetching machines by type:', error);
        throw error;
      }

      if (!data) {
        return [];
      }

      return data.map((row) => this.transformToMachineConfig(row));
    } catch (error) {
      console.error('Failed to fetch machines by type:', error);
      throw error;
    }
  }

  /**
   * Get machines filtered by status
   */
  async getMachinesByStatus(status: MachineStatus): Promise<MachineConfig[]> {
    try {
      const { data, error } = await this.supabase
        .from('machines')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching machines by status:', error);
        throw error;
      }

      if (!data) {
        return [];
      }

      return data.map((row) => this.transformToMachineConfig(row));
    } catch (error) {
      console.error('Failed to fetch machines by status:', error);
      throw error;
    }
  }

  /**
   * Check if a contract ID exists and is active
   */
  async isContractActive(contractId: bigint | string | number): Promise<boolean> {
    const machine = await this.getMachineByContractId(contractId);
    return machine !== null && machine.is_active && machine.status === 'active';
  }

  /**
   * Transform raw database row to MachineConfig with BigInt conversions
   */
  private transformToMachineConfig(row: Record<string, unknown>): MachineConfig {
    return {
      id: row.id as string,
      name: row.name as string,
      display_name: row.display_name as string,
      description: row.description as string | undefined,
      theme: row.theme as string | undefined,
      machine_type: row.machine_type as MachineType,
      chain: row.chain as 'voi' | 'base' | 'solana',
      game_contract_id: row.game_contract_id ? BigInt(row.game_contract_id as number) : null,
      treasury_contract_id: row.treasury_contract_id ? BigInt(row.treasury_contract_id as number) : null,
      treasury_asset_id: row.treasury_asset_id as number | undefined,
      config: row.config as Record<string, unknown>,
      rtp_target: row.rtp_target ? Number(row.rtp_target) : undefined,
      house_edge: row.house_edge ? Number(row.house_edge) : undefined,
      min_bet: BigInt(row.min_bet as number),
      max_bet: BigInt(row.max_bet as number),
      platform_fee_percent: Number(row.platform_fee_percent ?? 0),
      platform_treasury_address: row.platform_treasury_address as string | undefined,
      status: row.status as MachineStatus,
      is_active: row.is_active as boolean,
      version: row.version as number,
      created_by: row.created_by as string | undefined,
      deployment_tx_id: row.deployment_tx_id as string | undefined,
      deployment_error: row.deployment_error as string | undefined,
      deployment_started_at: row.deployment_started_at as string | undefined,
      deployment_completed_at: row.deployment_completed_at as string | undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      launched_at: row.launched_at as string | undefined,
      deprecated_at: row.deprecated_at as string | undefined,
    };
  }

  /**
   * Get from cache if not expired
   */
  private getFromCache(key: string): MachineConfig | null {
    const cached = this.cache.get(key);
    const expiry = this.cacheExpiry.get(key);

    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    // Clear expired cache
    if (cached) {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
    }

    return null;
  }

  /**
   * Set cache with expiry
   */
  private setCache(key: string, config: MachineConfig): void {
    this.cache.set(key, config);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
  }

  /**
   * Clear cache for a specific key or all
   */
  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
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
export const machineService = new MachineService();

// Export class for server-side instantiation with admin client
export { MachineService };

// Re-export types for convenience
export type { MachineType, MachineStatus } from '$lib/types/database';

// Legacy exports for backwards compatibility during migration
// TODO: Remove after all code is updated
export { machineService as gameConfigService };
export { MachineService as GameConfigService };
export type { MachineConfig as GameConfig };
