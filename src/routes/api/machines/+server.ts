/**
 * Public Machines API
 * List active game machines for players
 * Replaces /api/games/slot-configs
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import type { ApiResponse } from '$lib/types/admin';
import type { MachineType, MachineStatus } from '$lib/types/database';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const chain = url.searchParams.get('chain') as 'base' | 'voi' | 'solana' | null;
    const machineType = url.searchParams.get('machine_type') as MachineType | null;
    const gameContractId = url.searchParams.get('game_contract_id');

    // Special case: test-mode returns a minimal mock config
    // This allows games to load in the testing suite without a real contract
    if (gameContractId === 'test-mode') {
      return json<ApiResponse<Record<string, unknown>>>(
        {
          success: true,
          data: {
            game_contract_id: 'test-mode',
            chain: 'voi',
            machine_type: 'slots_w2w',
            status: 'active',
            is_active: true,
            min_bet: 40,
            max_bet: 60,
            rtp_target: 96.5,
            house_edge: 3.5,
            config: {},
          },
        },
        { status: 200 }
      );
    }

    const supabase = createAdminClient();

    // Build query - only return active machines
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

    // Filter by machine_type if specified
    if (machineType) {
      query = query.eq('machine_type', machineType);
    }

    // Filter by game_contract_id if specified (for single machine lookup)
    if (gameContractId) {
      query = query.eq('game_contract_id', gameContractId).single();
    }

    const { data: machines, error } = await query;

    if (error) {
      // If single machine requested and not found, return null
      if (gameContractId && error.code === 'PGRST116') {
        return json<ApiResponse<null>>({ success: true, data: null }, { status: 200 });
      }
      console.error('Error fetching machines:', error);
      return json<ApiResponse>({ success: false, error: 'Failed to fetch machines' }, { status: 500 });
    }

    // If single machine requested, return it directly with all fields
    if (gameContractId) {
      const machine = machines as Record<string, unknown>;

      if (!machine || !machine.machine_type) {
        console.error('API: Machine missing machine_type or machine is null:', {
          game_contract_id: machine?.game_contract_id,
          id: machine?.id,
          machine,
        });
        return json<ApiResponse>(
          {
            success: false,
            error: `Machine configuration for contract ${gameContractId} is missing machine_type field`,
          },
          { status: 500 }
        );
      }

      return json<ApiResponse<typeof machine>>({ success: true, data: machine }, { status: 200 });
    }

    // Format response - include fields for public consumption
    const publicMachines = (machines || []).map((machine: Record<string, unknown>) => ({
      id: machine.id,
      name: machine.name,
      display_name: machine.display_name,
      description: machine.description,
      theme: machine.theme,
      machine_type: machine.machine_type,
      chain: machine.chain,
      game_contract_id: machine.game_contract_id,
      treasury_contract_id: machine.treasury_contract_id,
      rtp_target: machine.rtp_target,
      house_edge: machine.house_edge,
      min_bet: machine.min_bet,
      max_bet: machine.max_bet,
      config: machine.config,
      launched_at: machine.launched_at,
    }));

    return json<ApiResponse<typeof publicMachines>>({ success: true, data: publicMachines }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error in public machines API:', error);
    return json<ApiResponse>({ success: false, error: 'Internal server error' }, { status: 500 });
  }
};
