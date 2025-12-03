import type { Cookies } from '@sveltejs/kit';
import { createSupabaseServerClient } from '../db/supabaseAuthServer';
import { createAdminClient } from '../db/supabaseAdmin';
import { getProfileWithAccounts, getProfileByAuthUserId, type ProfileWithAccounts } from './data';

/**
 * Get the current authenticated user's full profile
 *
 * This uses Supabase Auth to get the current user and fetches their profile.
 * Returns null if user is not authenticated or profile doesn't exist.
 *
 * @returns Profile with accounts or null
 */
export async function getCurrentProfile(cookies: Cookies): Promise<ProfileWithAccounts | null> {
  const supabase = createSupabaseServerClient(cookies);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Look up profile by Supabase auth user ID
  const profile = await getProfileByAuthUserId(user.id);
  if (!profile) {
    return null;
  }

  return getProfileWithAccounts(profile.id);
}

/**
 * Require authentication and return current profile
 *
 * Throws an error if user is not authenticated.
 * Use this in API routes that require authentication.
 *
 * @returns Profile with accounts
 * @throws Error if not authenticated
 */
export async function requireCurrentProfile(cookies: Cookies): Promise<ProfileWithAccounts> {
  const profile = await getCurrentProfile(cookies);

  if (!profile) {
    throw new Error('Authentication required');
  }

  return profile;
}

/**
 * Check if user is authenticated
 *
 * @returns true if user has a valid session
 */
export async function isAuthenticated(cookies: Cookies): Promise<boolean> {
  const supabase = createSupabaseServerClient(cookies);
  const { data: { user } } = await supabase.auth.getUser();
  return user !== null;
}

/**
 * Get current user's profile ID
 *
 * @returns Profile ID or null if not authenticated
 */
export async function getCurrentProfileId(cookies: Cookies): Promise<string | null> {
  const supabase = createSupabaseServerClient(cookies);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const profile = await getProfileByAuthUserId(user.id);
  return profile?.id || null;
}
