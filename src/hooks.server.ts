import type { Handle } from '@sveltejs/kit';
import { getServerSessionFromCookies, type SessionInfo } from '$lib/auth/session';
import { getSessionCookie } from '$lib/auth/cookies';

// Extend the Locals interface to include session and convenience accessors
declare global {
  namespace App {
    interface Locals {
      session: SessionInfo | null;
      voiAddress?: string; // Convenience accessor for Voi address (from session or stored keys)
    }
  }
}

/**
 * SvelteKit hooks - runs on every server request
 *
 * This hook:
 * 1. Gets session token from cookies
 * 2. Validates session against database (not CDP)
 * 3. Session is valid if cookie exists and matches database record
 * 4. Attaches session info to event.locals
 * 
 * Note: CDP is no longer validated here. CDP is only used for initial authentication.
 * After login, keys are stored in browser and session is managed independently.
 */
export const handle: Handle = async ({ event, resolve }) => {
  // Initialize to no session
  event.locals.session = null;
  event.locals.voiAddress = undefined;

  // Get session token from cookies
  const sessionToken = getSessionCookie(event.cookies);
  if (!sessionToken) {
    // No token = no session
    const response = await resolve(event);
    return response;
  }

  // Validate session against database (not CDP)
  // Session is valid if cookie exists and matches database record
  const session = await getServerSessionFromCookies(event.cookies);
  
  if (session) {
    event.locals.session = session;
    event.locals.voiAddress = session.voiAddress;
  }

  // Continue with request
  const response = await resolve(event);
  return response;
};
