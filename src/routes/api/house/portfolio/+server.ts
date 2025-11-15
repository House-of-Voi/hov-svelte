import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { portfolioService } from '$lib/voi/house/portfolio-service';

const supabaseAdmin = createAdminClient();

/**
 * GET /api/house/portfolio
 * Returns aggregated portfolio across all user addresses and contracts
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
		// Get all Voi addresses linked to this profile
		const { data: accounts } = await supabaseAdmin
			.from('accounts')
			.select('address')
			.eq('profile_id', session.profileId)
			.eq('chain', 'voi');

		const addresses = [
			...(accounts || []).map((a) => a.address),
			...(session.voiAddress ? [session.voiAddress] : [])
		];

		// Get all active slot machine configs with YBT
		const { data: contracts } = await supabaseAdmin
			.from('slot_machine_configs')
			.select('*')
			.eq('is_active', true)
			.not('ybt_app_id', 'is', null);

		if (!contracts) {
			return json({ portfolio: { totalValue: '0', totalShares: '0', positions: [], addresses } });
		}

		// Get portfolio
		const portfolio = await portfolioService.getPortfolio(addresses, contracts);

		// Convert bigints to strings for JSON
		return json({
			portfolio: {
				totalValue: portfolio.totalValue.toString(),
				totalShares: portfolio.totalShares.toString(),
				positions: portfolio.positions.map((p) => ({
					...p,
					shares: p.shares.toString(),
					voiValue: p.voiValue.toString()
				})),
				addresses: portfolio.addresses
			}
		});
	} catch (err) {
		console.error('Error fetching portfolio:', err);
		throw error(500, 'Failed to fetch portfolio');
	}
};
