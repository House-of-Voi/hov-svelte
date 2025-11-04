import { redirect } from '@sveltejs/kit';
import { getServerSessionFromCookies } from '$lib/auth/session';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
	// Check authentication
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
