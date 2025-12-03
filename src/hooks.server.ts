import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { createSupabaseServerClient } from '$lib/db/supabaseAuthServer';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import {
  getGameAccountsForProfile,
  type SessionInfo,
  type GameAccountInfo,
} from '$lib/auth/session';
import { getVoiAddressFromCookie, setKeyDerivationCookie, getKeyDerivationCookie } from '$lib/auth/cookies';

/**
 * Supabase Auth handler
 * Creates server client and loads authenticated user session
 */
const supabaseAuthHandler: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createSupabaseServerClient(event.cookies);

  // IMPORTANT: Only use getUser() for authentication validation
  // getSession() returns unverified data from cookies and is insecure
  const {
    data: { user: supabaseUser },
    error,
  } = await event.locals.supabase.auth.getUser();

  // Set user - this is the authenticated, verified user
  event.locals.supabaseUser = error ? null : supabaseUser;

  // We don't use supabaseSession from getSession() as it's insecure
  // Instead, we pass the user data which is verified
  event.locals.supabaseSession = supabaseUser ? { user: supabaseUser } as any : null;

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === 'content-range' || name === 'x-supabase-api-version';
    },
  });
};

/**
 * House of Voi session handler
 * Loads HoV profile and game accounts after Supabase authentication
 */
const hovSessionHandler: Handle = async ({ event, resolve }) => {
  // Initialize to no session
  event.locals.hovSession = null;
  event.locals.session = null; // Alias for backward compatibility
  event.locals.voiAddress = undefined;
  event.locals.gameAccounts = undefined;
  event.locals.activeGameAccount = undefined;

  const supabaseUser = event.locals.supabaseUser;
  if (!supabaseUser) {
    return resolve(event);
  }

  try {
    const supabase = createAdminClient();

    // Look up profile by Supabase auth user ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, game_access_granted, display_name, primary_email, auth_user_id, migration_status')
      .eq('auth_user_id', supabaseUser.id)
      .maybeSingle();

    if (!profile) {
      // User is authenticated but has no profile yet
      // Profile will be created via auth callback or on first protected route access
      return resolve(event);
    }

    // Load game accounts for the profile
    const gameAccounts = await getGameAccountsForProfile(profile.id);

    // Find active game account (first default, or first in list)
    const activeGameAccount = gameAccounts.find((acc) => acc.isDefault) || gameAccounts[0];

    // Get Voi address - prefer game account, fall back to legacy cookie
    const voiAddressData = getVoiAddressFromCookie(event.cookies);
    const voiAddress = activeGameAccount?.voiAddress || voiAddressData?.address;

    // Build session info
    const session: SessionInfo = {
      sub: profile.id,
      profileId: profile.id,
      supabaseUserId: supabaseUser.id,
      gameAccessGranted: profile.game_access_granted || false,
      displayName: profile.display_name,
      primaryEmail: profile.primary_email,
      activeGameAccountId: activeGameAccount?.id,
      voiAddress,
      voiAddressDerivedAt: voiAddressData?.derivedAt,
      migrationStatus: profile.migration_status as SessionInfo['migrationStatus'],
    };

    event.locals.hovSession = session;
    event.locals.session = session; // Alias for backward compatibility
    event.locals.voiAddress = voiAddress;
    event.locals.gameAccounts = gameAccounts;
    event.locals.activeGameAccount = activeGameAccount;

    // Ensure key derivation cookie exists for client-side key encryption
    // This cookie is needed by gameAccountStorage.ts to encrypt/decrypt stored keys
    // IMPORTANT: The derivation value MUST be deterministic based on profile ID only
    // If it changes, all stored encrypted keys become undecryptable
    const existingDerivation = getKeyDerivationCookie(event.cookies);
    if (!existingDerivation) {
      // Use profile ID as the stable derivation value
      // This ensures keys can always be decrypted as long as the user is logged in
      const derivationValue = `hov-keys-${profile.id}`;
      setKeyDerivationCookie(event.cookies, derivationValue, 7 * 24 * 60 * 60); // 7 days
    }
  } catch (error) {
    console.error('Error loading HoV session:', error);
  }

  return resolve(event);
};

// Supabase auth handler runs first, then HoV session handler loads our app data
export const handle = sequence(supabaseAuthHandler, hovSessionHandler);
