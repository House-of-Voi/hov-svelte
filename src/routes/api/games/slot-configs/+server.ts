/**
 * Public Slot Machine Configs API
 * @deprecated Use /api/machines instead. This endpoint queries from the new machines table
 * but maintains backwards compatibility with legacy field names.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import type { ApiResponse } from '$lib/types/admin';

// Map new machine_type values to legacy game_type values
function mapMachineTypeToGameType(machineType: string): string {
  switch (machineType) {
    case 'slots_5reel':
      return '5reel';
    case 'slots_w2w':
      return 'w2w';
    default:
      return machineType;
  }
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const chain = url.searchParams.get('chain') as 'base' | 'voi' | 'solana' | null;
    const contractId = url.searchParams.get('contract_id');

    // Special case: test-mode returns a minimal mock config
    // This allows games to load in the testing suite without a real contract
    if (contractId === 'test-mode') {
      return json<ApiResponse<Record<string, unknown>>>(
        {
          success: true,
          data: {
            contract_id: 'test-mode',
            chain: 'voi',
            game_type: 'w2w', // Legacy format
            is_active: true,
            min_bet: 40,
            max_bet: 60,
            rtp_target: 96.5,
            house_edge: 3.5,
          },
        },
        { status: 200 }
      );
    }

    const supabase = createAdminClient();

    // Build query - now uses machines table
    let query = supabase
      .from('machines')
      .select('*')
      .eq('is_active', true)
      .eq('status', 'active')
      .order('launched_at', { ascending: false });

    // Filter by chain if specified
    if (chain) {
      query = query.eq('chain', chain);
    }

    // Filter by contract_id if specified (for single config lookup)
    // Maps to game_contract_id in new schema
    if (contractId) {
      query = query.eq('game_contract_id', contractId).single();
    }

    const { data: configs, error } = await query;

    if (error) {
      // If single config requested and not found, return null
      if (contractId && error.code === 'PGRST116') {
        return json<ApiResponse<null>>({ success: true, data: null }, { status: 200 });
      }
      console.error('Error fetching slot machine configs:', error);
      return json<ApiResponse>({ success: false, error: 'Failed to fetch games' }, { status: 500 });
    }

    // If single config requested, return it with legacy field mappings
    if (contractId) {
      const machine = configs as Record<string, unknown>;

      if (!machine || !machine.machine_type) {
        console.error('API: Machine missing machine_type or machine is null:', {
          game_contract_id: machine?.game_contract_id,
          id: machine?.id,
        });
        return json<ApiResponse>(
          { success: false, error: `Game configuration for contract ${contractId} is missing type field` },
          { status: 500 }
        );
      }

      // Map to legacy field names for backwards compatibility
      const legacyConfig = {
        ...machine,
        contract_id: machine.game_contract_id,
        ybt_app_id: machine.treasury_contract_id,
        ybt_asset_id: machine.treasury_asset_id,
        game_type: mapMachineTypeToGameType(machine.machine_type as string),
        reel_config: machine.config,
        max_paylines: (machine.config as Record<string, unknown>)?.paylines?.length ?? 20,
        treasury_address: machine.platform_treasury_address,
      };

      return json<ApiResponse<typeof legacyConfig>>({ success: true, data: legacyConfig }, { status: 200 });
    }

    // Format response with legacy field names for public consumption
    const publicConfigs = (configs || []).map((machine: Record<string, unknown>) => ({
      id: machine.id,
      name: machine.name,
      display_name: machine.display_name,
      description: machine.description,
      theme: machine.theme,
      contract_id: machine.game_contract_id,
      chain: machine.chain,
      game_type: mapMachineTypeToGameType(machine.machine_type as string),
      rtp_target: machine.rtp_target,
      house_edge: machine.house_edge,
      min_bet: machine.min_bet,
      max_bet: machine.max_bet,
      max_paylines: (machine.config as Record<string, unknown>)?.paylines?.length ?? 20,
      launched_at: machine.launched_at,
    }));

    return json<ApiResponse<typeof publicConfigs>>({ success: true, data: publicConfigs }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error in public slot configs API:', error);
    return json<ApiResponse>({ success: false, error: 'Internal server error' }, { status: 500 });
  }
};
