import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

interface GameConfig {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  theme: string | null;
  contract_id: number;
  chain: 'voi' | 'base' | 'solana';
  game_type: '5reel' | 'w2w';
  rtp_target: number;
  house_edge: number;
  min_bet: number;
  max_bet: number;
  max_paylines: number;
  launched_at: string;
}

export const load: PageServerLoad = async ({ params, fetch }) => {
  const { contractId } = params;

  // Fetch game config from API
  const response = await fetch(`/api/games/slot-configs?contract_id=${contractId}`);

  if (!response.ok) {
    throw error(500, 'Failed to fetch game configuration');
  }

  const result = await response.json();

  if (!result.success || !result.data) {
    throw error(404, 'Game not found');
  }

  const gameConfig: GameConfig = result.data;

  // Determine token based on chain
  const tokenMap: Record<string, string> = {
    voi: 'VOI',
    base: 'USDC',
    solana: 'SOL',
  };

  const token = tokenMap[gameConfig.chain] || 'VOI';

  // Generate mock stats for now (these would come from a real endpoint)
  const mockStats = {
    totalBet: '50.1M',
    players: 46,
    winRate: '26.4%',
  };

  // Generate mock queue data (recent plays)
  const mockPlays = [
    {
      bet: '20 VOI',
      lines: 20,
      won: '40 VOI',
      multiplier: '0.50x',
      roundId: 13306774,
      timestamp: '2025-11-19T05:08:00Z',
    },
    {
      bet: '20 VOI',
      lines: 20,
      won: '40 VOI',
      multiplier: '0.50x',
      roundId: 13306773,
      timestamp: '2025-11-19T05:07:00Z',
    },
    {
      bet: '20 VOI',
      lines: 20,
      won: '40 VOI',
      multiplier: '0.50x',
      roundId: 13306772,
      timestamp: '2025-11-19T05:06:00Z',
    },
  ];

  return {
    gameConfig,
    token,
    stats: mockStats,
    recentPlays: mockPlays,
  };
};
