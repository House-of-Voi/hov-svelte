// Machine types enum (matches database machine_type enum)
export type MachineType = 'slots_5reel' | 'slots_w2w' | 'keno' | 'roulette';

// Machine status enum (matches database machine_status enum)
export type MachineStatus =
  | 'draft'
  | 'deploying'
  | 'bootstrapping'
  | 'active'
  | 'paused'
  | 'failed'
  | 'deprecated';

// Deployment phase type
export type DeploymentPhase =
  | 'phase1'
  | 'phase1b'
  | 'phase2'
  | 'phase2b'
  | 'phase3'
  | 'complete';

// Deployment state for recovery
export interface DeploymentState {
  currentPhase: DeploymentPhase;
  deployerAddress: string;
  gameAppId?: number;
  treasuryAppId?: number;
  startedAt: string;
  lastUpdatedAt: string;
}

// Deployment log entry for audit trail
export interface DeploymentLogEntry {
  phase: string;
  txid?: string;
  timestamp: string;
  deployer: string;
  appId?: number;
  status: 'success' | 'failed';
  error?: string;
}

// Main Machine interface (replaces SlotMachineConfig)
export interface Machine {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  theme?: string;

  // Type & Chain
  machine_type: MachineType;
  chain: 'voi' | 'base' | 'solana';

  // Contract IDs (on-chain)
  game_contract_id?: number;
  treasury_contract_id?: number;
  treasury_asset_id?: number;

  // Game Configuration
  config: Record<string, unknown>;
  rtp_target?: number;
  house_edge?: number;
  min_bet: number;
  max_bet: number;

  // Platform Economics
  platform_fee_percent: number;
  platform_treasury_address?: string;

  // Status & Lifecycle
  status: MachineStatus;
  is_active: boolean;
  version: number;

  // Contract Versions (for selecting correct client)
  game_contract_version: number;
  treasury_contract_version: number;

  // Deployment Tracking
  created_by?: string;
  deployment_tx_id?: string;
  deployment_error?: string;
  deployment_started_at?: string;
  deployment_completed_at?: string;
  deployment_state?: DeploymentState;
  deployment_log?: DeploymentLogEntry[];
  last_deployment_attempt?: string;

  // Timestamps
  created_at: string;
  updated_at: string;
  launched_at?: string;
  deprecated_at?: string;
}

// Legacy alias for backwards compatibility during migration
// TODO: Remove after all code is updated to use Machine
export type SlotMachineConfig = Machine & {
  // Legacy field mappings
  contract_id: number; // maps to game_contract_id
  ybt_app_id?: number; // maps to treasury_contract_id
  ybt_asset_id?: number; // maps to treasury_asset_id
  reel_config: Record<string, unknown>; // maps to config
  game_type?: '5reel' | 'w2w'; // maps to machine_type
  max_paylines?: number; // now in config
  treasury_address?: string; // maps to platform_treasury_address
};

export interface StatsSnapshotDaily {
  id: string;
  date: string;
  snapshot_type: 'platform' | 'machine' | 'leaderboard';
  machine_id?: string;
  stats_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface StatsSnapshotHourly {
  id: string;
  hour: string;
  snapshot_type: 'leaderboard_address' | 'leaderboard_profile' | 'trending';
  machine_id?: string;
  stats_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MimirPlayerStats {
  player_address: string;
  total_spins: number;
  winning_spins: number;
  losing_spins: number;
  total_bet: string;
  total_won: string;
  net_result: string;
  rtp: number;
  win_rate: number;
  largest_win: string;
  largest_bet: string;
  avg_bet: string;
  avg_payout: string;
  first_spin: string;
  last_spin: string;
}

export interface MimirPlatformStats {
  total_bets: number;
  total_amount_bet: number;
  total_amount_paid: number;
  total_winning_spins: number;
  average_bet_size: number;
  average_payout: number;
  win_percentage: number;
  house_edge: number;
  rtp: number;
  net_platform_result: number;
  unique_players: number;
  largest_single_win: number;
  largest_single_bet: number;
}

export interface MimirLeaderboardEntry {
  rank: number;
  identifier: string;
  linked_addresses: string[];
  total_spins: number;
  total_bet: string;
  total_won: string;
  net_result: string;
  rtp: number;
  win_rate: number;
  largest_win: string;
  largest_bet?: string;
}

export interface MimirSpinEvent {
  id: string;
  chain: 'voi' | 'base' | 'solana';
  txid: string;
  block: number;
  round: number;
  timestamp: string;
  contract_id: number;
  player_address: string;
  amount: string;
  payout: string;
  net_result: string;
  max_payline_index?: number;
  result_data?: {
    reelStops: number[];
    wins: unknown[];
    seed: string;
  };
}

export interface TournamentLeaderboardEntry {
  rank: number;
  who: string;
  total_volume?: string;
  total_amount_won?: string;
  largest_single_win?: string;
  total_spins?: number;
  rtp_percent?: number;
  longest_win_streak?: number;
  longest_losing_streak?: number;
  volume_rank?: number;
  rtp_rank?: number;
  streak_rank?: number;
  combined_rank?: number;
}

export interface TournamentResponse {
  params: {
    app_id: number;
    start_ts: string;
    end_ts: string;
    limit: number;
    min_spins: number;
    min_volume_micro: number;
  };
  categories: {
    volume: TournamentLeaderboardEntry[];
    total_won: TournamentLeaderboardEntry[];
    biggest_win: TournamentLeaderboardEntry[];
    rtp: TournamentLeaderboardEntry[];
    win_streak: TournamentLeaderboardEntry[];
    losing_streak: TournamentLeaderboardEntry[];
    overall: TournamentLeaderboardEntry[];
  };
}

// Re-export token types for convenience
export type {
  Token,
  TokenWithBalance,
  TokenCreateRequest,
  TokenUpdateRequest,
  TokenFilter,
  ChainType,
  TokenStandard,
} from './token';

export {
  getTokenDisplaySymbol,
  getTokenDisplayName,
  isNativeToken,
  isArc200Token,
  isAsaToken,
} from './token';
