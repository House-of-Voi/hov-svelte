import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerSessionFromCookies } from '$lib/auth/session';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { getReferralVolumeStats, getVoiAddressesForProfile } from '$lib/referrals/stats';
import { getPlayerSpins } from '$lib/mimir/queries';
import type { MimirSpinEvent } from '$lib/types/database';

/**
 * GET /api/referrals/[profileId]
 * Returns detailed referral information for a specific referred profile
 */
export const GET: RequestHandler = async ({ params, cookies, url }) => {
  const session = await getServerSessionFromCookies(cookies);
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { profileId } = params;
  const contractIdParam = url.searchParams.get('contractId');
  const contractId = contractIdParam ? parseInt(contractIdParam, 10) : undefined;
  
  // Pagination parameters for game history
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');
  const limit = limitParam ? parseInt(limitParam, 10) : 20;
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  const supabase = createAdminClient();

  // Verify that this referral belongs to the current user
  const { data: referral, error: referralError } = await supabase
    .from('referrals')
    .select('id, is_active, referred_profile_id, referrer_profile_id')
    .eq('referred_profile_id', profileId)
    .eq('referrer_profile_id', session.sub)
    .single();

  if (referralError || !referral) {
    return json(
      { error: 'Referral not found or access denied' },
      { status: 404 }
    );
  }

  // Get referred profile information
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, created_at')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return json(
      { error: 'Profile not found' },
      { status: 404 }
    );
  }

  // Get all VOI addresses for the referred profile
  const voiAddresses = await getVoiAddressesForProfile(profileId);

  // Get aggregated stats
  const stats = await getReferralVolumeStats(profileId, contractId);

  // Get spins from all addresses
  // Fetch more than needed to account for multiple addresses, then sort and paginate
  const fetchLimit = Math.max(limit + offset + 100, 500); // Fetch extra to ensure we have enough after sorting
  const recentSpinsPromises = voiAddresses.map((address) =>
    getPlayerSpins(address, contractId, fetchLimit, 0)
  );
  const recentSpinsResults = await Promise.all(recentSpinsPromises);
  
  // Combine and sort all spins by timestamp (most recent first)
  const allSpins: MimirSpinEvent[] = recentSpinsResults
    .flat()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  // Use stats.totalSpins as the total count if available, otherwise use fetched count
  // Note: This may not be 100% accurate if there are more spins than we fetched
  const totalSpins = stats?.totalSpins || allSpins.length;
  
  // Apply pagination
  const paginatedSpins = allSpins.slice(offset, offset + limit);

  // Get credit transaction history
  const { data: creditHistory, error: creditError } = await supabase
    .from('referral_credits')
    .select('credit_earned, wager_amount, created_at')
    .eq('referrer_profile_id', session.sub)
    .eq('referred_profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (creditError) {
    console.error('Error fetching credit history:', creditError);
  }

  // Calculate win rate if we have stats
  let winRate = 0;
  if (stats && stats.totalSpins > 0) {
    const totalBet = BigInt(stats.totalBet);
    const totalWon = BigInt(stats.totalWon);
    if (totalBet > 0) {
      winRate = (Number(totalWon) / Number(totalBet)) * 100;
    }
  }

  return json({
    ok: true,
    profile: {
      id: profile.id,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      created_at: profile.created_at,
    },
    stats: stats
      ? {
          totalSpins: stats.totalSpins,
          totalBet: stats.totalBet,
          totalWon: stats.totalWon,
          netResult: stats.netResult,
          lastPlayedAt: stats.lastPlayedAt,
          creditsEarned: stats.creditsEarned,
          winRate,
        }
      : null,
    recentSpins: paginatedSpins,
    totalSpins: totalSpins,
    creditHistory: creditHistory || [],
    addresses: voiAddresses,
    isActive: referral.is_active,
  });
};

