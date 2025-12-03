import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import algosdk from 'algosdk';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { getProfileIdByAccount } from '$lib/profile/data';
import {
  verifyAlgorandLinkChallenge,
  verifyAlgorandOwnershipProof,
} from '$lib/auth/algorand-link';

/**
 * POST /api/auth/algorand/link
 *
 * Links ADDITIONAL Algorand/Voi addresses to the user's profile.
 * This is NOT for the primary CDP-derived Voi address (which is automatic).
 *
 * Use cases:
 * - Connecting external Voi wallets for achievement tracking
 * - Linking hardware wallets for display purposes
 * - Multi-wallet management
 *
 * Note: Connected addresses CANNOT be used for playing games.
 * Only the CDP-derived address (stored in session) can be used for gameplay.
 */

const schema = z.object({
  algorandAddress: z.string().min(1),
  signedTransaction: z.string().min(1),
  challenge: z.string().min(1),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const session = locals.hovSession;

    if (!session) {
      return json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Read raw body first and coerce algorandAddress to a string if an Address-like object was sent
    const rawBody = await request.json().catch(() => ({} as any));

    let coercedAddress: string | undefined = undefined;
    const addrInput = rawBody?.algorandAddress;
    if (typeof addrInput === 'string') {
      coercedAddress = addrInput;
    } else if (addrInput && typeof addrInput === 'object') {
      try {
        // Handle Address-like object: { publicKey: Uint8Array | number[] | Buffer }
        const pkLike = (addrInput as any).publicKey ?? (addrInput as any).pk ?? (addrInput as any).bytes;
        if (pkLike) {
          let pkBytes: Uint8Array | undefined;
          if (pkLike instanceof Uint8Array) {
            pkBytes = pkLike;
          } else if (Array.isArray(pkLike)) {
            pkBytes = Uint8Array.from(pkLike);
          } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(pkLike)) {
            pkBytes = new Uint8Array(pkLike);
          } else if (typeof pkLike === 'object') {
            // Handle object-with-numeric-keys shape from JSON serialization
            const numericKeys = Object.keys(pkLike)
              .filter((k) => /^\d+$/.test(k))
              .map((k) => Number(k))
              .sort((a, b) => a - b);
            const arr = numericKeys.map((i) => (pkLike as any)[i] as number);
            pkBytes = Uint8Array.from(arr);
          }
          if (pkBytes && pkBytes.length === 32) {
            coercedAddress = algosdk.encodeAddress(pkBytes);
          }
        }
      } catch {
        // ignore; will fail schema if not set
      }
    }

    const body = {
      algorandAddress: coercedAddress ?? addrInput,
      signedTransaction: rawBody?.signedTransaction,
      challenge: rawBody?.challenge,
    };

    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return json(
        { error: 'Invalid payload', details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { algorandAddress, signedTransaction, challenge } = parsed.data;

    if (!algosdk.isValidAddress(algorandAddress)) {
      return json(
        { error: 'Invalid Algorand address' },
        { status: 400 }
      );
    }

    const challengeResult = verifyAlgorandLinkChallenge(challenge);

    if (!challengeResult.ok || !challengeResult.payload) {
      return json(
        { error: challengeResult.error || 'Invalid challenge token' },
        { status: 400 }
      );
    }

    const { profileId, baseAddress } = challengeResult.payload;

    if (profileId !== session.sub) {
      return json(
        { error: 'Challenge token does not belong to this session' },
        { status: 403 }
      );
    }

    const proofResult = verifyAlgorandOwnershipProof({
      algorandAddress,
      challengeToken: challenge,
      signedTransaction,
    });

    if (!proofResult.ok) {
      return json(
        { error: proofResult.error || 'Invalid proof of ownership' },
        { status: 400 }
      );
    }

    // Check if this account is already linked to another profile
    // Use direct database query to ensure case-sensitive matching
    const supabase = createAdminClient();
    const { data: existingAccount } = await supabase
      .from('accounts')
      .select('profile_id')
      .eq('chain', 'voi')
      .eq('address', algorandAddress)
      .single();
    
    if (existingAccount) {
      // If it's already linked to this user, we can just return success
      if (existingAccount.profile_id === session.sub) {
        return json({
          ok: true,
          algorandAddress,
          txId: proofResult.txId ?? null,
          message: 'Account is already linked to your profile',
        });
      }
      
      // Account is linked to a different profile - return error
      return json(
        {
          error: 'Account already linked',
          message: 'This Voi account is already linked to another profile. It must be removed from that account before it can be linked to a different profile.',
        },
        { status: 409 } // 409 Conflict
      );
    }

    // Store as a CONNECTED address (not primary)
    // The primary Voi address is the CDP-derived one (not stored in DB, lives in session)
    const { data, error: dbError } = await supabase
      .from('accounts')
      .upsert(
        {
          profile_id: session.sub,
          chain: 'voi',
          address: algorandAddress,
          wallet_provider: 'extern', // Connected external wallets (not CDP-derived)
          is_primary: false, // Connected addresses are NEVER primary
          derived_from_chain: null, // Connected addresses are not derived
          derived_from_address: null,
        },
        { onConflict: 'chain,address' }
      )
      .select();

    if (dbError) {
      console.error('Database upsert error:', dbError);
      return json(
        {
          error: 'Failed to save account to database',
          message: dbError.message || 'Database error',
        },
        { status: 500 }
      );
    }

    console.log('Account linked successfully:', { algorandAddress, profileId: session.sub, dbResult: data });

    return json({
      ok: true,
      algorandAddress,
      txId: proofResult.txId ?? null,
    });
  } catch (error) {
    console.error('Link Algorand account error:', error);
    return json(
      {
        error: 'Failed to link Algorand address',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};
