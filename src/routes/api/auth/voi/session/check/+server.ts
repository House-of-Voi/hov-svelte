import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerSessionFromCookies } from '$lib/auth/session';

/**
 * GET /api/auth/voi/session/check
 *
 * Checks if the current session has a Voi address stored
 */
export const GET: RequestHandler = async ({ cookies }) => {
  const session = await getServerSessionFromCookies(cookies);

  return json({
    hasVoiAddress: !!session?.voiAddress,
    voiAddress: session?.voiAddress, // Return the address if it exists
  });
};
