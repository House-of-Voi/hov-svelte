import { getPlayerStatsSafe, getPlayerSpins } from '$lib/mimir/queries';
import type { MimirSpinEvent } from '$lib/types/database';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { appCache } from '$lib/cache/SimpleCache';
import { CacheKeys } from '$lib/cache/keys';
import { calculateCreditsFromWager, DEFAULT_REFERRAL_CREDIT_PERCENTAGE } from './credits';

/**
 * Aggregated stats from multiple addresses
 */
export interface AggregatedReferralStats {
  totalSpins: number;
  totalBet: string; // BigInt string
  totalWon: string; // BigInt string
  netResult: string; // BigInt string
  lastPlayedAt: string | null;
  creditsEarned: number;
}

/**
 * Get VOI addresses for a profile from the accounts table
 * Queries the accounts table directly to get addresses where chain = 'voi'
 */
export async function getVoiAddressesForProfile(
  profileId: string
): Promise<string[]> {
  const supabase = createAdminClient();
  
  // Query accounts table directly for VOI addresses
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('address')
    .eq('profile_id', profileId)
    .eq('chain', 'voi');
  
  if (error) {
    console.error('Error fetching VOI addresses from accounts table:', error);
    return [];
  }
  
  // Extract addresses from the address column (trim only, preserve case)
  const addresses = (accounts || [])
    .map((acc) => acc.address.trim())
    .filter((addr) => addr.length > 0);
  
  console.log('Getting VOI addresses from accounts table:', {
    profileId,
    accountsFound: accounts?.length || 0,
    addresses,
  });
  
  return addresses;
}

/**
 * Get last played timestamp from Mimir spins
 */
export async function getLastPlayedTimestamp(
  address: string,
  contractId?: number
): Promise<string | null> {
  try {
    const cacheKey = CacheKeys.playerSpins(address, 1, 0, 'desc', contractId);
    const cached = appCache.get<MimirSpinEvent[]>(cacheKey);
    
    if (cached && cached.length > 0) {
      return cached[0].timestamp;
    }

    const spins = await getPlayerSpins(address, contractId, 1, 0);
    if (spins && spins.length > 0) {
      // Cache for 5 minutes
      appCache.set(cacheKey, spins, 300);
      return spins[0].timestamp;
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch last played for ${address}:`, error);
    return null;
  }
}

/**
 * Aggregate player stats from multiple addresses
 */
export async function aggregateReferralStats(
  addresses: string[],
  contractId?: number
): Promise<AggregatedReferralStats | null> {
  if (addresses.length === 0) {
    return {
      totalSpins: 0,
      totalBet: '0',
      totalWon: '0',
      netResult: '0',
      lastPlayedAt: null,
      creditsEarned: 0,
    };
  }

  // Fetch stats for all addresses in parallel
  const statsPromises = addresses.map((address) =>
    getPlayerStatsSafe(address, contractId)
  );

  const statsResults = await Promise.all(statsPromises);

  // Aggregate the stats
  let totalSpins = 0;
  let totalBet = BigInt(0);
  let totalWon = BigInt(0);
  let lastPlayedAt: string | null = null;

  for (let i = 0; i < addresses.length; i++) {
    const stats = statsResults[i];
    if (!stats) continue;

    totalSpins += stats.total_spins || 0;
    totalBet += BigInt(stats.total_bet || '0');
    totalWon += BigInt(stats.total_won || '0');

    // Get the most recent last_spin timestamp
    if (stats.last_spin) {
      const spinTime = new Date(stats.last_spin).getTime();
      if (!lastPlayedAt || new Date(lastPlayedAt).getTime() < spinTime) {
        lastPlayedAt = stats.last_spin;
      }
    }
  }

  // If we don't have last_spin from stats, try to get from recent spins
  if (!lastPlayedAt) {
    const lastPlayedPromises = addresses.map((address) =>
      getLastPlayedTimestamp(address, contractId)
    );
    const lastPlayedResults = await Promise.all(lastPlayedPromises);
    const validTimestamps = lastPlayedResults.filter(
      (ts): ts is string => ts !== null
    );
    if (validTimestamps.length > 0) {
      lastPlayedAt = validTimestamps.sort(
        (a, b) => new Date(b).getTime() - new Date(a).getTime()
      )[0];
    }
  }

  const netResult = totalWon - totalBet;
  const totalBetNumber = Number(totalBet) / 1e6; // Convert from micro units
  const creditsEarned = calculateCreditsFromWager(
    totalBetNumber,
    DEFAULT_REFERRAL_CREDIT_PERCENTAGE
  );

  return {
    totalSpins,
    totalBet: totalBet.toString(),
    totalWon: totalWon.toString(),
    netResult: netResult.toString(),
    lastPlayedAt,
    creditsEarned,
  };
}

/**
 * Get referral volume stats for a referred user profile
 */
export async function getReferralVolumeStats(
  referredProfileId: string,
  contractId?: number
): Promise<AggregatedReferralStats | null> {
  console.log('Referral volume stats loading:', {
    referredProfileId,
    contractId,
  });

  // Get all VOI addresses for the referred user
  const voiAddresses = await getVoiAddressesForProfile(referredProfileId);

  if (voiAddresses.length === 0) {
    console.log('No VOI addresses found for profile:', referredProfileId);
    return {
      totalSpins: 0,
      totalBet: '0',
      totalWon: '0',
      netResult: '0',
      lastPlayedAt: null,
      creditsEarned: 0,
    };
  }

  // Check cache first
  const cacheKey = `referral:stats:${referredProfileId}:${contractId || 'all'}`;
  const cached = appCache.get<AggregatedReferralStats>(cacheKey);
  if (cached) {
    console.log('Referral volume stats from cache:', {
      referredProfileId,
      contractId,
      cached,
    });
    return cached;
  }

  // Aggregate stats from all addresses (trim only, preserve case)
  const trimmedAddresses = voiAddresses.map(addr => addr.trim());
  
  console.log('Referral volume stats loading from Mimir:', {
    referredProfileId,
    contractId,
    voiAddresses: trimmedAddresses,
  });
  
  const stats = await aggregateReferralStats(trimmedAddresses, contractId);

  console.log('Referral volume stats loaded from Mimir:', {
    referredProfileId,
    contractId,
    voiAddresses: trimmedAddresses,
    stats,
  });

  // Cache for 10 minutes
  if (stats) {
    appCache.set(cacheKey, stats, 600);
  }

  return stats;
}


