import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { portfolioService } from '$lib/voi/house/portfolio-service';

const supabaseAdmin = createAdminClient();

/**
 * GET /api/house/positions/[contractId]
 * Returns user's position for a specific contract
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
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

	const contractId = parseInt(params.contractId);
	const address = url.searchParams.get('address') || session.voiAddress;

	if (!address) {
		throw error(400, 'Address required');
	}

	try {
		// Get contract info
		const { data: contract } = await supabaseAdmin
			.from('slot_machine_configs')
			.select('*')
			.eq('contract_id', contractId)
			.single();

		if (!contract || !contract.ybt_app_id) {
			throw error(404, 'Contract not found or YBT not configured');
		}

		// Get position
		const position = await portfolioService.getPosition(address, contract);

		if (!position) {
			return json({ position: null });
		}

		// Convert bigints to strings for JSON
		return json({
			position: {
				...position,
				shares: position.shares.toString(),
				voiValue: position.voiValue.toString()
			}
		});
	} catch (err) {
		if (err instanceof Response) {
			throw err;
		}

		console.error('Error fetching position:', err);
		throw error(500, 'Failed to fetch position');
	}
};
