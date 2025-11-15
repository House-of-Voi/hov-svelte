import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';

const supabaseAdmin = createAdminClient();

/**
 * GET /api/wallets
 * Returns all Voi addresses linked to the current user's profile
 */
export const GET: RequestHandler = async ({ locals }) => {
	const session = locals.session;

	if (!session) {
		throw error(401, 'Unauthorized');
	}

	try {
		const { data: accounts, error: fetchError } = await supabaseAdmin
			.from('accounts')
			.select('id, address, wallet_provider, is_primary, created_at')
			.eq('profile_id', session.profileId)
			.eq('chain', 'voi')
			.order('created_at', { ascending: false });

		if (fetchError) {
			console.error('Error fetching wallets:', fetchError);
			throw error(500, 'Failed to fetch wallets');
		}

		return json({
			wallets: accounts || [],
			cdpAddress: session.voiAddress || null
		});
	} catch (err) {
		if (err instanceof Response) {
			throw err;
		}

		console.error('Error in wallets endpoint:', err);
		throw error(500, 'Internal server error');
	}
};

/**
 * DELETE /api/wallets
 * Unlinks a wallet from the user's profile
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
	const session = locals.session;

	if (!session) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await request.json();
		const { address } = body;

		if (!address) {
			throw error(400, 'Missing address field');
		}

		// Verify the wallet belongs to this user before deleting
		const { data: account } = await supabaseAdmin
			.from('accounts')
			.select('id, profile_id')
			.eq('chain', 'voi')
			.eq('address', address)
			.single();

		if (!account) {
			throw error(404, 'Wallet not found');
		}

		if (account.profile_id !== session.profileId) {
			throw error(403, 'Wallet does not belong to your profile');
		}

		// Delete the account
		const { error: deleteError } = await supabaseAdmin
			.from('accounts')
			.delete()
			.eq('id', account.id);

		if (deleteError) {
			console.error('Error unlinking wallet:', deleteError);
			throw error(500, 'Failed to unlink wallet');
		}

		return json({ success: true, message: 'Wallet unlinked successfully' });
	} catch (err) {
		if (err instanceof Response) {
			throw err;
		}

		console.error('Error in wallet unlink endpoint:', err);
		throw error(500, 'Internal server error');
	}
};
