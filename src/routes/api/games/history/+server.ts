import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerSessionFromCookies } from '$lib/auth/session';
import { getPlayerSpins, getPlayerStatsSafe } from '$lib/mimir/queries';

export const GET: RequestHandler = async ({ url, cookies }) => {
  try {
    const session = await getServerSessionFromCookies(cookies);

    if (!session) {
      return json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const voiAddress = session.voiAddress;

    if (!voiAddress) {
      return json(
        { success: false, error: 'VOI address not available in session' },
        { status: 400 }
      );
    }

    // Parse query parameters
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const contractIdParam = url.searchParams.get('contractId');
    const contractId = contractIdParam ? parseInt(contractIdParam, 10) : undefined;

    // Fetch spins from Mimir by address (following the app pattern)
    const spins = await getPlayerSpins(voiAddress, contractId, limit, offset);

    // Transform MimirSpinEvent to match UI expectations
    const history = spins.map((spin) => {
      const betAmount = parseFloat(spin.amount) / 1_000_000; // Convert from microVOI
      const payout = parseFloat(spin.payout) / 1_000_000;
      const profit = parseFloat(spin.net_result) / 1_000_000;
      const multiplier = betAmount > 0 ? payout / betAmount : 0;

      // For slots, we don't have reel data in Mimir, so we'll show a placeholder
      // The result_data field might have more info if available
      const reels = ['?', '?', '?', '?', '?']; // Placeholder - actual reels would come from result_data if available

      return {
        id: spin.id,
        gameType: 'slots' as const,
        gameName: '5-Reel Slots',
        chain: 'voi' as const,
        betAmount,
        payout,
        profit,
        txHash: spin.txid,
        seed: '', // Not available in Mimir data
        createdAt: spin.timestamp,
        result: {
          reels,
          multiplier: multiplier || 0,
        },
      };
    });

    // Get summary stats from Mimir
    const stats = await getPlayerStatsSafe(voiAddress, contractId);

    const totalWagered = stats ? parseFloat(stats.total_bet) / 1_000_000 : 0;
    const totalPayout = stats ? parseFloat(stats.total_won) / 1_000_000 : 0;
    const totalProfit = totalPayout - totalWagered;
    const winRate = stats?.win_rate ? stats.win_rate.toFixed(1) : '0.0';
    const totalCount = stats?.total_spins || 0;

    return json({
      success: true,
      data: {
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
      },
    });
  } catch (error) {
    console.error('Error in game history API:', error);
    return json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
};

