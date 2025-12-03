import { redirect } from '@sveltejs/kit';
import { getProfileAccounts, isUserActivated } from '$lib/profile/data';
import { REF_FLASH_COOKIE } from '$lib/utils/referral';
import type { PageServerLoad } from './$types';

type ReferralFlash = { type: 'success' | 'error'; message: string };

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
	};
};
