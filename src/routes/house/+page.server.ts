import type { PageServerLoad } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { getGameAccountsForProfile } from '$lib/auth/session';

const supabaseAdmin = createAdminClient();

export const load: PageServerLoad = async ({ locals }) => {
	const session = locals.session!; // Guaranteed by layout

	// Get all game accounts for this profile (CDP-managed accounts)
	const gameAccounts = await getGameAccountsForProfile(session.profileId);

	// Get all active slot machine configs with YBT
	const { data: contracts } = await supabaseAdmin
		.from('slot_machine_configs')
		.select('*')
		.eq('is_active', true)
		.not('ybt_app_id', 'is', null)
		.order('created_at', { ascending: false });

	return {
		gameAccounts,
		activeGameAccountId: session.activeGameAccountId,
		contracts: contracts || [],
		session // Pass session for external wallet support
	};
};
