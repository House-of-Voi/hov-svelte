import type {
  MimirLeaderboardEntry,
  MimirPlatformStats,
  MimirPlayerStats,
  MimirSpinEvent,
  TournamentResponse,
  TournamentLeaderboardEntry,
} from '$lib/types/database';
import { mimirRpc, MimirRpcError, mimirClient } from './client';

export async function getPlayerStats(
  address: string,
  contractId?: number
): Promise<MimirPlayerStats> {
  // Trim address only, preserve case
  const trimmedAddress = address.trim();
  
  if (contractId === undefined) {
    return getPlayerStatsFromTable(trimmedAddress);
  }

  const params: Record<string, unknown> = {
    p_player_address: trimmedAddress,
    p_app_id: contractId,
  };

  try {
    return await mimirRpc<MimirPlayerStats>('get_player_stats', params);
  } catch (error) {
    if (isFunctionMissing(error)) {
      return mimirRpc<MimirPlayerStats>('get_hov_player_stats', params);
    }

    throw error;
  }
}

async function getPlayerStatsFromTable(address: string): Promise<MimirPlayerStats> {
  // Trim address only, preserve case
  const trimmedAddress = address.trim();
  
  const { data, error } = await mimirClient
    .from('hov_events')
    .select('amount, max_payline_index, payout, total_bet_amount, net_result, is_win, round, created_at')
    .eq('who', trimmedAddress);

  if (error) {
    throw new MimirRpcError('getPlayerStatsFromTable', error);
  }

  if (!data || data.length === 0) {
    return {
      player_address: address,
      total_spins: 0,
      winning_spins: 0,
      losing_spins: 0,
      total_bet: '0',
      total_won: '0',
      net_result: '0',
      rtp: 0,
      win_rate: 0,
      largest_win: '0',
      largest_bet: '0',
      avg_bet: '0',
      avg_payout: '0',
      first_spin: null,
      last_spin: null,
    };
  }

  let totalSpins = data.length;
  let winningSpins = data.filter((row) => row.is_win).length;
  let losingSpins = totalSpins - winningSpins;
  let totalBet = BigInt(0);
  let totalWon = BigInt(0);
  let largestWin = BigInt(0);
  let largestBet = BigInt(0);
  let firstSpin: string | null = null;
  let lastSpin: string | null = null;

  for (const row of data) {
    const betAmount = BigInt(row.total_bet_amount || 0);
    const payout = BigInt(row.payout || 0);
    
    totalBet += betAmount;
    totalWon += payout;
    
    if (payout > largestWin) {
      largestWin = payout;
    }
    if (betAmount > largestBet) {
      largestBet = betAmount;
    }
    
    const createdAt = row.created_at;
    if (!firstSpin || createdAt < firstSpin) {
      firstSpin = createdAt;
    }
    if (!lastSpin || createdAt > lastSpin) {
      lastSpin = createdAt;
    }
  }

  const netResult = totalWon - totalBet;
  const winRate = totalSpins > 0 ? (winningSpins / totalSpins) * 100 : 0;
  const rtp = totalBet > 0 ? Number((totalWon * BigInt(100)) / totalBet) : 0;
  const avgBet = totalSpins > 0 ? Number(totalBet) / totalSpins : 0;
  const avgPayout = winningSpins > 0 ? Number(totalWon) / winningSpins : 0;

  return {
    player_address: address,
    total_spins: totalSpins,
    winning_spins: winningSpins,
    losing_spins: losingSpins,
    total_bet: totalBet.toString(),
    total_won: totalWon.toString(),
    net_result: netResult.toString(),
    rtp,
    win_rate: winRate,
    largest_win: largestWin.toString(),
    largest_bet: largestBet.toString(),
    avg_bet: avgBet.toFixed(2),
    avg_payout: avgPayout.toFixed(2),
    first_spin: firstSpin,
    last_spin: lastSpin,
  };
}

export async function getPlatformStats(
  contractId?: number
): Promise<MimirPlatformStats[]> {
  const params: Record<string, unknown> = {};
  if (contractId !== undefined) {
    params.p_app_id = contractId;
  }

  return await mimirRpc<MimirPlatformStats[]>('get_hov_platform_stats', params);
}

