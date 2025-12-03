import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createAdminClient } from '$lib/db/supabaseAdmin';

const createSchema = z.object({
  cdpUserId: z.string().min(1, 'CDP user ID is required'),
  // For mnemonic accounts, baseAddress can be empty (no EVM address)
  baseAddress: z.string().optional().default(''),
  voiAddress: z.string().min(1, 'Voi address is required'),
  nickname: z.string().max(50).optional(),
  // 'mnemonic' is for accounts imported via 25-word Algorand mnemonic
  cdpRecoveryMethod: z.enum(['email', 'sms', 'google', 'mnemonic']).optional(),
  cdpRecoveryHint: z.string().max(100).optional(),
});

/**
 * GET /api/game-accounts
 *
 * Lists all game accounts for the authenticated user
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: accounts, error } = await supabase
    .from('game_accounts')
    .select('*')
    .eq('profile_id', locals.session.profileId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching game accounts:', error);
    return json({ error: 'Failed to fetch game accounts' }, { status: 500 });
  }

  // Transform to camelCase for frontend
  const transformedAccounts = accounts.map((acc) => ({
    id: acc.id,
    cdpUserId: acc.cdp_user_id,
    baseAddress: acc.base_address || '',
    voiAddress: acc.voi_address,
    nickname: acc.nickname,
    isDefault: acc.is_default,
    lastUnlockedAt: acc.last_unlocked_at,
    createdAt: acc.created_at,
    updatedAt: acc.updated_at,
    cdpRecoveryMethod: acc.cdp_recovery_method,
    cdpRecoveryHint: acc.cdp_recovery_hint,
    // True if this account was imported via mnemonic (cdpUserId starts with 'mnemonic:')
    isMnemonicAccount: acc.cdp_user_id?.startsWith('mnemonic:') ?? false,
  }));

  return json({
    ok: true,
    accounts: transformedAccounts,
    activeAccountId: locals.activeGameAccount?.id || null,
  });
};

/**
 * POST /api/game-accounts
 *
 * Registers a new game account (CDP wallet) for the authenticated user.
 * Called after the user has authenticated with CDP and exported their keys.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(data);

  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 });
  }

  const { cdpUserId, baseAddress, voiAddress, nickname, cdpRecoveryMethod, cdpRecoveryHint } = parsed.data;
  const supabase = createAdminClient();
  const isMnemonicAccount = cdpUserId.startsWith('mnemonic:');

  // For mnemonic accounts, check by voiAddress (since cdpUserId is synthetic)
  // For CDP accounts, check by cdpUserId (deterministic CDP identity)
  let existingQuery = supabase
    .from('game_accounts')
    .select('id, profile_id, cdp_user_id');

  if (isMnemonicAccount) {
    // Mnemonic accounts: check by voiAddress to prevent duplicates
    existingQuery = existingQuery.eq('voi_address', voiAddress);
  } else {
    // CDP accounts: check by cdpUserId (CDP wallet identity)
    existingQuery = existingQuery.eq('cdp_user_id', cdpUserId);
  }

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    if (existing.profile_id !== locals.session.profileId) {
      // Account belongs to a different user
      return json(
        { error: 'This game account is already linked to another user' },
        { status: 400 }
      );
    }

    // Already registered to this user - update last_unlocked_at
    await supabase
      .from('game_accounts')
      .update({ last_unlocked_at: new Date().toISOString() })
      .eq('id', existing.id);

    return json({
      ok: true,
      accountId: existing.id,
      alreadyExists: true,
    });
  }

  // Check if this is the first game account (will be set as default automatically by trigger)
  const { count } = await supabase
    .from('game_accounts')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', locals.session.profileId);

  const isFirst = (count ?? 0) === 0;

  // Create new game account
  const { data: newAccount, error } = await supabase
    .from('game_accounts')
    .insert({
      profile_id: locals.session.profileId,
      cdp_user_id: cdpUserId,
      // For mnemonic accounts, baseAddress is empty; for CDP accounts, lowercase it
      base_address: isMnemonicAccount ? null : baseAddress.toLowerCase(),
      voi_address: voiAddress,
      nickname: nickname || null,
      is_default: isFirst, // Trigger will also handle this, but explicit is good
      last_unlocked_at: new Date().toISOString(),
      cdp_recovery_method: cdpRecoveryMethod || null,
      cdp_recovery_hint: cdpRecoveryHint || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating game account:', error);

    // Check for unique constraint violations
    if (error.code === '23505') {
      if (error.message.includes('base_address')) {
        return json({ error: 'This Base address is already registered' }, { status: 400 });
      }
      if (error.message.includes('voi_address')) {
        return json({ error: 'This Voi address is already registered' }, { status: 400 });
      }
    }

    return json({ error: 'Failed to create game account' }, { status: 500 });
  }

  // For mnemonic accounts, auto-upgrade any legacy account with the same address
  // This seamlessly migrates old "connected accounts" to full game accounts
  let upgradedFromLegacy = false;
  if (isMnemonicAccount) {
    const { data: legacyAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('profile_id', locals.session.profileId)
      .eq('address', voiAddress)
      .eq('chain', 'voi')
      .maybeSingle();

    if (legacyAccount) {
      // Delete the legacy entry - it's now upgraded to a full game account
      await supabase
        .from('accounts')
        .delete()
        .eq('id', legacyAccount.id);

      upgradedFromLegacy = true;
      console.log(`Auto-upgraded legacy account ${voiAddress} to game account`);
    }
  }

  return json({
    ok: true,
    accountId: newAccount.id,
    isDefault: newAccount.is_default,
    alreadyExists: false,
    upgradedFromLegacy,
  });
};

/**
 * PATCH /api/game-accounts
 *
 * Updates a game account (nickname, last_unlocked_at)
 * Can look up by accountId (UUID) or voiAddress
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
  if (!locals.session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const updateSchema = z.object({
    accountId: z.string().uuid().optional(),
    voiAddress: z.string().optional(),
    nickname: z.string().max(50).optional(),
    markUnlocked: z.boolean().optional(),
  }).refine(data => data.accountId || data.voiAddress, {
    message: 'Either accountId or voiAddress is required',
  });

  const data = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(data);

  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 });
  }

  const { accountId, voiAddress, nickname, markUnlocked } = parsed.data;
  const supabase = createAdminClient();

  // Build query to find the account
  let query = supabase
    .from('game_accounts')
    .select('id')
    .eq('profile_id', locals.session.profileId);

  if (accountId) {
    query = query.eq('id', accountId);
  } else if (voiAddress) {
    query = query.eq('voi_address', voiAddress);
  }

  const { data: account } = await query.single();

  if (!account) {
    return json({ error: 'Game account not found' }, { status: 404 });
  }

  // Build update object
  const updates: Record<string, unknown> = {};
  if (nickname !== undefined) {
    updates.nickname = nickname || null;
  }
  if (markUnlocked) {
    updates.last_unlocked_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: 'No updates provided' }, { status: 400 });
  }

  const { error } = await supabase.from('game_accounts').update(updates).eq('id', account.id);

  if (error) {
    console.error('Error updating game account:', error);
    return json({ error: 'Failed to update game account' }, { status: 500 });
  }

  return json({ ok: true });
};

/**
 * DELETE /api/game-accounts
 *
 * Removes a game account (not recommended but supported)
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
  if (!locals.session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const deleteSchema = z.object({
    accountId: z.string().uuid(),
  });

  const data = await request.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(data);

  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 });
  }

  const { accountId } = parsed.data;
  const supabase = createAdminClient();

  // Verify ownership
  const { data: account } = await supabase
    .from('game_accounts')
    .select('id, is_default')
    .eq('id', accountId)
    .eq('profile_id', locals.session.profileId)
    .single();

  if (!account) {
    return json({ error: 'Game account not found' }, { status: 404 });
  }

  // Delete the account
  const { error } = await supabase.from('game_accounts').delete().eq('id', accountId);

  if (error) {
    console.error('Error deleting game account:', error);
    return json({ error: 'Failed to delete game account' }, { status: 500 });
  }

  // If this was the default account, we need to set a new default
  if (account.is_default) {
    const { data: remaining } = await supabase
      .from('game_accounts')
      .select('id')
      .eq('profile_id', locals.session.profileId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (remaining) {
      await supabase.from('game_accounts').update({ is_default: true }).eq('id', remaining.id);
    }
  }

  return json({ ok: true });
};
