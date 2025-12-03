import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/auth/voi/session/check
 *
 * Checks if the current session has a Voi address stored
 */
export const GET: RequestHandler = async ({ locals }) => {
  const session = locals.hovSession;

  return json({
    hasVoiAddress: !!session?.voiAddress,
    voiAddress: session?.voiAddress, // Return the address if it exists
  });
};
