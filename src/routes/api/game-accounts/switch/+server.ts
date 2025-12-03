import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { setVoiAddressCookie } from '$lib/auth/cookies';

const schema = z.object({
  accountId: z.string().uuid('Invalid account ID'),
});

/**
 * POST /api/game-accounts/switch
 *
 * Switches the active game account for the current session.
 * This updates the game account default and sets the Voi address cookie.
 */
export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  if (!locals.session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 });
  }

  const { accountId } = parsed.data;
  const supabase = createAdminClient();

  // Verify the account belongs to this user
  const { data: account, error: accountError } = await supabase
    .from('game_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('profile_id', locals.session.profileId)
    .single();

  if (accountError || !account) {
    return json({ error: 'Game account not found' }, { status: 404 });
  }

  // Update all game accounts - unset default, then set new default
  await supabase
    .from('game_accounts')
    .update({ is_default: false })
    .eq('profile_id', locals.session.profileId);

  await supabase.from('game_accounts').update({ is_default: true }).eq('id', accountId);

  // Set the Voi address cookie (7 days to match session)
  const ttlSeconds = 60 * 60 * 24 * 7;
  setVoiAddressCookie(cookies, account.voi_address, ttlSeconds);

  return json({
    ok: true,
    account: {
      id: account.id,
      cdpUserId: account.cdp_user_id,
      baseAddress: account.base_address,
      voiAddress: account.voi_address,
      nickname: account.nickname,
      isDefault: true,
      lastUnlockedAt: account.last_unlocked_at,
    },
  });
};
