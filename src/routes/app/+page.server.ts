import { redirect } from '@sveltejs/kit';
import { getProfileWithAccounts, isUserActivated } from '$lib/profile/data';
import { REF_FLASH_COOKIE } from '$lib/utils/referral';
import type { PageServerLoad } from './$types';

type ReferralFlash = { type: 'success' | 'error'; message: string };

export const load: PageServerLoad = async ({ parent, cookies }) => {
	// Get session from parent layout
	const { session } = await parent();

	// Get full profile with accounts
	const profileData = await getProfileWithAccounts(session.profileId);

	// Redirect to auth if not logged in (shouldn't happen due to layout, but safety check)
	if (!profileData) {
		throw redirect(302, '/auth');
	}

	// Check if user is activated (has entered a referral code)
	const activated = await isUserActivated(profileData.profile.id);

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

    return {
        profileData,
        isActivated: activated,
        referralFlash,
        voiAddress: session.voiAddress ?? null,
    };
};
