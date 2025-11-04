import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSessionCookie } from '$lib/auth/cookies';
import { getServerSessionFromCookies } from '$lib/auth/session';
import { createAdminClient } from '$lib/db/supabaseAdmin';

async function handleLogout(cookies: import('@sveltejs/kit').Cookies) {
  const session = await getServerSessionFromCookies(cookies);
  if (session?.jti) {
    const supabase = createAdminClient();
    await supabase.from('sessions').delete().eq('id', session.jti);
  }
  clearSessionCookie(cookies);
  throw redirect(303, '/auth');
}

export const POST: RequestHandler = async ({ cookies }) => {
  await handleLogout(cookies);
};

export const GET: RequestHandler = async ({ cookies }) => {
  await handleLogout(cookies);
};
