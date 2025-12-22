import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mimirClient, MimirRpcError } from '$lib/mimir/client';

/**
 * Calculate consecutive days playing streak for a user.
 * Counts backwards from today, finding consecutive days with at least one spin.
 */
export const GET: RequestHandler = async ({ locals }) => {
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

    // Get distinct dates when user played
    const { data, error } = await mimirClient
      .from('hov_events')
      .select('created_at')
      .eq('who', voiAddress.trim())
      .order('created_at', { ascending: false });

    if (error) {
      throw new MimirRpcError('getPlayerStreak', error);
    }

    if (!data || data.length === 0) {
      return json({
        success: true,
        data: {
          currentStreak: 0,
          lastPlayed: null,
        },
      });
    }

    // Extract unique dates (in UTC)
    const playDates = new Set<string>();
    let lastPlayed: string | null = null;

    for (const row of data) {
      const date = new Date(row.created_at);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      playDates.add(dateStr);

      if (!lastPlayed || row.created_at > lastPlayed) {
        lastPlayed = row.created_at;
      }
    }

    // Sort dates descending
    const sortedDates = Array.from(playDates).sort().reverse();

    // Calculate streak from today backward
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Start from either today or the most recent play date
    let currentStreak = 0;
    let checkDate = new Date(today);

    // If they haven't played today, check if they played yesterday to start the streak
    if (!playDates.has(todayStr)) {
      checkDate.setUTCDate(checkDate.getUTCDate() - 1);
      const yesterdayStr = checkDate.toISOString().split('T')[0];
      if (!playDates.has(yesterdayStr)) {
        // No streak - didn't play today or yesterday
        return json({
          success: true,
          data: {
            currentStreak: 0,
            lastPlayed,
          },
        });
      }
    }

    // Count consecutive days
    while (true) {
      const dateStr = checkDate.toISOString().split('T')[0];
      if (playDates.has(dateStr)) {
        currentStreak++;
        checkDate.setUTCDate(checkDate.getUTCDate() - 1);
      } else {
        break;
      }
    }

    return json({
      success: true,
      data: {
        currentStreak,
        lastPlayed,
      },
    });
  } catch (error) {
    console.error('Failed to calculate streak:', error);
    return json({
      success: true,
      data: {
        currentStreak: 0,
        lastPlayed: null,
      },
    });
  }
};
