import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Referral management is now a modal in the dashboard
	throw redirect(302, '/app');
};