export async function getPlatformStatsByRounds(
  contractId: number,
  startRound?: number,
  endRound?: number
): Promise<MimirPlatformStats> {
  const params: Record<string, unknown> = {
    p_app_id: contractId,
  };

  if (startRound !== undefined) {
    params.p_start_round = startRound;
  }
  if (endRound !== undefined) {
    params.p_end_round = endRound;
  }

  const result = await mimirRpc<MimirPlatformStats[]>('get_hov_platform_stats', params);
  return result[0];
}

export async function getPlatformStatsByDate(
  contractId: number,
  startRound: number,
  endRound: number
): Promise<MimirPlatformStats> {
  return getPlatformStatsByRounds(contractId, startRound, endRound);
}

export async function getPlatformStatsByTimestamp(
  contractId: number,
  startDate: Date,
  endDate: Date
): Promise<MimirPlatformStats> {
  const { data, error } = await mimirClient
    .from('hov_events')
    .select('amount, payout, net_result, is_win, who, total_bet_amount')
    .eq('app_id', contractId)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  if (error) {
    throw new MimirRpcError('getPlatformStatsByTimestamp', error);
  }

  if (!data || data.length === 0) {
    return {
      total_bets: 0,
      total_amount_bet: 0,
      total_amount_paid: 0,
      total_winning_spins: 0,
      average_bet_size: 0,
      average_payout: 0,
      win_percentage: 0,
      house_edge: 0,
      rtp: 0,
      net_platform_result: 0,
      unique_players: 0,
      largest_single_win: 0,
      largest_single_bet: 0,
    };
  }

  const totalBets = data.length;
  const winningSpins = data.filter((row) => row.is_win).length;
  const uniquePlayers = new Set(data.map((row) => row.who)).size;

  let totalAmountBet = BigInt(0);
  let totalAmountPaid = BigInt(0);
  let largestWin = BigInt(0);
  let largestBet = BigInt(0);

  for (const row of data) {
    const betAmount = BigInt(row.total_bet_amount || row.amount || 0);
    const payout = BigInt(row.payout || 0);

    totalAmountBet += betAmount;
    totalAmountPaid += payout;

    if (payout > largestWin) {
      largestWin = payout;
    }
    if (betAmount > largestBet) {
      largestBet = betAmount;
    }
  }

  const netPlatformResult = totalAmountBet - totalAmountPaid;
  const winPercentage = totalBets > 0 ? (winningSpins / totalBets) * 100 : 0;
  const rtp = totalAmountBet > 0n ? Number((totalAmountPaid * 100n) / totalAmountBet) : 0;
  const houseEdge = 100 - rtp;
  const avgBet = totalBets > 0 ? Number(totalAmountBet) / totalBets : 0;
  const avgPayout = winningSpins > 0 ? Number(totalAmountPaid) / winningSpins : 0;

  return {
    total_bets: totalBets,
    total_amount_bet: Number(totalAmountBet),
    total_amount_paid: Number(totalAmountPaid),
    total_winning_spins: winningSpins,
    average_bet_size: avgBet,
    average_payout: avgPayout,
    win_percentage: winPercentage,
    house_edge: houseEdge,
    rtp,
    net_platform_result: Number(netPlatformResult),
    unique_players: uniquePlayers,
    largest_single_win: Number(largestWin),
    largest_single_bet: Number(largestBet),
  };
}

export type LeaderboardRankBy = 'won' | 'profit' | 'rtp' | 'volume';

export async function getLeaderboard(options: {
  contractId?: number;
  limit?: number;
  rankBy?: LeaderboardRankBy;
  byProfile?: boolean;
} = {}): Promise<MimirLeaderboardEntry[]> {
  const {
    contractId,
    limit = 100,
    rankBy = 'profit',
  } = options;

  const metricMap: Record<LeaderboardRankBy, string> = {
    won: 'total_won',
    profit: 'net_result',
    rtp: 'rtp',
    volume: 'total_bet',
  };

  const params: Record<string, unknown> = {
    p_metric: metricMap[rankBy] || 'net_result',
    p_limit: limit,
    p_offset: 0,
  };

  if (contractId !== undefined) {
    params.p_app_id = contractId;
  }

  try {
    return await mimirRpc<MimirLeaderboardEntry[]>('get_leaderboard', params);
  } catch (error) {
    if (isFunctionMissing(error)) {
      const fallbackParams = {
        ...params,
        p_app_id: contractId ?? null,
      };
      return mimirRpc<MimirLeaderboardEntry[]>('get_hov_leaderboard', fallbackParams);
    }

    throw error;
  }
}

