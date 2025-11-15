import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';

const supabaseAdmin = createAdminClient();

/**
 * GET /api/wallets/check?address=ADDR
 * Checks if a wallet address is linked to the current user's profile
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const session = locals.session;

	if (!session) {
		throw error(401, 'Unauthorized');
	}

	const address = url.searchParams.get('address');

	if (!address) {
		throw error(400, 'Missing address parameter');
	}

	try {
		const { data: account } = await supabaseAdmin
			.from('accounts')
			.select('id, profile_id')
			.eq('chain', 'voi')
			.eq('address', address)
			.single();

		const isLinked = account?.profile_id === session.profileId;

		return json({
			isLinked,
			address
		});
	} catch (err) {
		console.error('Error checking wallet link status:', err);
		throw error(500, 'Failed to check wallet status');
	}
};
