import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * App layout server load
 * 
 * Uses session from hooks.server.ts which validates session against database.
 * If no session, redirects to auth.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	// Use session from hooks.server.ts (validated against database)
	const session = locals.session;

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
