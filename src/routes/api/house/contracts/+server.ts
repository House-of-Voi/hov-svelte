import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';

const supabaseAdmin = createAdminClient();

/**
 * GET /api/house/contracts
 * Returns all active machines with treasury contracts
 */
export const GET: RequestHandler = async ({ locals }) => {
	const session = locals.session;

	if (!session) {
		throw error(401, 'Unauthorized');
	}

	// Check game access
	const { data: profile } = await supabaseAdmin
		.from('profiles')
		.select('game_access_granted')
		.eq('id', session.profileId)
		.single();

	if (!profile?.game_access_granted) {
		throw error(403, 'Game access required');
	}

	try {
		const { data: contracts, error: fetchError } = await supabaseAdmin
			.from('machines')
			.select('*')
			.eq('is_active', true)
			.not('treasury_contract_id', 'is', null)
			.order('created_at', { ascending: false });

		if (fetchError) {
			console.error('Error fetching contracts:', fetchError);
			throw error(500, 'Failed to fetch contracts');
		}

		return json({ contracts: contracts || [] });
	} catch (err) {
		console.error('Error in contracts endpoint:', err);
		throw error(500, 'Failed to fetch contracts');
	}
};
