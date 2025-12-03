import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Server-side load function for the auth page
 * If user is authenticated with Supabase, redirect to /app
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  // If expired=true query param is present, don't redirect
  if (url.searchParams.get('expired') === 'true') {
    return {};
  }

  // If authenticated with Supabase, redirect to app
  if (locals.supabaseUser) {
    throw redirect(303, '/app');
  }

  return {};
};