export async function getPlayerSpins(
  address: string,
  contractId?: number,
  limit = 20,
  offset = 0
): Promise<MimirSpinEvent[]> {
  // Trim address only, preserve case
  const trimmedAddress = address.trim();
  
  let query = mimirClient
    .from('hov_events')
    .select('round, intra, txid, app_id, who, amount, payout, net_result, total_bet_amount, max_payline_index, created_at')
    .eq('who', trimmedAddress)
    .order('round', { ascending: false })
    .order('intra', { ascending: false })
    .range(offset, offset + limit - 1);

  if (contractId !== undefined) {
    query = query.eq('app_id', contractId);
  }

  const { data, error } = await query;

  if (error) {
    throw new MimirRpcError('getPlayerSpins', error);
  }

  if (!data || data.length === 0) {
    return [];
  }

  return data.map((row) => ({
    id: `${row.round}-${row.intra}`,
    chain: 'voi' as const,
    txid: row.txid,
    block: Number(row.round),
    round: Number(row.round),
    timestamp: row.created_at,
    contract_id: Number(row.app_id),
    player_address: row.who,
    amount: row.amount.toString(),
    payout: (row.payout || 0).toString(),
    net_result: (row.net_result || 0).toString(),
    max_payline_index: row.max_payline_index ? Number(row.max_payline_index) : undefined,
    result_data: undefined,
  }));
}

export async function getPlayerStatsSafe(
  address: string,
  contractId?: number
): Promise<MimirPlayerStats | null> {
  try {
    return await getPlayerStats(address, contractId);
  } catch (error) {
    return null;
  }
}

export async function getTournamentLeaderboard(options: {
  contractId: number;
  startDate: Date;
  endDate: Date;
  limit?: number;
  rankBy?: LeaderboardRankBy;
  minSpins?: number;
  minVolumeMicro?: number;
}): Promise<MimirLeaderboardEntry[]> {
  const {
    contractId,
    startDate,
    endDate,
    limit = 100,
    rankBy = 'profit',
    minSpins = 0,
    minVolumeMicro = 0,
  } = options;

  const params = {
    p_app_id: contractId,
    p_start_ts: startDate.toISOString(),
    p_end_ts: endDate.toISOString(),
    p_limit: limit,
    p_min_spins: minSpins,
    p_min_volume_micro: minVolumeMicro,
  };

  const response = await mimirRpc<TournamentResponse>(
    'get_hov_tournament',
    params
  );

  const categoryMap: Record<LeaderboardRankBy, keyof TournamentResponse['categories']> = {
    won: 'total_won',
    profit: 'total_won',
    rtp: 'rtp',
    volume: 'volume',
  };

  const category = categoryMap[rankBy] || 'total_won';
  const entries: TournamentLeaderboardEntry[] = response.categories[category];

  return entries.map((entry) => ({
    rank: entry.rank,
    identifier: entry.who,
    linked_addresses: [entry.who],
    total_spins: entry.total_spins || 0,
    total_bet: entry.total_volume || '0',
    total_won: entry.total_amount_won || '0',
    net_result: calculateNetResult(entry.total_amount_won, entry.total_volume),
    rtp: entry.rtp_percent || 0,
    win_rate: 0,
    largest_win: entry.largest_single_win || '0',
  }));
}

function calculateNetResult(won?: string, volume?: string): string {
  if (!won || !volume) return '0';
  const wonBigInt = BigInt(won);
  const volumeBigInt = BigInt(volume);
  return (wonBigInt - volumeBigInt).toString();
}

function isFunctionMissing(error: unknown): boolean {
  return error instanceof MimirRpcError && error.code === 'PGRST202';
}
