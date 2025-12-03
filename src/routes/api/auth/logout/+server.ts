import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearVoiAddressCookie, clearKeyDerivationCookie } from '$lib/auth/cookies';

/**
 * Handles logout by signing out of Supabase and clearing all app-specific cookies.
 *
 * IMPORTANT: The client is responsible for:
 * 1. Clearing stored game account keys from localStorage
 * 2. Signing out of Supabase (client-side SDK) - this is done before calling this endpoint
 *
 * This is by design - we only clear keys on explicit logout, not on session expiry.
 */
async function handleLogout(
  locals: App.Locals,
  cookies: import('@sveltejs/kit').Cookies
) {
  // Sign out from Supabase (server-side)
  if (locals.supabase) {
    await locals.supabase.auth.signOut();
  }

  // Clear app-specific cookies (Voi address, key derivation)
  // Supabase handles its own auth cookies automatically
  clearVoiAddressCookie(cookies);
  clearKeyDerivationCookie(cookies);

  // Note: Client must handle:
  // - Clearing game account keys from localStorage (clearAllGameAccountKeys)
}

export const POST: RequestHandler = async ({ locals, cookies }) => {
  await handleLogout(locals, cookies);
  return json({
    ok: true,
    message: 'Logged out successfully. Client should clear localStorage.',
  });
};

export const GET: RequestHandler = async ({ locals, cookies }) => {
  await handleLogout(locals, cookies);
  throw redirect(303, '/auth');
};
