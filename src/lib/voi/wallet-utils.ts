import algosdk from 'algosdk';
import { getWalletService } from './wallet-service';
import { StoredKeySigner } from '$lib/wallet/StoredKeySigner';
import type { SessionInfo } from '$lib/auth/session';
import { signTransactions as avmSignTransactions } from 'avm-wallet-svelte';

/**
 * Sign a transaction using the appropriate wallet (CDP or native Voi wallet)
 * @param txn - The transaction to sign
 * @param address - The Algorand/Voi address
 * @param session - The user session (contains CDP info if applicable)
 * @returns Signed transaction blob
 */
export async function signTransaction(
	txn: algosdk.Transaction,
	address: string,
	session: SessionInfo | null
): Promise<Uint8Array> {
	// Check if user has a CDP wallet (has cdpUserId) - use stored keys
	if (session?.cdpUserId) {
		// Use stored keys for signing (no CDP interaction needed)
		const signer = new StoredKeySigner(address);
		const signedTxns = await signer.signTransactions([txn]);
		return signedTxns[0];
	} else {
		// Use native Voi wallet (Kibisis, Pera, Defly, Exodus)
		const walletService = getWalletService();
		const signedTxn = await walletService.signTransaction(txn);
		return signedTxn.blob;
	}
}

/**
 * Sign multiple transactions using the appropriate wallet
 * @param txns - Array of transactions to sign
 * @param address - The Algorand/Voi address (used as fallback, but actual sender from transactions takes precedence)
 * @param session - The user session (contains CDP info if applicable)
 * @returns Array of signed transaction blobs
 */
export async function signTransactions(
	txns: algosdk.Transaction[],
	address: string,
	session: SessionInfo | null
): Promise<Uint8Array[]> {
	// Extract the actual sender address from the first transaction
	// This ensures we use the address that the transactions were built for
	const firstTxn = txns[0];
	if (!firstTxn) {
		throw new Error('No transactions to sign');
	}

	// Get sender from transaction (algosdk 3.x uses 'sender' or 'from')
	const txnSender = (firstTxn as any).sender || (firstTxn as any).from;
	
	// Extract address string from various formats
	let actualAddress: string;
	if (typeof txnSender === 'string') {
		actualAddress = txnSender;
	} else if (txnSender && typeof txnSender === 'object' && txnSender.publicKey) {
		// Address object with publicKey property
		actualAddress = algosdk.encodeAddress(txnSender.publicKey);
	} else if (txnSender instanceof Uint8Array) {
		// Uint8Array (public key)
		actualAddress = algosdk.encodeAddress(txnSender);
	} else {
		// Fallback: try to encode as-is
		actualAddress = algosdk.encodeAddress(txnSender);
	}

	// Use the actual transaction sender address, not the passed address
	// This ensures CDP derivation matches the transaction sender
	const signerAddress = actualAddress || address;

	// Check if the address has stored game account keys
	// This works for ANY game account the user has unlocked, not just the "active" one
	// If stored keys exist for this address, use StoredKeySigner
	// Otherwise, fall back to external wallet
	let hasStoredKeys = false;
	try {
		const { getGameAccountKeys } = await import('$lib/auth/gameAccountStorage');
		const storedKeys = await getGameAccountKeys(signerAddress);
		if (storedKeys) {
			hasStoredKeys = true;
			console.log('Found stored keys for address:', signerAddress.slice(0, 8) + '...');
		} else {
			console.log('No stored keys found for address:', signerAddress.slice(0, 8) + '..., will use external wallet');
		}
	} catch (error) {
		// If we can't check, assume it's not a game account
		console.warn('Could not check if address has stored keys:', error);
	}

	if (hasStoredKeys) {
		// Use stored keys for signing (CDP address with stored keys)
		const signer = new StoredKeySigner(signerAddress);
		return await signer.signTransactions(txns);
	} else {
		// Use avm-wallet-svelte for external wallet signing
		try {
			const signedTxns = await avmSignTransactions([txns]);
			return signedTxns.map((s) => s instanceof Uint8Array ? s : s.blob || new Uint8Array(s));
		} catch (error) {
			// Fallback to VoiWalletService if avm-wallet-svelte fails
			const walletService = getWalletService();
			if (!walletService.isConnected()) {
				throw new Error(
					'No signing method available for this address. ' +
					'If this is a game account, please unlock it first. ' +
					'If this is an external wallet, please connect it.'
				);
			}
			const signedTxns = await walletService.signTransactions(txns);
			return signedTxns.map((s) => s.blob);
		}
	}
}
