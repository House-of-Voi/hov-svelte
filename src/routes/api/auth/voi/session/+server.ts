import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import algosdk from 'algosdk';
import nacl from 'tweetnacl';
import { setVoiAddressCookie } from '$lib/auth/cookies';

/**
 * POST /api/auth/voi/session
 *
 * Stores the CDP-derived Voi address in the session cookie after verifying ownership.
 * This endpoint is called by the client after deriving the Voi address from the CDP private key.
 *
 * Flow:
 * 1. Client exports CDP private key
 * 2. Client derives Voi address using deriveAlgorandAccountFromEVM()
 * 3. Client signs a proof transaction with the derived keypair
 * 4. Client sends address + signature to this endpoint
 * 5. Server verifies signature proves ownership
 * 6. Server stores address in HTTP-only cookie
 */

const schema = z.object({
  voiAddress: z.string().min(1),
  signedTransaction: z.string().min(1),
});

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  try {
    const session = locals.hovSession;

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

    const { voiAddress, signedTransaction } = parsed.data;

    // Validate Algorand/Voi address format
    if (!algosdk.isValidAddress(voiAddress)) {
      return json(
        { error: 'Invalid Voi address format' },
        { status: 400 }
      );
    }

    // Decode and verify the signed transaction
    let decodedTxn;
    let txnBytes: Buffer;
    try {
      txnBytes = Buffer.from(signedTransaction, 'base64');
      decodedTxn = algosdk.decodeSignedTransaction(txnBytes);
    } catch (err) {
      return json(
        { error: 'Invalid signed transaction format' },
        { status: 400 }
      );
    }

    // Verify the transaction was signed by the claimed address
    // Some decoders return Address objects (with toString), others expose raw bytes via `snd`
    const txnSender = (() => {
      const txn: any = (decodedTxn as any)?.txn ?? {};
      const fromField = txn.from;
      // Case 1: Address object with toString()
      if (fromField && typeof fromField.toString === 'function') {
        return fromField.toString();
      }
      // Case 2: Address-like with publicKey bytes
      if (fromField && fromField.publicKey) {
        try {
          const pk = fromField.publicKey;
          const pkBytes = pk instanceof Uint8Array ? pk : new Uint8Array(pk);
          return algosdk.encodeAddress(pkBytes);
        } catch (_) {
          // fallthrough
        }
      }
      // Case 3: Raw sender bytes on `snd`
      const sndField = txn.snd;
      if (sndField) {
        try {
          if (sndField instanceof Uint8Array) {
            return algosdk.encodeAddress(sndField);
          }
          // Buffer or array-like
          if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(sndField)) {
            return algosdk.encodeAddress(new Uint8Array(sndField));
          }
          // Base64/string encoded
          if (typeof sndField === 'string') {
            const bytes = Buffer.from(sndField, 'base64');
            return algosdk.encodeAddress(new Uint8Array(bytes));
          }
          // Array-like
          if (Array.isArray(sndField)) {
            return algosdk.encodeAddress(Uint8Array.from(sndField));
          }
        } catch (_) {
          // ignore and fallthrough to null
        }
      }
      // Case 4: Decode raw msgpack to extract txn.snd directly
      try {
        const raw: any = algosdk.decodeObj(txnBytes);
        const rawSnd = raw?.txn?.snd;
        if (rawSnd) {
          if (rawSnd instanceof Uint8Array) {
            return algosdk.encodeAddress(rawSnd);
          }
          if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(rawSnd)) {
            return algosdk.encodeAddress(new Uint8Array(rawSnd));
          }
          if (Array.isArray(rawSnd)) {
            return algosdk.encodeAddress(Uint8Array.from(rawSnd));
          }
        }
      } catch (_) {
        // ignore
      }
      return null;
    })();

    if (!txnSender) {
      // Minimal introspection to aid debugging in logs (no sensitive data)
      try {
        const txnAny: any = (decodedTxn as any)?.txn ?? {};
        console.warn('VOI session: could not derive sender', {
          txnKeys: Object.keys(txnAny),
          fromType: typeof txnAny.from,
          hasFromToString: !!txnAny.from && typeof txnAny.from.toString === 'function',
          sndType: txnAny.snd ? (Array.isArray(txnAny.snd) ? 'array' : typeof txnAny.snd) : 'missing',
        });
      } catch {}
      return json(
        { error: 'Unable to determine transaction sender' },
        { status: 400 }
      );
    }

    if (txnSender !== voiAddress) {
      return json(
        { error: 'Transaction sender does not match provided Voi address' },
        { status: 400 }
      );
    }

    // Verify the signature is valid (checks that the private key actually signed this)
    // Use the same method as algorand-link.ts: bytesToSign() and nacl verification
    let isValid = false;
    try {
      const sig: Uint8Array | undefined = (decodedTxn as any)?.sig;
      const txn = (decodedTxn as any)?.txn;

      if (!sig || !txn) {
        console.warn('VOI session: missing signature or transaction', {
          hasSig: !!sig,
          hasTxn: !!txn,
        });
      } else {
        // Use the transaction's bytesToSign() method which returns 'TX' || msgpack(txn)
        const txnBytes = txn.bytesToSign();
        const sender = txn.sender;
        
        if (!sender || !sender.publicKey) {
          console.warn('VOI session: transaction missing sender or publicKey', {
            hasSender: !!sender,
            hasPublicKey: !!sender?.publicKey,
          });
        } else {
          // Verify using nacl with the sender's public key
          isValid = nacl.sign.detached.verify(txnBytes, sig, sender.publicKey);
          console.debug('VOI session: verification result', {
            isValid,
            senderAddress: sender.toString(),
            claimedAddress: voiAddress,
            addressesMatch: sender.toString() === voiAddress,
          });
        }
      }
    } catch (e) {
      console.warn('VOI session: verification threw', { message: (e as Error).message, stack: (e as Error).stack });
      isValid = false;
    }
    if (!isValid) {
      // Final debug snapshot on failure
      try {
        console.warn('VOI session: signature invalid', {
          claimedAddress: voiAddress,
          derivedSender: txnSender,
          senderMatches: txnSender === voiAddress,
        });
      } catch {}
      return json(
        { error: 'Invalid transaction signature' },
        { status: 400 }
      );
    }

    // All checks passed - store the Voi address in session cookie
    // Cookie expires in 1 hour by default, forcing re-derivation periodically
    setVoiAddressCookie(cookies, voiAddress, 3600);

    return json({
      ok: true,
      voiAddress,
      message: 'Voi address stored in session',
    });
  } catch (error) {
    console.error('Set Voi session error:', error);
    return json(
      {
        error: 'Failed to store Voi address in session',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};

/**
 * DELETE /api/auth/voi/session
 *
 * Clears the Voi address from the session cookie
 */
export const DELETE: RequestHandler = async ({ cookies }) => {
  const { clearVoiAddressCookie } = await import('$lib/auth/cookies');
  clearVoiAddressCookie(cookies);

  return json({
    ok: true,
    message: 'Voi address cleared from session',
  });
};
