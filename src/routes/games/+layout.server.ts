import type { LayoutServerLoad } from './$types';
import { getServerSessionFromCookies, hasGameAccess } from '$lib/auth/session';
import { createAdminClient } from '$lib/db/supabaseAdmin';

export const load: LayoutServerLoad = async ({ cookies }) => {
  const session = await getServerSessionFromCookies(cookies);

  // If user is not authenticated, allow them to browse games
  if (!session) {
    return {
      session: null,
      hasGameAccess: false,
      waitlistData: null
    };
  }

  // Check if authenticated user has game access
  const access = await hasGameAccess(cookies);

  if (!access) {
    // User is authenticated but on waitlist - fetch waitlist data
    const supabase = createAdminClient();

    const [profileResult, referralResult, waitlistCountResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, game_access_granted, waitlist_position, waitlist_joined_at')
        .eq('id', session.profileId)
        .single(),
      supabase
        .from('referrals')
        .select('id')
        .eq('referred_profile_id', session.profileId)
        .single(),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('game_access_granted', false),
    ]);

    const profile = profileResult.data;
    const referral = referralResult.data;
    const waitlistCount = waitlistCountResult.count;

    return {
      session,
      hasGameAccess: false,
      waitlistData: {
        waitlistPosition: profile?.waitlist_position || null,
        joinedAt: profile?.waitlist_joined_at || null,
        hasReferral: !!referral,
        totalOnWaitlist: waitlistCount || 0,
      }
    };
  }

  // User has game access - show games normally
  return {
    session,
    hasGameAccess: true,
    waitlistData: null
  };
};
