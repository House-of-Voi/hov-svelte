import { isAdmin } from '$lib/auth/admin';
import type { PageServerLoad } from './$types';

interface SlotConfig {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  theme: string | null;
  contract_id: number;
  chain: 'base' | 'voi' | 'solana';
  game_type: '5reel' | 'w2w';
  rtp_target: string;
  house_edge: string;
  min_bet: number;
  max_bet: number;
  max_paylines: number;
  launched_at: string;
}

async function fetchFeaturedGames(fetch: typeof globalThis.fetch): Promise<SlotConfig[]> {
  try {
    const response = await fetch('/api/games/slot-configs');

    if (!response.ok) {
      console.error('Failed to fetch slot configs:', response.statusText);
      return [];
    }

    const data = await response.json();
    // Return up to 6 featured games
    return data.success ? (data.data as SlotConfig[]).slice(0, 6) : [];
  } catch (err) {
    console.error('Error fetching featured games:', err);
    return [];
  }
}

export const load: PageServerLoad = async ({ cookies, fetch, locals }) => {
  // Check if the current user is an admin
  const isAdminUser = await isAdmin(cookies);

  // Fetch featured games for the landing page
  const featuredGames = await fetchFeaturedGames(fetch);

  // Check if user has game access
  const hasGameAccess = locals.session?.gameAccessGranted || false;

  return {
    isAdminUser,
    featuredGames,
    hasGameAccess,
  };
};
