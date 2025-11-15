import type { PageServerLoad } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';

const supabaseAdmin = createAdminClient();

export const load: PageServerLoad = async ({ locals }) => {
	const session = locals.session!; // Guaranteed by layout

	// Get all Voi addresses linked to this profile
	const { data: accounts } = await supabaseAdmin
		.from('accounts')
		.select('address, wallet_provider, created_at')
		.eq('profile_id', session.profileId)
		.eq('chain', 'voi')
		.order('created_at', { ascending: false });

	// Get all active slot machine configs with YBT
	const { data: contracts } = await supabaseAdmin
		.from('slot_machine_configs')
		.select('*')
		.eq('is_active', true)
		.not('ybt_app_id', 'is', null)
		.order('created_at', { ascending: false });

	return {
		linkedAddresses: accounts || [],
		contracts: contracts || [],
		cdpAddress: session.voiAddress
	};
};
