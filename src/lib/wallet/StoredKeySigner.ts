/**
 * Stored Key Wallet Signer
 * 
 * Implements WalletSigner interface for signing Algorand transactions
 * using stored private keys from encrypted browser storage.
 * This replaces CdpAlgorandSigner and eliminates the need for CDP interaction
 * after initial authentication.
 */

import algosdk from 'algosdk';
import type { WalletSigner } from '$lib/wallet/algokitTransactionSigner';
import { getKeys } from '$lib/auth/keyStorage';

/**
 * Wallet signer that uses stored encrypted keys
 * 
 * This signer reads encrypted keys from browser storage, decrypts them,
 * signs transactions, and securely erases keys from memory.
 */
export class StoredKeySigner implements WalletSigner {
	private voiAddress: string;
	private voiPrivateKey: Uint8Array | null = null;

	constructor(voiAddress: string) {
		this.voiAddress = voiAddress;
	}

	/**
	 * Get the Algorand address for this signer
	 */
	get address(): string {
		return this.voiAddress;
	}

	/**
	 * Sign multiple Algorand transactions using stored keys
	 * 
	 * This method:
	 * 1. Retrieves and decrypts the Voi private key from browser storage
	 * 2. Signs all transactions
	 * 3. Securely erases the private key from memory
	 * 
	 * @param txns - Array of unsigned Algorand transactions
	 * @returns Array of signed transaction blobs
	 * @throws Error if keys are missing, decryption fails, or signing fails
	 */
	async signTransactions(txns: algosdk.Transaction[]): Promise<Uint8Array[]> {
		try {
			// Step 1: Retrieve and decrypt stored keys
			console.log('🔐 Retrieving stored keys...');
			const storedKeys = await getKeys();

			if (!storedKeys) {
				throw new Error('No stored keys found. Please log in again to export and store your keys.');
			}

			// Verify the stored Voi address matches expected address
			if (storedKeys.voiAddress !== this.voiAddress) {
				throw new Error(
					`Address mismatch: stored ${storedKeys.voiAddress}, expected ${this.voiAddress}`
				);
			}

			// Step 2: Convert hex string to Uint8Array
			// Algorand secret key is 64 bytes (128 hex characters)
			const voiPrivateKeyHex = storedKeys.voiPrivateKey.replace(/^0x/, '');
			if (voiPrivateKeyHex.length !== 128) {
				throw new Error(`Invalid Voi private key length: expected 128 hex chars (64 bytes), got ${voiPrivateKeyHex.length}`);
			}

			this.voiPrivateKey = new Uint8Array(
				voiPrivateKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
			);

			// Verify the length is correct (should be 64 bytes)
			if (this.voiPrivateKey.length !== 64) {
				throw new Error(`Invalid Voi private key byte length: expected 64 bytes, got ${this.voiPrivateKey.length}`);
			}

			// Step 3: Sign all transactions
			console.log(`✍️  Signing ${txns.length} transaction(s) with stored keys...`);

			const signedBlobs: Uint8Array[] = txns.map((txn) => {
				if (!this.voiPrivateKey) {
					throw new Error('Private key not available for signing');
				}

				const signed = algosdk.signTransaction(txn, this.voiPrivateKey);
				return signed.blob;
			});

			console.log('✅ Transaction(s) signed successfully');
			return signedBlobs;
		} catch (error) {
			// Re-throw with context
			console.error('Transaction signing failed:', error);
			throw new Error(
				`Failed to sign transactions: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		} finally {
			// Step 4: CRITICAL - Always cleanup private key
			// Overwrite the secret key bytes with zeros to remove from memory
			if (this.voiPrivateKey) {
				this.voiPrivateKey.fill(0);
				this.voiPrivateKey = null;
				console.log('🧹 Private key securely erased from memory');
			}
		}
	}
}

/**
 * Create a stored key signer instance
 * 
 * @param voiAddress - User's Voi wallet address (from stored keys or session)
 * @returns Configured WalletSigner
 */
export function createStoredKeySigner(voiAddress: string): WalletSigner {
	return new StoredKeySigner(voiAddress);
}

