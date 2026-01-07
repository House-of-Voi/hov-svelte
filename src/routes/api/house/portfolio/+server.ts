import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { portfolioService } from '$lib/voi/house/portfolio-service';

const supabaseAdmin = createAdminClient();

/**
 * GET /api/house/portfolio
 * Returns aggregated portfolio across all user addresses and contracts
 */
export const GET: RequestHandler = async ({ locals, url }) => {
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
		// Get external wallet addresses if provided (can be multiple)
		const externalAddresses = url.searchParams.getAll('externalAddress');

		// Get all Voi addresses linked to this profile (legacy accounts table)
		const { data: accounts } = await supabaseAdmin
			.from('accounts')
			.select('address')
			.eq('profile_id', session.profileId)
			.eq('chain', 'voi');

		// Get all game accounts for this profile
		const { data: gameAccounts } = await supabaseAdmin
			.from('game_accounts')
			.select('voi_address')
			.eq('profile_id', session.profileId);

		const addresses = [
			...(accounts || []).map((a) => a.address),
			...(gameAccounts || []).map((a) => a.voi_address),
			...(session.voiAddress ? [session.voiAddress] : []),
			// Include external wallet addresses if provided
			...externalAddresses
		];

		// Deduplicate addresses
		const uniqueAddresses = [...new Set(addresses)];

		// Get all active machines with treasury contracts
		const { data: contracts } = await supabaseAdmin
			.from('machines')
			.select('*')
			.eq('is_active', true)
			.not('treasury_contract_id', 'is', null);

		if (!contracts) {
			return json({ portfolio: { totalValue: '0', totalShares: '0', positions: [], addresses: uniqueAddresses } });
		}

		// Get portfolio
		const portfolio = await portfolioService.getPortfolio(uniqueAddresses, contracts);

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
