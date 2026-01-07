import type { PageServerLoad } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { getGameAccountsForProfile } from '$lib/auth/session';

const supabaseAdmin = createAdminClient();

export const load: PageServerLoad = async ({ locals }) => {
	const session = locals.session!; // Guaranteed by layout

	// Get all game accounts for this profile (CDP-managed accounts)
	const gameAccounts = await getGameAccountsForProfile(session.profileId);

	// Get all active machines with treasury contracts
	const { data: contracts } = await supabaseAdmin
		.from('machines')
		.select('*')
		.eq('is_active', true)
		.not('treasury_contract_id', 'is', null)
		.order('created_at', { ascending: false });

	return {
		gameAccounts,
		activeGameAccountId: session.activeGameAccountId,
		contracts: contracts || [],
		session // Pass session for external wallet support
	};
};
