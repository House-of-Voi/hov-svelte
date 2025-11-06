import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerSessionFromCookies } from '$lib/auth/session';
import { getPlayerStatsSafe } from '$lib/mimir/queries';

export const GET: RequestHandler = async ({ cookies, url }) => {
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

    const contractIdParam = url.searchParams.get('contractId');
    const contractId = contractIdParam ? parseInt(contractIdParam, 10) : undefined;

    let stats;
    try {
      stats = await getPlayerStatsSafe(voiAddress, contractId);
    } catch (error) {
      stats = null;
    }

    return json({
      success: true,
      data: {
        total_bet: stats?.total_bet || '0',
        total_won: stats?.total_won || '0',
        net_result: stats?.net_result || '0',
        total_spins: stats?.total_spins || 0,
        win_rate: stats?.win_rate || 0,
        rtp: stats?.rtp || 0,
        largest_win: stats?.largest_win || '0',
        first_spin: stats?.first_spin || null,
        last_spin: stats?.last_spin || null,
      },
    });
  } catch (error) {
    return json({
      success: true,
      data: {
        total_bet: '0',
        total_won: '0',
        net_result: '0',
        total_spins: 0,
        win_rate: 0,
        rtp: 0,
        largest_win: '0',
        first_spin: null,
        last_spin: null,
      },
    });
  }
};
