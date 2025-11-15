import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import algosdk from 'algosdk';

const supabaseAdmin = createAdminClient();

/**
 * POST /api/wallets/link
 * Links an external Algorand wallet to the user's profile
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const session = locals.session;

	if (!session) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await request.json();
		const { address, provider, signedProof } = body;

		if (!address || !provider || !signedProof) {
			throw error(400, 'Missing required fields: address, provider, signedProof');
		}

		// Validate address format
		if (!algosdk.isValidAddress(address)) {
			throw error(400, 'Invalid Algorand address format');
		}

		// Verify the signed proof
		// The signedProof should be a signed transaction that proves ownership of the address
		try {
			const decodedTxn = algosdk.decodeSignedTransaction(
				new Uint8Array(Buffer.from(signedProof, 'base64'))
			);

			// Verify the sender matches the claimed address
			if (decodedTxn.txn.sender?.toString() !== address) {
				throw error(403, 'Signed transaction does not match claimed address');
			}

			// Additional verification could be added here (e.g., checking note field for challenge)
		} catch (err) {
			console.error('Error verifying signed proof:', err);
			throw error(403, 'Invalid signed proof');
		}

		// Check if this address is already linked to another profile
		const { data: existingAccount } = await supabaseAdmin
			.from('accounts')
			.select('id, profile_id')
			.eq('chain', 'voi')
			.eq('address', address)
			.single();

		if (existingAccount && existingAccount.profile_id !== session.profileId) {
			throw error(409, 'This wallet is already linked to another profile');
		}

		// If already linked to this profile, return success
		if (existingAccount && existingAccount.profile_id === session.profileId) {
			return json({ success: true, message: 'Wallet already linked' });
		}

		// Create new account record
		const { data: newAccount, error: insertError } = await supabaseAdmin
			.from('accounts')
			.insert({
				profile_id: session.profileId,
				chain: 'voi',
				address: address,
				wallet_provider: 'extern',
				is_primary: false
			})
			.select()
			.single();

		if (insertError) {
			console.error('Error linking wallet:', insertError);
			throw error(500, 'Failed to link wallet');
		}

		return json({
			success: true,
			account: {
				id: newAccount.id,
				address: newAccount.address,
				provider: provider,
				isLinked: true
			}
		});
	} catch (err) {
		if (err instanceof Response) {
			throw err; // Re-throw SvelteKit errors
		}

		console.error('Error in wallet link endpoint:', err);
		throw error(500, 'Internal server error');
	}
};
