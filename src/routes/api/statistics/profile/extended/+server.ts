import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getPlayerStatsSafe,
  getPlayerBiggestWins,
  getPlayerStatsByDate,
  getPlayerStreaks,
} from '$lib/mimir/queries';
import type { ExtendedPlayerStats } from '$lib/types/profile';

export const GET: RequestHandler = async ({ locals, url }) => {
  try {
    const session = locals.hovSession;

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
    const period = url.searchParams.get('period') || 'all';
    const dateParam = url.searchParams.get('date');

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (period === 'daily' && dateParam) {
      const date = new Date(dateParam);
      startDate = new Date(date);
      startDate.setUTCHours(0, 0, 0, 0);
      endDate = new Date(date);
      endDate.setUTCHours(23, 59, 59, 999);
    }

    // Fetch all data in parallel
    const [stats, biggestWins, streaks] = await Promise.all([
      period === 'daily' && startDate
        ? getPlayerStatsByDate(voiAddress, startDate)
        : getPlayerStatsSafe(voiAddress),
      getPlayerBiggestWins(voiAddress, 3, startDate, endDate),
      getPlayerStreaks(voiAddress, startDate, endDate),
    ]);

    // Calculate days active
    let daysActive = 0;
    if (stats?.first_spin) {
      const firstSpinDate = new Date(stats.first_spin);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - firstSpinDate.getTime());
      daysActive = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Use avg_bet as most common bet (approximation)
    const mostCommonBet = stats?.avg_bet || '0';

    const extendedStats: ExtendedPlayerStats = {
      // Basic stats
      totalSpins: stats?.total_spins || 0,
      totalBet: stats?.total_bet || '0',
      totalWon: stats?.total_won || '0',
      winRate: stats?.win_rate || 0,
      rtp: stats?.rtp || 0,
      largestWin: stats?.largest_win || '0',
      avgBet: stats?.avg_bet || '0',
      firstSpin: stats?.first_spin || null,
      lastSpin: stats?.last_spin || null,

      // Extended stats
      biggestWins: biggestWins.map((win) => ({
        date: win.date,
        amount: win.amount,
        betAmount: win.betAmount,
        lines: win.lines,
      })),
      longestWinStreak: streaks?.longestWinStreak || 0,
      longestLosingStreak: streaks?.longestLosingStreak || 0,
      totalPaylines: streaks?.totalPaylines || 0,
      mostCommonBet,
      daysActive,
    };

    return json({
      success: true,
      data: extendedStats,
    });
  } catch (error) {
    console.error('Extended stats API error:', error);

    // Return default values on error
    const defaultStats: ExtendedPlayerStats = {
      totalSpins: 0,
      totalBet: '0',
      totalWon: '0',
      winRate: 0,
      rtp: 0,
      largestWin: '0',
      avgBet: '0',
      firstSpin: null,
      lastSpin: null,
      biggestWins: [],
      longestWinStreak: 0,
      longestLosingStreak: 0,
      totalPaylines: 0,
      mostCommonBet: '0',
      daysActive: 0,
    };

    return json({
      success: true,
      data: defaultStats,
    });
  }
};
