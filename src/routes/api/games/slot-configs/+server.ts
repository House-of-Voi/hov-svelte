/**
 * Public Slot Machine Configs API
 * List active slot machine configurations for players
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import type { ApiResponse } from '$lib/types/admin';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const chain = url.searchParams.get('chain') as 'base' | 'voi' | 'solana' | null;
    const contractId = url.searchParams.get('contract_id');

    const supabase = createAdminClient();

    // Build query - only return active configs
    let query = supabase
      .from('slot_machine_configs')
      .select('*')
      .eq('is_active', true)
      .order('launched_at', { ascending: false });

    // Filter by chain if specified
    if (chain) {
      query = query.eq('chain', chain);
    }

    // Filter by contract_id if specified (for single config lookup)
    if (contractId) {
      query = query.eq('contract_id', contractId).single();
    }

    const { data: configs, error } = await query;

    if (error) {
      // If single config requested and not found, return null
      if (contractId && error.code === 'PGRST116') {
        return json<ApiResponse<null>>(
          { success: true, data: null },
          { status: 200 }
        );
      }
      console.error('Error fetching slot machine configs:', error);
      return json<ApiResponse>(
        { success: false, error: 'Failed to fetch games' },
        { status: 500 }
      );
    }

    // If single config requested, return it directly with all fields
    if (contractId) {
      const config = configs as any;
      // Log to debug missing game_type
      console.log('API: Returning single config:', {
        contract_id: config?.contract_id,
        id: config?.id,
        game_type: config?.game_type,
        has_game_type: 'game_type' in (config || {}),
        allFields: config ? Object.keys(config) : 'config is null/undefined'
      });
      
      if (!config || !config.game_type) {
        console.error('API: Config missing game_type or config is null:', {
          contract_id: config?.contract_id,
          id: config?.id,
          config: config
        });
        return json<ApiResponse>(
          { success: false, error: `Game configuration for contract ${contractId} is missing game_type field` },
          { status: 500 }
        );
      }
      
      return json<ApiResponse<typeof config>>(
        { success: true, data: config },
        { status: 200 }
      );
    }

    // Format response - only include necessary fields for public consumption
    const publicConfigs = (configs || []).map(config => ({
      id: config.id,
      name: config.name,
      display_name: config.display_name,
      description: config.description,
      theme: config.theme,
      contract_id: config.contract_id,
      chain: config.chain,
      rtp_target: config.rtp_target,
      house_edge: config.house_edge,
      min_bet: config.min_bet,
      max_bet: config.max_bet,
      max_paylines: config.max_paylines,
      launched_at: config.launched_at,
    }));

    return json<ApiResponse<typeof publicConfigs>>(
      { success: true, data: publicConfigs },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Error in public slot configs API:', error);
    return json<ApiResponse>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
};
