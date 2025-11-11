import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSessionCookie, clearVoiAddressCookie, clearKeyDerivationCookie } from '$lib/auth/cookies';
import { getServerSessionFromCookies } from '$lib/auth/session';
import { createAdminClient } from '$lib/db/supabaseAdmin';

async function handleLogout(cookies: import('@sveltejs/kit').Cookies) {
  const session = await getServerSessionFromCookies(cookies);
  if (session?.jti) {
    const supabase = createAdminClient();
    await supabase.from('sessions').delete().eq('id', session.jti);
  }
  // Clear session, Voi address, and key derivation cookies
  clearSessionCookie(cookies);
  clearVoiAddressCookie(cookies);
  clearKeyDerivationCookie(cookies);
  // Note: Client should clear stored keys from localStorage on logout
}

export const POST: RequestHandler = async ({ cookies }) => {
  await handleLogout(cookies);
  return json({ ok: true });
};

export const GET: RequestHandler = async ({ cookies }) => {
  await handleLogout(cookies);
  throw redirect(303, '/auth');
};
