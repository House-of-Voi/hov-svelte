import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerSessionFromCookies } from '$lib/auth/session';
import { getSessionCookie } from '$lib/auth/cookies';
import { validateCdpToken } from '$lib/auth/cdp-validation';
import {
  ALGORAND_CHALLENGE_TTL_MS,
  createAlgorandLinkChallenge,
} from '$lib/auth/algorand-link';

/**
 * GET /api/auth/algorand/challenge
 *
 * Creates a challenge token for linking external Algorand/Voi accounts.
 * Base address is fetched from CDP on-demand - no database fallbacks.
 * CDP must be active and verified for this endpoint to work.
 */
export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const session = await getServerSessionFromCookies(cookies);

    if (!session) {
      return json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get CDP access token from session cookie
    const accessToken = getSessionCookie(cookies);
    if (!accessToken) {
      return json(
        { error: 'CDP session not found. Please sign in with Coinbase wallet.' },
        { status: 401 }
      );
    }

    // Fetch Base address from CDP on-demand (no DB fallback)
    const cdpUser = await validateCdpToken(accessToken, {
      timeout: 5000,
      retries: 1,
    });

    if (!cdpUser) {
      return json(
        { error: 'CDP session expired or invalid. Please sign in again.' },
        { status: 401 }
      );
    }

    const baseAddress = cdpUser.walletAddress.toLowerCase();

    const { token, payload } = createAlgorandLinkChallenge(
      session.sub,
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
