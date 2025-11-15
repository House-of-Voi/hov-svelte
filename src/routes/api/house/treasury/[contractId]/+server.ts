import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ybtService } from '$lib/voi/house/ybt-service';
import { createAdminClient } from '$lib/db/supabaseAdmin';

const supabaseAdmin = createAdminClient();

export const GET: RequestHandler = async ({ params, locals }) => {
	// Require authentication
	if (!locals.session) {
		throw error(401, 'Unauthorized');
	}

	const contractId = parseInt(params.contractId);
	if (isNaN(contractId)) {
		throw error(400, 'Invalid contract ID');
	}

	try {
		// Get contract config from database
		const { data: contract, error: dbError } = await supabaseAdmin
			.from('slot_machine_configs')
			.select('*')
			.eq('contract_id', contractId)
			.single();

		if (dbError || !contract) {
			throw error(404, 'Contract not found');
		}

		if (!contract.ybt_app_id) {
			throw error(400, 'Contract does not have YBT support');
		}

		// Get treasury balance from YBT service
		const treasury = await ybtService.getTreasuryBalance(contractId, contract.ybt_app_id);

		return json({
			treasury: {
				...treasury,
				// Convert bigints to strings for JSON serialization
				balanceTotal: treasury.balanceTotal.toString(),
				balanceAvailable: treasury.balanceAvailable.toString(),
				balanceLocked: treasury.balanceLocked.toString(),
				totalSupply: treasury.totalSupply.toString(),
				sharePrice: treasury.sharePrice.toString()
			}
		});
	} catch (err: any) {
		console.error('Error fetching treasury balance:', err);

		if (err.status) {
			throw err; // Re-throw SvelteKit errors
		}

		throw error(500, err.message || 'Failed to fetch treasury balance');
	}
};
