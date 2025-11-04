import type { PageServerLoad } from './$types';
import { requirePermission, PERMISSIONS } from '$lib/auth/admin';

export const load: PageServerLoad = async ({ cookies }) => {
	await requirePermission(cookies, PERMISSIONS.VIEW_REFERRALS);
	return {};
};
