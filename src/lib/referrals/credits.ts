// Referral credits calculation utilities

export const DEFAULT_REFERRAL_CREDIT_PERCENTAGE = 2.0; // 2% of wagered amount

export interface ReferralVolumeStats {
  totalWagered: number;
  creditsEarned: number;
  gamesPlayed: number;
}

export interface ReferralCreditBalance {
  availableCredits: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  pendingCredits: number;
}

export interface ReferralDetails {
  referralCode: string;
  referredUsername: string;
  referredProfileId: string;
  joinedAt: string;
  totalWagered: number;
  gamesPlayed: number;
  creditsEarnedForReferrer: number;
  totalCreditsEarned: number;
  lastPlayedAt: string | null;
}

/**
 * Referral with enriched Mimir statistics
 */
export interface ReferralWithStats extends ReferralDetails {
  referredUserAvatar: string | null;
  referredUserEmailOrPhone: string | null;
  mimirStats: {
    totalSpins: number;
    totalBet: string;
    totalWon: string;
    netResult: string;
    lastPlayedAt: string | null;
    creditsEarned: number;
  } | null;
  isActive: boolean;
  referralCodeId: string | null;
}

/**
 * Referral dashboard data with aggregated statistics
 */
export interface ReferralDashboardData {
  codesGenerated: number;
  codesAvailable: number;
  maxReferrals: number;
  activeReferrals: number;
  queuedReferrals: number;
  totalReferrals: number;
  referrals: ReferralWithStats[];
  aggregateStats: {
    totalVolume: string;
    totalCreditsEarned: number;
    totalSpins: number;
    activeCount: number;
  };
}

/**
 * Calculate credits earned from a wager amount
 * @param wagerAmount - Amount wagered by referred player
 * @param percentage - Percentage to award (default 5%)
 * @returns Credits earned
 */
export function calculateCreditsFromWager(
  wagerAmount: number,
  percentage: number = DEFAULT_REFERRAL_CREDIT_PERCENTAGE
): number {
  return (wagerAmount * percentage) / 100;
}


/**
 * Calculate aggregate volume statistics for all referrals
 * @param referrals - Array of referral details
 * @returns Aggregate statistics
 */
export function aggregateReferralVolume(
  referrals: ReferralDetails[]
): ReferralVolumeStats {
  return referrals.reduce(
    (acc, referral) => ({
      totalWagered: acc.totalWagered + referral.totalWagered,
      creditsEarned: acc.creditsEarned + referral.creditsEarnedForReferrer,
      gamesPlayed: acc.gamesPlayed + referral.gamesPlayed,
    }),
    { totalWagered: 0, creditsEarned: 0, gamesPlayed: 0 }
  );
}

/**
 * Format currency with proper decimal places
 * @param amount - Amount to format
 * @param decimals - Number of decimal places (default 2)
 * @returns Formatted string
 */
export function formatCurrency(amount: number, decimals: number = 2): string {
  return amount.toFixed(decimals);
}

/**
 * Format large numbers with K/M suffix
 * @param num - Number to format
 * @returns Formatted string
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toFixed(2);
}
