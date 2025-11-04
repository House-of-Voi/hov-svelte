import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCurrentProfile } from '$lib/profile/session';

/**
 * GET /api/profile/accounts
 *
 * Returns all accounts linked to the current authenticated user
 *
 * Response includes:
 * - All blockchain accounts (Base, Voi, Solana)
 * - Derivation information (which accounts were derived from which)
 * - Primary account designation
 */
export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const profileData = await getCurrentProfile(cookies);

    if (!profileData) {
      return json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    return json({
      success: true,
      data: {
        accounts: profileData.accounts,
        primaryAccount: profileData.primaryAccount,
      },
    });
  } catch (error) {
    console.error('Get accounts error:', error);
    return json(
      {
        error: 'Failed to fetch accounts',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};
