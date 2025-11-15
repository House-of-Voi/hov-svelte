import { redirect, error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';

const supabaseAdmin = createAdminClient();

export const load: LayoutServerLoad = async ({ locals }) => {
	// Check authentication
	if (!locals.session) {
		throw redirect(303, '/auth');
	}

	// Check game_access_granted permission (same as /games)
	const { data: profile, error: profileError } = await supabaseAdmin
		.from('profiles')
		.select('game_access_granted')
		.eq('id', locals.session.profileId)
		.single();

	if (profileError) {
		console.error('Error fetching profile:', profileError);
		throw error(500, 'Failed to load profile');
	}

	if (!profile?.game_access_granted) {
		throw redirect(303, '/games'); // Redirect to games page where they'll see waitlist
	}

	return {
		session: locals.session,
		hasAccess: true
	};
};
