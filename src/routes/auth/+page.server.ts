import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getServerSessionFromCookies } from '$lib/auth/session';
import { getSessionCookie } from '$lib/auth/cookies';
import { validateCdpToken } from '$lib/auth/cdp-validation';

/**
 * Server-side load function for the auth page
 * Only redirects to /app if user has a valid CDP session (not just HTTP session cookie)
 */
export const load: PageServerLoad = async ({ cookies, url }) => {
  // If expired=true query param is present, don't redirect (CDP session expired)
  if (url.searchParams.get('expired') === 'true') {
    return {};
  }

  const session = await getServerSessionFromCookies(cookies);
  if (!session) {
    return {};
  }

  // Check if CDP token is actually valid (not just HTTP session cookie)
  const accessToken = getSessionCookie(cookies);
  if (!accessToken) {
    return {};
  }

  // Verify CDP token is still valid - CDP session is the source of truth
  const cdpUser = await validateCdpToken(accessToken, {
    timeout: 3000,
    retries: 0,
  });

  // Only redirect if CDP session is actually valid
  if (cdpUser && session.cdpUserId === cdpUser.userId) {
    throw redirect(303, '/app');
  }

  // CDP session expired/invalid, allow access to auth page
  return {};
};
