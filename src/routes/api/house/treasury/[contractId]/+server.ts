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
		// Get contract config from machines table
		const { data: contract, error: dbError } = await supabaseAdmin
			.from('machines')
			.select('*')
			.eq('game_contract_id', contractId)
			.single();

		if (dbError || !contract) {
			throw error(404, 'Contract not found');
		}

		if (!contract.treasury_contract_id) {
			throw error(400, 'Contract does not have treasury support');
		}

		// Get treasury balance from YBT service
		const treasury = await ybtService.getTreasuryBalance(contractId, contract.treasury_contract_id);

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
