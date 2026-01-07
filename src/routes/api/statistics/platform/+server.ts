import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import type { PostgrestError } from '@supabase/supabase-js';

import { appCache } from '$lib/cache/SimpleCache';
import { CacheKeys } from '$lib/cache/keys';
import { CacheTTL } from '$lib/cache/config';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { getPlatformStats, getPlatformStatsByTimestamp } from '$lib/mimir/queries';

const querySchema = z.object({
  contractId: z.coerce.number().int().nonnegative(),
  timeframe: z.enum(['daily', 'all-time']).default('all-time'),
  date: z.string().optional(), // ISO date string for daily timeframe
});

type PlatformStatPayload = Awaited<ReturnType<typeof getPlatformStats>> extends Array<
  infer Item
>
  ? Item
  : never;

interface PlatformStatResponse extends PlatformStatPayload {
  machine_name: string | null;
  machine_id: string | null;
  chain: 'base' | 'voi' | 'solana' | null;
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const query = querySchema.parse({
      contractId: url.searchParams.get('contractId'),
      timeframe: url.searchParams.get('timeframe') ?? undefined,
      date: url.searchParams.get('date') ?? undefined,
    });

    const targetDate = query.timeframe === 'daily'
      ? (query.date ? new Date(query.date) : new Date())
      : null;

    const cacheKey = CacheKeys.platformStats(
      query.contractId,
      query.timeframe,
      targetDate?.toISOString().split('T')[0]
    );

    const cached = appCache.get<PlatformStatResponse[]>(cacheKey);
    if (cached) {
      return json({ ok: true, data: cached, source: 'cache' });
    }

    let mimirStats: Awaited<ReturnType<typeof getPlatformStats>>;

    if (query.timeframe === 'daily' && targetDate) {
      // Use timestamp-based filtering directly on hov_events
      const startOfDay = new Date(targetDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setUTCHours(23, 59, 59, 999);

      const dailyStats = await getPlatformStatsByTimestamp(
        query.contractId,
        startOfDay,
        endOfDay
      );
      mimirStats = [dailyStats];
    } else {
      // All-time stats
      mimirStats = await getPlatformStats(query.contractId);
    }

    const configMap = await loadMachineConfigMap(query.contractId);

    const enriched = mimirStats.map((stat) => {
      const config = configMap.get(query.contractId);

      return {
        ...stat,
        machine_name: config?.display_name ?? null,
        machine_id: config?.id ?? null,
        chain: (config?.chain as PlatformStatResponse['chain']) ?? null,
      };
    });

    appCache.set(cacheKey, enriched, CacheTTL.PLATFORM_STATS);

    return json({ ok: true, data: enriched, source: 'mimir' });
  } catch (error) {
    console.error('Error fetching platform stats:', error);

    return json(
      { ok: false, error: 'Failed to fetch platform statistics' },
      { status: error instanceof z.ZodError ? 400 : 500 }
    );
  }
};

type MachineConfigRow = {
  id: string;
  display_name: string | null;
  contract_id: number;
  chain: 'base' | 'voi' | 'solana' | null;
};

async function loadMachineConfigMap(contractId?: number) {
  const supabase = createAdminClient();

  // Query from machines table (replaces slot_machine_configs)
  const query = supabase
    .from('machines')
    .select('id, display_name, game_contract_id, chain');

  if (contractId !== undefined) {
    query.eq('game_contract_id', contractId);
  }

  const { data, error } = await query;

  if (error || !data) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as PostgrestError).code)
        : undefined;

    if (code === 'PGRST205') {
      console.warn(
        'machines table not found. Skipping machine enrichment.'
      );
    } else {
      console.error('Failed to load machines:', error);
    }

    return new Map<number, MachineConfigRow>();
  }

  // Map game_contract_id to contract_id for compatibility
  return new Map<number, MachineConfigRow>(
    data.map((config) => [
      config.game_contract_id as number,
      {
        id: config.id,
        display_name: config.display_name,
        contract_id: config.game_contract_id as number,
        chain: config.chain as MachineConfigRow['chain']
      }
    ])
  );
}
