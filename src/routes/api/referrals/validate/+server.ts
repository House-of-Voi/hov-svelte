import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateReferralCode } from '$lib/referrals/validation';

/**
 * POST /api/referrals/validate
 * Validates a referral code and returns information about its status
 */
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const { code } = body;

  if (!code || typeof code !== 'string') {
    return json(
      { error: 'Referral code is required' },
      { status: 400 }
    );
  }

  const result = await validateReferralCode(code.toUpperCase());

  return json({
    ok: result.valid,
    ...result,
  });
};
