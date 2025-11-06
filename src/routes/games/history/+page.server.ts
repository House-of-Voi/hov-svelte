import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getServerSessionFromCookies } from '$lib/auth/session';
import { getPlayerSpins, getPlayerStatsSafe } from '$lib/mimir/queries';
import { ensureBase32TxId } from '$lib/utils/txIdUtils';

export const load: PageServerLoad = async ({ parent, url, cookies }) => {
  const { session } = await parent();

  if (!session) {
    throw redirect(302, '/auth');
  }

  const fullSession = await getServerSessionFromCookies(cookies);
  const voiAddress = fullSession?.voiAddress;

  if (!voiAddress) {
    throw redirect(302, '/auth');
  }

  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const contractIdParam = url.searchParams.get('contractId');
  const contractId = contractIdParam ? parseInt(contractIdParam, 10) : undefined;

  try {
    const spins = await getPlayerSpins(voiAddress, contractId, limit, offset);

    const history = spins.map((spin) => {
      const betAmount = parseFloat(spin.amount) / 1_000_000;
      const payout = parseFloat(spin.payout) / 1_000_000;
      const profit = parseFloat(spin.net_result) / 1_000_000;
      const multiplier = betAmount > 0 ? payout / betAmount : 0;

      // Calculate betPerLine (amount in microVOI) and selectedPaylines
      // amount is bet per line, total_bet_amount is total bet across all paylines
      const betPerLineMicro = parseFloat(spin.amount);
      // Try to get total_bet_amount from the query result if available
      // For now, calculate from max_payline_index if available, otherwise default to 1
      const selectedPaylines = spin.max_payline_index !== undefined ? spin.max_payline_index + 1 : 1;

      const reels = ['?', '?', '?', '?', '?'];

      // Convert transaction ID to base32 format for display and API usage
      const base32TxId = ensureBase32TxId(spin.txid);

      return {
        id: spin.id,
        gameType: 'slots' as const,
        gameName: '5-Reel Slots',
        chain: 'voi' as const,
        betAmount,
        payout,
        profit,
        txHash: base32TxId,
        seed: '',
        createdAt: spin.timestamp,
        betPerLine: betPerLineMicro,
        selectedPaylines,
        result: {
          reels,
          multiplier: multiplier || 0,
        },
      };
    });

    const stats = await getPlayerStatsSafe(voiAddress, contractId);

    const totalWagered = stats ? parseFloat(stats.total_bet) / 1_000_000 : 0;
    const totalPayout = stats ? parseFloat(stats.total_won) / 1_000_000 : 0;
    const totalProfit = totalPayout - totalWagered;
    const winRate = stats?.win_rate ? stats.win_rate.toFixed(1) : '0.0';
    const totalCount = stats?.total_spins || 0;

    return {
      history,
      pagination: {
        limit,
        offset,
        total: totalCount,
        hasMore: totalCount > offset + limit,
      },
      stats: {
        totalWagered,
        totalPayout,
        totalProfit,
        winRate,
      },
    };
  } catch (error) {
    return {
      history: [],
      pagination: {
        limit,
        offset,
        total: 0,
        hasMore: false,
      },
      stats: {
        totalWagered: 0,
        totalPayout: 0,
        totalProfit: 0,
        winRate: '0.0',
      },
    };
  }
};
