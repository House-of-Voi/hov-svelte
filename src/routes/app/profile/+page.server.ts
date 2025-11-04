import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Profile is now merged with dashboard
	throw redirect(302, '/app');
};
