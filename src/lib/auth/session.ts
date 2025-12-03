import { createAdminClient } from '../db/supabaseAdmin';

/**
 * CDP recovery method for unlocking a game account
 * - 'email' | 'sms' | 'google': CDP-based accounts with OTP/OAuth recovery
 * - 'mnemonic': Accounts imported via 25-word Algorand mnemonic
 */
export type CdpRecoveryMethod = 'email' | 'sms' | 'google' | 'mnemonic' | null;

/**
 * Game account information (CDP wallet or mnemonic-imported account)
 */
export interface GameAccountInfo {
  id: string;
  cdpUserId: string; // For mnemonic accounts, format is 'mnemonic:{voiAddress}'
  baseAddress: string; // Empty string for mnemonic accounts (no Base/EVM address)
  voiAddress: string;
  nickname: string | null;
  isDefault: boolean;
  lastUnlockedAt: string | null;
  createdAt: string;
  cdpRecoveryMethod: CdpRecoveryMethod;
  cdpRecoveryHint: string | null;
  /** True if this account was imported via mnemonic (derived from cdpUserId prefix) */
  isMnemonicAccount: boolean;
}

/**
 * Session information for the authenticated user
 */
export interface SessionInfo {
  sub: string; // profile_id
  profileId: string; // Alias for sub for clarity

  // Supabase authentication
  supabaseUserId?: string;

  // Legacy fields (deprecated, but kept for migration compatibility)
  cdpUserId?: string;
  baseWalletAddress?: string;
  jti?: string; // For backward compatibility

  // Profile info
  gameAccessGranted?: boolean;
  displayName?: string | null;
  primaryEmail?: string;

  // Active game account (CDP wallet)
  activeGameAccountId?: string;
  voiAddress?: string; // From active game account
  voiAddressDerivedAt?: number; // Timestamp when address was last derived

  // Migration status
  migrationStatus?: 'pending' | 'migrated' | 'new';
}

/**
 * Gets all game accounts for a profile
 */
export async function getGameAccountsForProfile(profileId: string): Promise<GameAccountInfo[]> {
  const supabase = createAdminClient();

  const { data: accounts, error } = await supabase
    .from('game_accounts')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true });

  if (error || !accounts) {
    console.error('Error fetching game accounts:', error);
    return [];
  }

  return accounts.map((acc) => ({
    id: acc.id,
    cdpUserId: acc.cdp_user_id,
    baseAddress: acc.base_address || '',
    voiAddress: acc.voi_address,
    nickname: acc.nickname,
    isDefault: acc.is_default,
    lastUnlockedAt: acc.last_unlocked_at,
    createdAt: acc.created_at,
    cdpRecoveryMethod: acc.cdp_recovery_method as CdpRecoveryMethod,
    cdpRecoveryHint: acc.cdp_recovery_hint,
    isMnemonicAccount: acc.cdp_user_id?.startsWith('mnemonic:') ?? false,
  }));
}

/**
 * Gets all connected accounts for the current user
 * (Does NOT include the primary CDP-derived Voi address, which lives in session)
 *
 * @returns Array of connected accounts from database
 */
export async function getConnectedAccounts(
  profileId: string
): Promise<
  Array<{
    chain: string;
    address: string;
    isPrimary: boolean;
    derivedFromChain: string | null;
    derivedFromAddress: string | null;
  }> | null
> {
  const supabase = createAdminClient();

  // Get only connected accounts (not the primary CDP-derived ones)
  const { data: accounts } = await supabase
    .from('accounts')
    .select('chain, address, is_primary, derived_from_chain, derived_from_address')
    .eq('profile_id', profileId);

  if (!accounts) return null;

  return accounts.map((acc) => ({
    chain: acc.chain,
    address: acc.address,
    isPrimary: acc.is_primary,
    derivedFromChain: acc.derived_from_chain,
    derivedFromAddress: acc.derived_from_address,
  }));
}

/**
 * Checks if the current user has access to games
 * Uses the session from locals (set by hooks.server.ts)
 *
 * @returns true if user has game access, false otherwise
 */
export function hasGameAccess(session: SessionInfo | null): boolean {
  return session?.gameAccessGranted || false;
}
