import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/auth/admin';

export const load: PageServerLoad = async ({ cookies }) => {
	try {
		const adminRole = await requireAdmin(cookies);
		return { adminRole };
	} catch {
		throw redirect(303, '/admin');
	}
};
