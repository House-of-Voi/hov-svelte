import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import algosdk from 'algosdk';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { getServerSessionFromCookies } from '$lib/auth/session';
import {
  verifyAlgorandLinkChallenge,
  verifyAlgorandOwnershipProof,
} from '$lib/auth/algorand-link';

const schema = z.object({
  algorandAddress: z.string().min(1),
  signedTransaction: z.string().min(1),
  challenge: z.string().min(1),
});

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const session = await getServerSessionFromCookies(cookies);

    if (!session) {
      return json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
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

    const supabase = createAdminClient();

    await supabase.from('accounts').upsert(
      {
        profile_id: session.sub,
        chain: 'voi',
        address: algorandAddress,
        wallet_provider: 'coinbase-embedded',
        is_primary: true,
        derived_from_chain: 'base',
        derived_from_address: baseAddress,
      },
      { onConflict: 'chain,address' }
    );

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
