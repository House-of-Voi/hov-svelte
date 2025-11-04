import type { PageServerLoad } from './$types';
import { requirePermission, PERMISSIONS } from '$lib/auth/admin';
import { createAdminClient } from '$lib/db/supabaseAdmin';

interface WaitlistUser {
	id: string;
	primary_email: string;
	display_name: string | null;
	waitlist_position: number | null;
	waitlist_joined_at: string | null;
	game_access_granted: boolean;
	created_at: string;
}

export const load: PageServerLoad = async ({ cookies, url }) => {
	await requirePermission(cookies, PERMISSIONS.MANAGE_WAITLIST);

	const supabase = createAdminClient();
	const showReferredOnly = url.searchParams.get('filter') === 'referred';

	let waitlistUsers: WaitlistUser[] = [];

	if (showReferredOnly) {
		const { data: referredUsers } = await supabase
			.from('referrals')
			.select('referred_profile_id')
			.not('referred_profile_id', 'is', null);

		const referredIds =
			referredUsers?.map((r: { referred_profile_id: string | null }) => r.referred_profile_id).filter(Boolean) ??
			[];

		if (referredIds.length > 0) {
			const { data } = await supabase
				.from('profiles')
				.select(
					'id, primary_email, display_name, waitlist_position, waitlist_joined_at, game_access_granted, created_at'
				)
				.eq('game_access_granted', false)
				.in('id', referredIds as string[])
				.order('waitlist_joined_at', { ascending: true });

			waitlistUsers = (data as WaitlistUser[]) ?? [];
		}
	} else {
		const { data } = await supabase
			.from('profiles')
			.select(
				'id, primary_email, display_name, waitlist_position, waitlist_joined_at, game_access_granted, created_at'
			)
			.eq('game_access_granted', false)
			.order('waitlist_joined_at', { ascending: true });

		waitlistUsers = (data as WaitlistUser[]) ?? [];
	}

	const usersWithReferrals = await Promise.all(
		waitlistUsers.map(async (user) => {
			const { data: referral } = await supabase
				.from('referrals')
				.select(
					`
						is_active,
						referrer_profile:referrer_profile_id (
							primary_email,
							display_name
						)
					`
				)
				.eq('referred_profile_id', user.id)
				.single();

			let referralInfo: { isActive: boolean; referrerName: string } | null = null;

			if (referral) {
				const refProfile = referral.referrer_profile as unknown as {
					display_name?: string | null;
					primary_email: string;
				};

				referralInfo = {
					isActive: Boolean(referral.is_active),
					referrerName: refProfile.display_name || refProfile.primary_email || 'Unknown',
				};
			}

			return {
				...user,
				referral: referralInfo,
			};
		})
	);

	const { count: approvedCount } = await supabase
		.from('profiles')
		.select('*', { count: 'exact', head: true })
		.eq('game_access_granted', true);

	const { count: totalWaitlistCount } = await supabase
		.from('profiles')
		.select('*', { count: 'exact', head: true })
		.eq('game_access_granted', false);

	return {
		waitlistUsers: usersWithReferrals,
		approvedCount: approvedCount ?? 0,
		totalWaitlistCount: totalWaitlistCount ?? 0,
		showReferredOnly,
	};
};
