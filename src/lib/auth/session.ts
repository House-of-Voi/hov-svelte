import type { Cookies } from '@sveltejs/kit';
import { getSessionCookie, getVoiAddressFromCookie } from './cookies';
import { createAdminClient } from '../db/supabaseAdmin';
import { createHash } from 'crypto';

/**
 * Session information for the authenticated user
 */
export interface SessionInfo {
  sub: string; // profile_id
  cdpUserId?: string;
  baseWalletAddress?: string;
  jti?: string; // For backward compatibility
  profileId: string; // Alias for sub for clarity
  gameAccessGranted?: boolean;
  displayName?: string | null;
  primaryEmail?: string;
  voiAddress?: string; // CDP-derived Voi address (stored in session cookie)
  voiAddressDerivedAt?: number; // Timestamp when address was last derived
}

export async function getServerSessionFromCookies(cookies: Cookies): Promise<SessionInfo | null> {
  const token = getSessionCookie(cookies);
  if (!token) return null;

  try {
    const supabase = createAdminClient();

    // Hash the token to look up the session
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Look up session by token hash instead of calling CDP API
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, profile_id, cdp_user_id, expires_at')
      .eq('cdp_access_token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // If no valid session found in database, return null
    if (sessionError || !session) {
      console.log('No valid session found for token hash');
      return null;
    }

    // Get profile to check game access and display name
    const { data: profile } = await supabase
      .from('profiles')
      .select('game_access_granted, display_name, primary_email')
      .eq('id', session.profile_id)
      .single();

    // Get CDP-derived Voi address from cookie (if available)
    const voiAddressData = getVoiAddressFromCookie(cookies);

    return {
      sub: session.profile_id,
      profileId: session.profile_id,
      cdpUserId: session.cdp_user_id,
      baseWalletAddress: undefined, // Not fetched server-side, derived client-side when needed
      gameAccessGranted: profile?.game_access_granted || false,
      displayName: profile?.display_name,
      primaryEmail: profile?.primary_email,
      voiAddress: voiAddressData?.address,
      voiAddressDerivedAt: voiAddressData?.derivedAt,
    };
  } catch (error) {
    console.error('Session validation error:', error);
    return null;
  }
}

/**
 * Gets all connected accounts for the current user
 * (Does NOT include the primary CDP-derived Voi address, which lives in session)
 *
 * @returns Array of connected accounts from database
 */
export async function getConnectedAccounts(cookies: Cookies): Promise<Array<{
  chain: string;
  address: string;
  isPrimary: boolean;
  derivedFromChain: string | null;
  derivedFromAddress: string | null;
}> | null> {
  const session = await getServerSessionFromCookies(cookies);
  if (!session) return null;

  const supabase = createAdminClient();

  // Get only connected accounts (not the primary CDP-derived ones)
  const { data: accounts } = await supabase
    .from('accounts')
    .select('chain, address, is_primary, derived_from_chain, derived_from_address')
    .eq('profile_id', session.sub);

  if (!accounts) return null;

  return accounts.map(acc => ({
    chain: acc.chain,
    address: acc.address,
    isPrimary: acc.is_primary,
    derivedFromChain: acc.derived_from_chain,
    derivedFromAddress: acc.derived_from_address,
  }));
}

/**
 * Checks if the current user has access to games
 *
 * @returns true if user has game access, false otherwise
 */
export async function hasGameAccess(cookies: Cookies): Promise<boolean> {
  const session = await getServerSessionFromCookies(cookies);
  return session?.gameAccessGranted || false;
}
