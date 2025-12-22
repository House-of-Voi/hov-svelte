/**
 * Profile page types
 */

export type ProfileTab = 'portfolio' | 'statistics' | 'referrals' | 'favorites';

export interface PlayerStats {
  totalSpins: number;
  winRate: number;
  currentStreak: number;
  lastPlayed: string | null;
}

export interface ProfileTabConfig {
  id: ProfileTab;
  label: string;
}

export const PROFILE_TABS: ProfileTabConfig[] = [
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'statistics', label: 'Statistics' },
  { id: 'referrals', label: 'Referrals' },
  { id: 'favorites', label: 'Favorite Games' },
];

/**
 * Statistics tab types
 */

export type StatsPeriod = 'all' | 'daily';

export interface BiggestWin {
  date: string;
  amount: string;
  betAmount: string;
  lines: number;
}

export interface StatsSummary {
  totalSpins: number;
  totalWagered: string;
  totalWon: string;
  winRate: number;
  rtp: number;
  biggestWin: string;
  avgBetSize: string;
}

export interface DetailedAnalytics {
  longestWinStreak: number;
  longestLosingStreak: number;
  daysSinceFirstBet: number;
  favoriteBet: string;
  totalPaylines: number;
  longestDayStreak: number;
}

export interface ExtendedPlayerStats {
  // Basic stats
  totalSpins: number;
  totalBet: string;
  totalWon: string;
  winRate: number;
  rtp: number;
  largestWin: string;
  avgBet: string;
  firstSpin: string | null;
  lastSpin: string | null;

  // Extended stats
  biggestWins: BiggestWin[];
  longestWinStreak: number;
  longestLosingStreak: number;
  totalPaylines: number;
  mostCommonBet: string;
  daysActive: number;
}
