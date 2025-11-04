/**
 * Admin Player Delete API
 * Soft delete a specific player (deactivate)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { requirePermission, getCurrentProfileId, PERMISSIONS } from '$lib/auth/admin';

export const POST: RequestHandler = async ({ params, cookies }) => {
	try {
		const profileId = await getCurrentProfileId(cookies);

		if (!profileId) {
			return json({ success: false, error: 'UNAUTHORIZED: No session found' }, { status: 401 });
		}

		await requirePermission(cookies, PERMISSIONS.DELETE_PLAYERS, profileId);

		const { id: playerId } = params;
		const supabase = createAdminClient();

		// Check if target user exists and is not already deleted
		const { data: targetProfile, error: fetchError } = await supabase
			.from('profiles')
			.select('id, primary_email, deleted_at')
			.eq('id', playerId)
			.single();

		if (fetchError || !targetProfile) {
			return json({ success: false, error: 'Player not found' }, { status: 404 });
		}

		if (targetProfile.deleted_at) {
			return json({ success: false, error: 'Player is already deactivated' }, { status: 400 });
		}

		// Check if target user has an admin role - block deletion if they do
		const { data: adminRole } = await supabase
			.from('admin_roles')
			.select('role')
			.eq('profile_id', playerId)
			.single();

		if (adminRole) {
			return json(
				{
					success: false,
					error: 'Cannot deactivate users with admin roles. Remove admin role first.'
				},
				{ status: 403 }
			);
		}

		// Perform soft delete - update deleted_at and deleted_by
		const { error: updateError } = await supabase
			.from('profiles')
			.update({
				deleted_at: new Date().toISOString(),
				deleted_by: profileId
			})
			.eq('id', playerId);

		if (updateError) {
			console.error('Failed to deactivate player:', updateError);
			return json({ success: false, error: 'Failed to deactivate player' }, { status: 500 });
		}

		// Optionally: Invalidate all active sessions for the deleted user
		const { error: sessionError } = await supabase
			.from('sessions')
			.delete()
			.eq('profile_id', playerId);

		if (sessionError) {
			console.warn('Failed to invalidate sessions for deleted user:', sessionError);
			// Don't fail the deletion if session cleanup fails
		}

		// Log the deletion to audit_log
		const { error: auditError } = await supabase.from('audit_log').insert({
			admin_profile_id: profileId,
			action: 'delete_player',
			target_profile_id: playerId,
			target_email: targetProfile.primary_email,
			details: {
				deleted_at: new Date().toISOString()
			}
		});

		if (auditError) {
			console.error('Failed to log deletion to audit log:', auditError);
			// Don't fail the deletion if audit logging fails
		}

		return json(
			{
				success: true,
				message: `Player ${targetProfile.primary_email} has been deactivated successfully`
			},
			{ status: 200 }
		);
	} catch (err: unknown) {
		console.error('Error deleting player:', err);

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
