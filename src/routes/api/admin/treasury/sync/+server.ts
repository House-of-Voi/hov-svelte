/**
 * Treasury Sync API
 * Fetches on-chain treasury balances from Voi contracts and updates local database
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { requirePermission, getCurrentProfileId, PERMISSIONS } from '$lib/auth/admin';
import { getContractBalances } from '$lib/voi/contract-client';
import { env } from '$lib/utils/env';
import type { ApiResponse, TreasuryItem } from '$lib/types/admin';

interface SyncResult {
  updated: number;
  treasuries: TreasuryItem[];
  timestamp: string;
  errors?: string[];
}

export const POST: RequestHandler = async ({ cookies }) => {
  try {
    const profileId = await getCurrentProfileId(cookies);
    await requirePermission(cookies, PERMISSIONS.MANAGE_TREASURY, profileId ?? undefined);

    // Check if Voi configuration is available
    if (!env.PUBLIC_VOI_NODE_URL) {
      return json<ApiResponse>(
        {
          success: false,
          error: 'Voi network not configured. Set PUBLIC_VOI_NODE_URL in environment.'
        },
        { status: 503 }
      );
    }

    const supabase = createAdminClient();

    // Fetch all Voi machines from the machines table
    const { data: machines, error: fetchError } = await supabase
      .from('machines')
      .select('game_contract_id, chain, display_name')
      .eq('chain', 'voi')
      .eq('is_active', true);

    if (fetchError) {
      console.error('Failed to fetch machines from database:', fetchError);
      return json<ApiResponse>(
        { success: false, error: 'Failed to fetch machines from database' },
        { status: 500 }
      );
    }

    if (!machines || machines.length === 0) {
      return json<ApiResponse>(
        {
          success: false,
          error: 'No active Voi machines found in database. Add machines to machines table first.'
        },
        { status: 404 }
      );
    }

    // Sync each machine contract
    let updatedCount = 0;
    const errors: string[] = [];

    for (const machine of machines) {
      try {
        const appId = Number(machine.game_contract_id);

        if (isNaN(appId) || appId <= 0) {
          errors.push(`Invalid game_contract_id for ${machine.display_name}: ${machine.game_contract_id}`);
          continue;
        }

        // Fetch on-chain balances for this contract
        const balances = await getContractBalances({ appId });

        // Update/insert treasury record
        const treasuryData = {
          contract_id: machine.game_contract_id.toString(),
          chain: machine.chain,
          game_type: 'slots' as const,
          game_name: machine.display_name,
          balance: balances.balanceTotal.toString(),
          reserved: balances.balanceLocked.toString(),
          updated_at: new Date().toISOString(),
        };

        const { error: upsertError } = await supabase
          .from('treasury_balances')
          .upsert(treasuryData, {
            onConflict: 'contract_id',
            ignoreDuplicates: false
          });

        if (upsertError) {
          errors.push(`Failed to update ${machine.display_name}: ${upsertError.message}`);
        } else {
          updatedCount++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to sync ${machine.display_name}: ${errorMsg}`);
        console.error(`Error syncing contract ${machine.game_contract_id}:`, error);
      }
    }

    // Fetch all treasury balances to return
    const { data: allTreasuries } = await supabase
      .from('treasury_balances')
      .select('*')
      .order('game_name', { ascending: true });

    // Format treasury items with calculated available balance
    const treasuries: TreasuryItem[] = (allTreasuries || []).map(t => ({
      contract_id: t.contract_id,
      chain: t.chain,
      game_type: t.game_type,
      game_name: t.game_name,
      balance: t.balance,
      reserved: t.reserved,
      available: (parseFloat(t.balance || '0') - parseFloat(t.reserved || '0')).toString(),
      updated_at: t.updated_at,
    }));

    const result: SyncResult = {
      updated: updatedCount,
      treasuries,
      timestamp: new Date().toISOString(),
      ...(errors.length > 0 && { errors }),
    };

    return json<ApiResponse<SyncResult>>(
      {
        success: updatedCount > 0,
        data: result,
        ...(errors.length > 0 && { error: `${updatedCount} updated, ${errors.length} failed` })
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Error syncing treasury:', error);

    if (error instanceof Error && (error.message?.includes('UNAUTHORIZED') || error.message?.includes('FORBIDDEN'))) {
      return json<ApiResponse>(
        { success: false, error: error.message },
        { status: error.message.includes('UNAUTHORIZED') ? 401 : 403 }
      );
    }

    return json<ApiResponse>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
};
