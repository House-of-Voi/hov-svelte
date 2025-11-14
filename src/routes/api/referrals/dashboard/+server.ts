import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerSessionFromCookies } from '$lib/auth/session';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { getReferralVolumeStats } from '$lib/referrals/stats';
import type { ReferralDashboardData, ReferralWithStats } from '$lib/referrals/credits';

/**
 * GET /api/referrals/dashboard
 * Returns enriched referral dashboard data with Mimir statistics
 */
export const GET: RequestHandler = async ({ cookies, url }) => {
  const session = await getServerSessionFromCookies(cookies);
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contractIdParam = url.searchParams.get('contractId');
  const contractId = contractIdParam ? parseInt(contractIdParam, 10) : undefined;

  const supabase = createAdminClient();

  // Get profile info
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('max_referrals')
    .eq('id', session.sub)
    .single();

  if (profileError || !profile) {
    return json(
      { error: 'Profile not found' },
      { status: 404 }
    );
  }

  // Get all referrals for this user
  const { data: referrals, error: referralsError } = await supabase
    .from('referrals')
    .select(`
      id,
      is_active,
      activated_at,
      created_at,
      referral_code_id,
      referred_profile_id,
      referral_codes!referrals_referral_code_id_fkey (
        code,
        created_at
      ),
      referred_profile:profiles!referrals_referred_profile_id_fkey (
        id,
        display_name,
        avatar_url,
        created_at,
        primary_email
      )
    `)
    .eq('referrer_profile_id', session.sub)
    .not('referred_profile_id', 'is', null)
    .order('created_at', { ascending: false });

  if (referralsError) {
    console.error('Error fetching referrals:', referralsError);
    return json(
      { error: 'Failed to fetch referrals' },
      { status: 500 }
    );
  }

  // Get all referral codes for counting
  const { data: codes, error: codesError } = await supabase
    .from('referral_codes')
    .select('id, deactivated_at')
    .eq('referrer_profile_id', session.sub);

  if (codesError) {
    console.error('Error fetching codes:', codesError);
    return json(
      { error: 'Failed to fetch referral codes' },
      { status: 500 }
    );
  }

  // Count non-deactivated codes
  const codesGenerated = codes.filter((c) => !c.deactivated_at).length;
  const codesAvailable = profile.max_referrals - codesGenerated;

  // Enrich referrals with Mimir stats
  const enrichedReferrals: ReferralWithStats[] = await Promise.all(
    (referrals || []).map(async (referral) => {
      const referredProfile = referral.referred_profile as {
        id: string;
        display_name: string | null;
        avatar_url: string | null;
        created_at: string;
        primary_email: string;
      } | null;

      const referralCode = referral.referral_codes as {
        code: string;
        created_at: string;
      } | null;

      if (!referredProfile) {
        return null;
      }

      // Fetch Mimir stats for this referred user
      const mimirStats = await getReferralVolumeStats(
        referredProfile.id,
        contractId
      );

      // Calculate credits from referral_credits table
      const { data: creditsData } = await supabase
        .from('referral_credits')
        .select('credit_earned, wager_amount')
        .eq('referrer_profile_id', session.sub)
        .eq('referred_profile_id', referredProfile.id);

      const creditsEarnedForReferrer = creditsData?.reduce(
        (sum, c) => sum + parseFloat(c.credit_earned),
        0
      ) || 0;

      const totalWageredFromCredits = creditsData?.reduce(
        (sum, c) => sum + parseFloat(c.wager_amount),
        0
      ) || 0;

      // Use Mimir stats if available, otherwise fall back to credits table
      const totalWagered = mimirStats
        ? parseFloat(mimirStats.totalBet) / 1e6 // Convert from micro units
        : totalWageredFromCredits;

      const gamesPlayed = mimirStats?.totalSpins || 0;

      return {
        referralCode: referralCode?.code || 'N/A',
        referredUsername: referredProfile.display_name || 'Unknown',
        referredProfileId: referredProfile.id,
        referredUserAvatar: referredProfile.avatar_url,
        referredUserEmailOrPhone: referredProfile.primary_email,
        joinedAt: referredProfile.created_at,
        totalWagered,
        gamesPlayed,
        creditsEarnedForReferrer,
        lastPlayedAt: mimirStats?.lastPlayedAt || null,
        mimirStats: mimirStats
          ? {
              totalSpins: mimirStats.totalSpins,
              totalBet: mimirStats.totalBet,
              totalWon: mimirStats.totalWon,
              netResult: mimirStats.netResult,
              lastPlayedAt: mimirStats.lastPlayedAt,
              creditsEarned: mimirStats.creditsEarned,
            }
          : null,
        isActive: referral.is_active,
        referralCodeId: referral.referral_code_id,
      };
    })
  );

  // Filter out null entries
  const validReferrals = enrichedReferrals.filter(
    (r): r is ReferralWithStats => r !== null
  );

  // Calculate counts from the actual valid referrals array
  const activeReferralsCount = validReferrals.filter((r) => r.isActive).length;
  const queuedReferralsCount = validReferrals.filter((r) => !r.isActive).length;
  const totalReferralsCount = validReferrals.length;

  // Calculate aggregate stats
  const aggregateStats = {
    totalVolume: validReferrals
      .reduce((sum, r) => {
        if (r.mimirStats) {
          return sum + BigInt(r.mimirStats.totalBet);
        }
        return sum + BigInt(Math.floor(r.totalWagered * 1e6));
      }, BigInt(0))
      .toString(),
    totalCreditsEarned: validReferrals.reduce(
      (sum, r) => sum + (r.mimirStats?.creditsEarned || r.creditsEarnedForReferrer),
      0
    ),
    totalSpins: validReferrals.reduce(
      (sum, r) => sum + (r.mimirStats?.totalSpins || r.gamesPlayed),
      0
    ),
    activeCount: activeReferralsCount,
  };

  const dashboardData: ReferralDashboardData = {
    codesGenerated,
    codesAvailable,
    maxReferrals: profile.max_referrals,
    activeReferrals: activeReferralsCount,
    queuedReferrals: queuedReferralsCount,
    totalReferrals: totalReferralsCount,
    referrals: validReferrals,
    aggregateStats,
  };

  return json({
    ok: true,
    ...dashboardData,
  });
};

