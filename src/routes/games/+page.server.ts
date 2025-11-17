import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

interface SlotConfig {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  theme: string | null;
  contract_id: number;
  chain: 'base' | 'voi' | 'solana';
  game_type: '5reel' | 'w2w';
  rtp_target: string;
  house_edge: string;
  min_bet: number;
  max_bet: number;
  max_paylines: number;
  launched_at: string;
}

type PlatformStatSummary = {
  contractId: number;
  totalAmountBet: number;
  totalAmountPaid: number;
  totalBets: number;
  totalWinningSpins: number;
  uniquePlayers: number;
  largestSingleWin: number;
};

type RecentWinnerEntry = {
  rank: number;
  identifier: string;
  display_name: string | null;
  profile_id: string | null;
  linked_addresses: string[] | null;
  total_won: string | number | null;
  net_result: string | number | null;
  total_spins: number | null;
  win_rate: number | null;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function fetchSlotConfigs(fetch: typeof globalThis.fetch): Promise<SlotConfig[]> {
  try {
    const response = await fetch('/api/games/slot-configs');

    if (!response.ok) {
      console.error('Failed to fetch slot configs:', response.statusText);
      return [];
    }

    const data = await response.json();
    return data.success ? (data.data as SlotConfig[]) : [];
  } catch (err) {
    console.error('Error fetching slot configs:', err);
    return [];
  }
}

async function fetchPlatformStatsSummary(
  fetch: typeof globalThis.fetch,
  contractId: number,
  timeframe: 'daily' | 'all-time'
): Promise<PlatformStatSummary | null> {
  try {
    const url = new URL('/api/statistics/platform', 'http://localhost');
    url.searchParams.set('contractId', String(contractId));
    url.searchParams.set('timeframe', timeframe);

    const response = await fetch(url.pathname + url.search);

    if (!response.ok) {
      console.error(`Failed to fetch ${timeframe} platform stats:`, response.statusText);
      return null;
    }

    const payload = await response.json();
    const row =
      Array.isArray(payload.data) && payload.data.length > 0
        ? payload.data[0]
        : null;

    if (!row) {
      return null;
    }

    return {
      contractId,
      totalAmountBet: toNumber(row.total_amount_bet),
      totalAmountPaid: toNumber(row.total_amount_paid),
      totalBets: toNumber(row.total_bets),
      totalWinningSpins: toNumber(row.total_winning_spins),
      uniquePlayers: toNumber(row.unique_players),
      largestSingleWin: toNumber(row.largest_single_win),
    };
  } catch (err) {
    console.error(`Error fetching ${timeframe} platform stats:`, err);
    return null;
  }
}

function aggregateStats(
  stats: PlatformStatSummary[]
): PlatformStatSummary | null {
  if (stats.length === 0) {
    return null;
  }

  return stats.reduce<PlatformStatSummary>(
    (acc, stat) => ({
      contractId: acc.contractId,
      totalAmountBet: acc.totalAmountBet + stat.totalAmountBet,
      totalAmountPaid: acc.totalAmountPaid + stat.totalAmountPaid,
      totalBets: acc.totalBets + stat.totalBets,
      totalWinningSpins: acc.totalWinningSpins + stat.totalWinningSpins,
      uniquePlayers: acc.uniquePlayers + stat.uniquePlayers,
      largestSingleWin: Math.max(acc.largestSingleWin, stat.largestSingleWin),
    }),
    {
      contractId: stats[0]?.contractId ?? 0,
      totalAmountBet: 0,
      totalAmountPaid: 0,
      totalBets: 0,
      totalWinningSpins: 0,
      uniquePlayers: 0,
      largestSingleWin: 0,
    }
  );
}

async function fetchRecentWinners(
  fetch: typeof globalThis.fetch,
  limit = 5,
  contractId?: number
): Promise<RecentWinnerEntry[]> {
  try {
    const url = new URL('/api/statistics/leaderboard', 'http://localhost');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('timeframe', 'daily');
    url.searchParams.set('rankBy', 'won');
    if (contractId !== undefined) {
      url.searchParams.set('contractId', String(contractId));
    }

    const response = await fetch(url.pathname + url.search);

    if (!response.ok) {
      console.error('Failed to fetch recent winners:', response.statusText);
      return [];
    }

    const data = await response.json();
    return Array.isArray(data.data) ? (data.data as RecentWinnerEntry[]) : [];
  } catch (err) {
    console.error('Error fetching recent winners:', err);
    return [];
  }
}

async function fetchProfileStats(fetch: typeof globalThis.fetch): Promise<any | null> {
  try {
    const response = await fetch('/api/statistics/profile/me');
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    console.log('Profile stats data:', data);
    return data.success ? data.data : null;
  } catch (err) {
    return null;
  }
}

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { session } = await parent();

  // Fetch slot configs
  const games = await fetchSlotConfigs(fetch);
  const contractIds = [
    ...new Set(
      games
        .map((game) => Number(game.contract_id))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];
  const defaultContractId = contractIds[0];

  // Fetch daily stats in parallel
  const dailyStatsResults = await Promise.all(
    contractIds.map((contractId) =>
      fetchPlatformStatsSummary(fetch, contractId, 'daily')
    )
  );
  const dailyStats = dailyStatsResults.filter(
    (stat): stat is PlatformStatSummary => stat !== null
  );

  let statsScope: 'Today' | 'All Time' = 'Today';
  let aggregatedStats = aggregateStats(dailyStats);

  // If no daily stats, fetch all-time stats
  if (!aggregatedStats && contractIds.length > 0) {
    const allTimeStatsResults = await Promise.all(
      contractIds.map((contractId) =>
        fetchPlatformStatsSummary(fetch, contractId, 'all-time')
      )
    );
    const allTimeStats = allTimeStatsResults.filter(
      (stat): stat is PlatformStatSummary => stat !== null
    );
    const aggregatedAllTime = aggregateStats(allTimeStats);

    if (aggregatedAllTime) {
      aggregatedStats = aggregatedAllTime;
      statsScope = 'All Time';
    }
  }

  // Recent wins are now loaded client-side via real-time subscription
  // No need to fetch recent winners server-side

  let profileStats = null;
  if (session?.gameAccessGranted) {
    profileStats = await fetchProfileStats(fetch);
  }

  return {
    games,
    platformStats: aggregatedStats,
    statsScope,
    defaultContractId,
    profileStats,
  };
};
