import { redirect } from '@sveltejs/kit';
import { getServerSessionFromCookies } from '$lib/auth/session';
import type { LayoutServerLoad } from './$types';

/**
 * App layout server load
 * 
 * Checks for valid HTTP session cookie. CDP session restoration happens client-side
 * via VoiAddressProvider, which will redirect to /auth if CDP is not signed in.
 */
export const load: LayoutServerLoad = async ({ cookies }) => {
	// Check HTTP session cookie (allows client-side CDP restoration)
	const session = await getServerSessionFromCookies(cookies);

	if (!session) {
		throw redirect(302, '/auth');
	}

	// Check if user needs onboarding (display_name is null)
	const needsOnboarding = !session.displayName;

	if (!session.primaryEmail) {
		throw new Error('Session missing primary email - CDP authentication failed');
	}

	return {
		session,
		needsOnboarding,
		primaryEmail: session.primaryEmail
	};
};
