import type { Handle } from '@sveltejs/kit';
import { getServerSessionFromCookies, type SessionInfo } from '$lib/auth/session';

// Extend the Locals interface to include session and convenience accessors
declare global {
  namespace App {
    interface Locals {
      session: SessionInfo | null;
      voiAddress?: string; // Convenience accessor for CDP-derived Voi address
    }
  }
}

/**
 * SvelteKit hooks - runs on every server request
 *
 * This hook:
 * 1. Checks for session cookie
 * 2. Validates session from database
 * 3. Attaches session info to event.locals
 * 4. Makes session available to all load functions and endpoints
 */
export const handle: Handle = async ({ event, resolve }) => {
  // Get session from cookies (includes CDP-derived Voi address from cookie)
  event.locals.session = await getServerSessionFromCookies(event.cookies);

  // Set convenience accessor for Voi address
  event.locals.voiAddress = event.locals.session?.voiAddress;

  // Continue with request
  const response = await resolve(event);

  return response;
};
