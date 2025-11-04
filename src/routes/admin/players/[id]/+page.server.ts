import type { PageServerLoad } from './$types';
import { requirePermission, PERMISSIONS } from '$lib/auth/admin';

export const load: PageServerLoad = async ({ cookies, params }) => {
	await requirePermission(cookies, PERMISSIONS.VIEW_PLAYERS);

	return {
		playerId: params.id
	};
};
