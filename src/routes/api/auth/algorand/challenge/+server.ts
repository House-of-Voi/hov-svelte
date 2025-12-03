import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  ALGORAND_CHALLENGE_TTL_MS,
  createAlgorandLinkChallenge,
} from '$lib/auth/algorand-link';

/**
 * GET /api/auth/algorand/challenge
 *
 * Creates a challenge token for linking external Algorand/Voi accounts.
 * Uses the active game account's base address from the session.
 */
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const session = locals.session;

    if (!session) {
      return json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get base address from active game account
    const activeAccount = locals.activeGameAccount;
    if (!activeAccount) {
      return json(
        { error: 'No active game account. Please create a game account first.' },
        { status: 400 }
      );
    }

    const baseAddress = activeAccount.baseAddress.toLowerCase();

    const { token, payload } = createAlgorandLinkChallenge(
      session.profileId,
      baseAddress
    );

    return json({
      challenge: token,
      expiresAt: new Date(payload.expiresAt).toISOString(),
      ttlMs: ALGORAND_CHALLENGE_TTL_MS,
      baseAddress: payload.baseAddress,
    });
  } catch (error) {
    console.error('Algorand challenge error:', error);
    return json(
      {
        error: 'Failed to create Algorand challenge',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};
