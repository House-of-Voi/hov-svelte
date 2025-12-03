import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getReferralStats } from '$lib/referrals/validation';

/**
 * GET /api/referrals/info
 * Returns the authenticated user's referral information and stats
 */
export const GET: RequestHandler = async ({ locals }) => {
  const session = locals.hovSession;
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats = await getReferralStats(session.sub);

  if (!stats) {
    return json(
      { error: 'Referral information not found' },
      { status: 404 }
    );
  }

  return json({
    ok: true,
    ...stats,
  });
};
