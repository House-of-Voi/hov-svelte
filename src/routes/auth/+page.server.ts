import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Server-side load function for the auth page
 * Redirects to /app if user is already authenticated
 */
export const load: PageServerLoad = async ({ cookies }) => {
  const session = cookies.get('hov_session');

  // If user has a valid session cookie, redirect to app
  // Note: We're doing a simple check here. The actual session validation
  // happens in the API routes and protected pages
  if (session) {
    // Redirect to app since user is already logged in
    throw redirect(303, '/app');
  }

  // No session, allow access to auth page
  return {};
};
