import type { LayoutServerLoad } from './$types';
import { isAdmin } from '$lib/auth/admin';
import { getCurrentProfile } from '$lib/profile/session';

export const load: LayoutServerLoad = async ({ cookies, locals }) => {
	const [isAdminUser, profileData] = await Promise.all([
		isAdmin(cookies),
		getCurrentProfile(cookies)
	]);

	const hovSession = locals.hovSession;

	return {
		hovSession,
		session: hovSession, // Alias for backward compatibility with child routes
		hasGameAccess: hovSession?.gameAccessGranted || false, // For game routes using @layout reset
		supabaseSession: locals.supabaseSession,
		isAdminUser,
		initialProfile: profileData?.profile ?? null
	};
};
