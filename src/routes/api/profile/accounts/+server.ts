import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getCurrentProfile } from '$lib/profile/session';
import { createAdminClient } from '$lib/db/supabaseAdmin';

/**
 * GET /api/profile/accounts
 *
 * Returns all accounts linked to the current authenticated user
 *
 * Response includes:
 * - CDP-derived Voi address (primary, from session)
 * - Connected accounts (additional wallets from database)
 * - Derivation information
 */
export const GET: RequestHandler = async ({ cookies, locals }) => {
  try {
    const session = locals.hovSession;
    const profileData = await getCurrentProfile(cookies);

    if (!profileData || !session) {
      return json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get connected accounts from database (excludes CDP-derived addresses)
    // Note: profileData.primaryAccount from DB is NEVER used as fallback
    // CDP-derived address from session is the only source of truth for primary accounts
    const connectedAccounts = profileData.accounts || [];

    // Add the CDP-derived Voi address from session as the primary account
    // If session.voiAddress is null, primaryAccount will be null (no DB fallback)
    const primaryVoiAccount = session.voiAddress ? {
      chain: 'voi',
      address: session.voiAddress,
      isPrimary: true,
      derivedFromChain: 'cdp',
      derivedFromAddress: null,
      walletProvider: 'coinbase-embedded',
      type: 'derived' as const,
    } : null;

    // Combine derived address with connected accounts
    const allAccounts = primaryVoiAccount
      ? [primaryVoiAccount, ...connectedAccounts.map(acc => ({ ...acc, type: 'connected' as const }))]
      : connectedAccounts.map(acc => ({ ...acc, type: 'connected' as const }));

    return json({
      success: true,
      data: {
        accounts: allAccounts,
        primaryAccount: primaryVoiAccount,
      },
    });
  } catch (error) {
    console.error('Get accounts error:', error);
    return json(
      {
        error: 'Failed to fetch accounts',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};

/**
 * DELETE /api/profile/accounts
 *
 * Removes a linked Voi account from the user's profile.
 * Cannot remove the primary CDP-derived address (which lives in session, not DB).
 */
const deleteSchema = z.object({
  chain: z.enum(['voi']), // Only allow removing Voi accounts for now
  address: z.string().min(1),
});

export const DELETE: RequestHandler = async ({ request, locals }) => {
  try {
    const session = locals.hovSession;

    if (!session) {
      return json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      return json(
        { error: 'Invalid payload', details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { chain, address } = parsed.data;

    // Validate address format
    if (!address || address.length < 10) {
      return json({ error: 'Invalid address format' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Verify the account belongs to this user and is not primary
    const { data: account, error: fetchError } = await supabase
      .from('accounts')
      .select('id, profile_id, chain, address, is_primary')
      .eq('profile_id', session.sub)
      .eq('chain', chain)
      .eq('address', address)
      .single();

    if (fetchError || !account) {
      return json(
        { error: 'Account not found or does not belong to you' },
        { status: 404 }
      );
    }

    // Prevent deletion of primary accounts (shouldn't be in DB anyway, but safety check)
    if (account.is_primary) {
      return json(
        { error: 'Cannot remove primary account' },
        { status: 400 }
      );
    }

    // Delete the account
    const { error: deleteError } = await supabase
      .from('accounts')
      .delete()
      .eq('id', account.id)
      .eq('profile_id', session.sub);

    if (deleteError) {
      console.error('Failed to delete account:', deleteError);
      return json(
        { error: 'Failed to remove account', message: deleteError.message },
        { status: 500 }
      );
    }

    return json({
      success: true,
      message: 'Account removed successfully',
    });
  } catch (error) {
    console.error('Delete account error:', error);
    return json(
      {
        error: 'Failed to remove account',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};
