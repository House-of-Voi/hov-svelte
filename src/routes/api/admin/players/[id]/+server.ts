/**
 * Admin Player Detail API
 * Get, update, or delete a specific player
 */

import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { requirePermission, getCurrentProfileId, PERMISSIONS } from '$lib/auth/admin';
import { getPlayerStats } from '$lib/mimir/queries';
import type { PlayerDetail, PlayerUpdateData } from '$lib/types/admin';

export const GET: RequestHandler = async ({ params, cookies }) => {
	try {
		const profileId = await getCurrentProfileId(cookies);
		await requirePermission(cookies, PERMISSIONS.VIEW_PLAYERS, profileId ?? undefined);

		const { id: playerId } = params;
		const supabase = createAdminClient();

		// Get player profile with accounts
		const { data: profile, error: profileError } = await supabase
			.from('profiles')
			.select(`
        id,
        primary_email,
        display_name,
        avatar_url,
        max_referrals,
        game_access_granted,
        waitlist_position,
        waitlist_joined_at,
        deleted_at,
        created_at,
        updated_at,
        accounts (
          chain,
          address,
          is_primary
        )
      `)
			.eq('id', playerId)
			.single();

		if (profileError || !profile) {
			return json({ success: false, error: 'Player not found' }, { status: 404 });
		}

		// Check if player is soft-deleted
		if (profile.deleted_at) {
			return json({ success: false, error: 'Player has been deactivated' }, { status: 404 });
		}

		// Get referral stats
		const { data: referrals } = await supabase
			.from('referrals')
			.select('id, is_active')
			.eq('referrer_profile_id', playerId);

		const referrals_count = referrals?.length || 0;
		const active_referrals_count = referrals?.filter((r) => r.is_active).length || 0;

		// Get referral credits earned
		const { data: credits } = await supabase
			.from('referral_credits')
			.select('credit_earned')
			.eq('referrer_profile_id', playerId);

		const referral_credits_earned =
			credits?.reduce((sum, c) => sum + parseFloat(c.credit_earned), 0) || 0;

		// Get game plays for local stats
		const { data: plays } = await supabase
			.from('game_plays')
			.select('bet_amount, payout_amount, created_at')
			.eq('profile_id', playerId);

		const total_plays = plays?.length || 0;
		const total_wagered = plays?.reduce((sum, p) => sum + parseFloat(p.bet_amount), 0) || 0;
		const last_play_at = plays?.[0]?.created_at || null;

		// Get Mimir stats for each account
		const mimirStats = {
			total_spins: 0,
			total_bet: '0',
			total_won: '0',
			net_result: '0',
			win_rate: 0,
			largest_win: '0'
		};

		if (profile.accounts && profile.accounts.length > 0) {
			try {
				// Aggregate stats across all player addresses
				for (const account of profile.accounts) {
					try {
						// Note: getPlayerStats expects contractId, not chain
						// For now, we'll skip Mimir stats or you can pass a contractId if available
						const playerStats = await getPlayerStats(account.address);

						if (playerStats) {
							mimirStats.total_spins += playerStats.total_spins || 0;
							mimirStats.total_bet = (
								parseFloat(mimirStats.total_bet) + parseFloat(playerStats.total_bet || '0')
							).toString();
							mimirStats.total_won = (
								parseFloat(mimirStats.total_won) + parseFloat(playerStats.total_won || '0')
							).toString();

							const largestWin = parseFloat(playerStats.largest_win || '0');
							if (largestWin > parseFloat(mimirStats.largest_win)) {
								mimirStats.largest_win = largestWin.toString();
							}
						}
					} catch (err) {
						console.warn(`Failed to fetch Mimir stats for ${account.chain}:${account.address}`, err);
					}
				}

				// Calculate net result and win rate
				const totalBet = parseFloat(mimirStats.total_bet);
				const totalWon = parseFloat(mimirStats.total_won);
				mimirStats.net_result = (totalWon - totalBet).toString();
				mimirStats.win_rate = mimirStats.total_spins > 0 ? (totalWon / totalBet) * 100 : 0;
			} catch (error) {
				console.error('Error fetching Mimir stats:', error);
				// Continue with empty stats
			}
		}

		const playerDetail: PlayerDetail = {
			id: profile.id,
			primary_email: profile.primary_email,
			display_name: profile.display_name,
			avatar_url: profile.avatar_url,
			max_referrals: profile.max_referrals,
			game_access_granted: profile.game_access_granted,
			waitlist_position: profile.waitlist_position,
			waitlist_joined_at: profile.waitlist_joined_at,
			created_at: profile.created_at,
			updated_at: profile.updated_at,
			total_plays,
			total_wagered: total_wagered.toFixed(8),
			last_play_at,
			referrals_count,
			active_referrals_count,
			referral_credits_earned: referral_credits_earned.toFixed(8),
			accounts: (profile.accounts || []).map(
				(a: { chain: string; address: string; is_primary: boolean }) => ({
					chain: a.chain,
					address: a.address,
					is_primary: a.is_primary
				})
			),
			game_stats: mimirStats
		};

		return json({ success: true, data: playerDetail }, { status: 200 });
	} catch (err: unknown) {
		console.error('Error fetching player detail:', err);

		if (
			err instanceof Error &&
			(err.message?.includes('UNAUTHORIZED') || err.message?.includes('FORBIDDEN'))
		) {
			return json(
				{ success: false, error: err.message },
				{ status: err.message.includes('UNAUTHORIZED') ? 401 : 403 }
			);
		}

		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async ({ params, cookies, request }) => {
	try {
		const profileId = await getCurrentProfileId(cookies);
		await requirePermission(cookies, PERMISSIONS.EDIT_PLAYERS, profileId ?? undefined);

		const { id: playerId } = params;
		const body: PlayerUpdateData = await request.json();

		const supabase = createAdminClient();

		// Validate and filter allowed updates
		const allowedUpdates: Partial<PlayerUpdateData> = {};

		if (body.primary_email !== undefined) allowedUpdates.primary_email = body.primary_email;
		if (body.display_name !== undefined) allowedUpdates.display_name = body.display_name;
		if (body.avatar_url !== undefined) allowedUpdates.avatar_url = body.avatar_url;
		if (body.max_referrals !== undefined) allowedUpdates.max_referrals = body.max_referrals;
		if (body.game_access_granted !== undefined)
			allowedUpdates.game_access_granted = body.game_access_granted;
		if (body.waitlist_position !== undefined) {
			// Validate position is a positive integer
			if (body.waitlist_position <= 0 || !Number.isInteger(body.waitlist_position)) {
				return json(
					{ success: false, error: 'Waitlist position must be a positive integer' },
					{ status: 400 }
				);
			}
			allowedUpdates.waitlist_position = body.waitlist_position;
		}

		if (Object.keys(allowedUpdates).length === 0) {
			return json({ success: false, error: 'No valid updates provided' }, { status: 400 });
		}

		// Check if updating position - need to validate user is on waitlist
		if (allowedUpdates.waitlist_position !== undefined) {
			const { data: profile } = await supabase
				.from('profiles')
				.select('game_access_granted, deleted_at')
				.eq('id', playerId)
				.single();

			if (!profile) {
				return json({ success: false, error: 'Player not found' }, { status: 404 });
			}

			if (profile.game_access_granted) {
				return json(
					{ success: false, error: 'Cannot set position for users with game access' },
					{ status: 400 }
				);
			}

			if (profile.deleted_at) {
				return json(
					{ success: false, error: 'Cannot set position for deactivated users' },
					{ status: 400 }
				);
			}

			// Check if position is already taken by another user
			const { data: existingPosition } = await supabase
				.from('profiles')
				.select('id')
				.eq('waitlist_position', allowedUpdates.waitlist_position)
				.neq('id', playerId)
				.eq('game_access_granted', false)
				.is('deleted_at', null)
				.maybeSingle();

			if (existingPosition) {
				return json(
					{ success: false, error: 'Position already taken by another user' },
					{ status: 400 }
				);
			}
		}

		const { data, error } = await supabase
			.from('profiles')
			.update(allowedUpdates)
			.eq('id', playerId)
			.select()
			.single();

		if (error) {
			console.error('Error updating player:', error);
			return json({ success: false, error: 'Failed to update player' }, { status: 500 });
		}

		// If position was updated or game access was granted, recalculate positions
		if (
			allowedUpdates.waitlist_position !== undefined ||
			allowedUpdates.game_access_granted === true
		) {
			const { error: recalcError } = await supabase.rpc('recalculate_waitlist_positions');
			if (recalcError) {
				console.error('Failed to recalculate positions:', recalcError);
				// Non-critical error - update was successful
			}
		}

		return json(
			{ success: true, data, message: 'Player updated successfully' },
			{ status: 200 }
		);
	} catch (err: unknown) {
		console.error('Error updating player:', err);

		if (
			err instanceof Error &&
			(err.message?.includes('UNAUTHORIZED') || err.message?.includes('FORBIDDEN'))
		) {
			return json(
				{ success: false, error: err.message },
				{ status: err.message.includes('UNAUTHORIZED') ? 401 : 403 }
			);
		}

		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};
