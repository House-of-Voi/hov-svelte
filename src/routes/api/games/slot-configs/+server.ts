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

    const { data: configs, error } = await query;

    if (error) {
      console.error('Error fetching slot machine configs:', error);
      return json<ApiResponse>(
        { success: false, error: 'Failed to fetch games' },
        { status: 500 }
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
