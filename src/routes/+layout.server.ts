import type { LayoutServerLoad } from './$types';
import { isAdmin } from '$lib/auth/admin';
import { getCurrentProfile } from '$lib/profile/session';

export const load: LayoutServerLoad = async ({ cookies, locals }) => {
	const [isAdminUser, profileData] = await Promise.all([
		isAdmin(cookies),
		getCurrentProfile(cookies)
	]);

	return {
		session: locals.session,
		isAdminUser,
		initialProfile: profileData?.profile ?? null
	};
};
