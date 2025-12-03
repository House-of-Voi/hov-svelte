import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getOrCreateProfileForSupabaseUser, getProfileByAuthUserId } from '$lib/profile/data';

/**
 * App layout server load
 *
 * Uses Supabase auth from hooks.server.ts.
 * If not authenticated, redirects to auth.
 * Creates profile for new Supabase users.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	// Check Supabase authentication
	const user = locals.supabaseUser;

	if (!user) {
		// Don't add expired parameter - that's only for session expiry, not initial auth
		throw redirect(302, '/auth');
	}

	// Try to get or create profile
	let profile = await getProfileByAuthUserId(user.id);

	if (!profile && user.email) {
		// Create profile for new Supabase user
		profile = await getOrCreateProfileForSupabaseUser(
			user.id,
			user.email,
			user.user_metadata?.full_name || user.user_metadata?.name || null,
			user.user_metadata?.avatar_url || null
		);
	}

	// Check if user needs onboarding (display_name is null)
	const needsOnboarding = !profile?.display_name;

	// Check if user has any game accounts
	const gameAccounts = locals.gameAccounts || [];
	const hasGameAccount = gameAccounts.length > 0;

	// Get user's email for activation flow
	const primaryEmail = profile?.primary_email || user.email;

	return {
		hovSession: locals.hovSession,
		profile,
		needsOnboarding,
		userId: user.id,
		hasGameAccount,
		primaryEmail,
		gameAccounts
	};
};
