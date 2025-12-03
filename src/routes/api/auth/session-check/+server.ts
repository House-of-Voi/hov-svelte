import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/auth/session-check
 *
 * Simple endpoint to check if the current HoV session is valid.
 * Used by the auth page to detect stale Clerk sessions.
 *
 * Returns:
 * - 200 { valid: true, profileId } if session is valid
 * - 401 { valid: false } if no valid session
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (locals.session) {
		return json({ valid: true, profileId: locals.session.profileId });
	}
	return json({ valid: false }, { status: 401 });
};
