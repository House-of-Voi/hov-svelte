import { redirect } from '@sveltejs/kit';
import { getProfileAccounts, isUserActivated } from '$lib/profile/data';
import { REF_FLASH_COOKIE } from '$lib/utils/referral';
import { getPlayerStatsSafe } from '$lib/mimir/queries';
import { mimirClient } from '$lib/mimir/client';
import type { PageServerLoad } from './$types';
import type { PlayerStats } from '$lib/types/profile';

type ReferralFlash = { type: 'success' | 'error'; message: string };

/**
 * Calculate consecutive days playing streak for a user
 */
async function calculateStreak(voiAddress: string): Promise<number> {
	try {
		const { data, error } = await mimirClient
			.from('hov_events')
			.select('created_at')
			.eq('who', voiAddress.trim())
			.order('created_at', { ascending: false });

		if (error || !data || data.length === 0) {
			return 0;
		}

		// Extract unique dates (UTC)
		const playDates = new Set<string>();
		for (const row of data) {
			const date = new Date(row.created_at);
			const dateStr = date.toISOString().split('T')[0];
			playDates.add(dateStr);
		}

		// Calculate streak from today backward
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);
		const todayStr = today.toISOString().split('T')[0];

		let currentStreak = 0;
		const checkDate = new Date(today);

		// If no play today, check yesterday to start streak
		if (!playDates.has(todayStr)) {
			checkDate.setUTCDate(checkDate.getUTCDate() - 1);
			const yesterdayStr = checkDate.toISOString().split('T')[0];
			if (!playDates.has(yesterdayStr)) {
				return 0;
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

		return currentStreak;
	} catch (err) {
		console.error('Failed to calculate streak:', err);
		return 0;
	}
}

export const load: PageServerLoad = async ({ parent, cookies, locals }) => {
	// Get profile and game accounts from parent layout
	const { profile, gameAccounts } = await parent();

	// Redirect if no profile (shouldn't happen as layout creates one)
	if (!profile) {
		throw redirect(302, '/auth');
	}

	// Get legacy connected accounts for this profile
	// These are from the old 'accounts' table - can be upgraded by re-importing mnemonic
	const legacyAccounts = await getProfileAccounts(profile.id);

	// Check if user is activated (has entered a referral code)
	const activated = await isUserActivated(profile.id);

	// Read referral flash message if present
	const flashCookie = cookies.get(REF_FLASH_COOKIE);
	let referralFlash: ReferralFlash | null = null;

	if (flashCookie) {
		try {
			const parsed = JSON.parse(flashCookie) as ReferralFlash;
			if (
				parsed &&
				typeof parsed === 'object' &&
				(parsed.type === 'success' || parsed.type === 'error') &&
				typeof parsed.message === 'string'
			) {
				referralFlash = parsed;
			}
		} catch (error) {
			console.error('Failed to parse referral flash cookie:', error);
		} finally {
			// Clear flash cookie after reading
			cookies.set(REF_FLASH_COOKIE, '', { path: '/', maxAge: 0 });
		}
	}

	// Get active game account ID
	const activeGameAccountId = locals.activeGameAccount?.id;
	const voiAddress = locals.voiAddress;

	// Fetch player stats and streak in parallel
	let playerStats: PlayerStats = {
		totalSpins: 0,
		winRate: 0,
		currentStreak: 0,
		lastPlayed: null
	};

	if (voiAddress) {
		try {
			const [stats, streak] = await Promise.all([
				getPlayerStatsSafe(voiAddress),
				calculateStreak(voiAddress)
			]);

			playerStats = {
				totalSpins: stats?.total_spins || 0,
				winRate: stats?.win_rate || 0,
				currentStreak: streak,
				lastPlayed: stats?.last_spin || null
			};
		} catch (err) {
			console.error('Failed to fetch player stats:', err);
		}
	}

	return {
		profileData: {
			profile,
			// Keep legacy accounts for backward compatibility + migration
			accounts: legacyAccounts,
			primaryAccount: legacyAccounts.find(a => a.is_primary) || null
		},
		// Game accounts for the new unified accounts manager
		gameAccounts: gameAccounts || [],
		activeGameAccountId,
		// Legacy accounts filtered to Voi chain for upgrade prompts
		legacyAccounts: legacyAccounts.filter(a => a.chain === 'voi').map(a => ({
			chain: a.chain,
			address: a.address,
			isPrimary: a.is_primary || false
		})),
		isActivated: activated,
		referralFlash,
		voiAddress,
		playerStats,
	};
};
