/**
 * CDP Algorand Wallet Signer
 *
 * Implements WalletSigner interface for signing Algorand transactions
 * using CDP embedded wallets with derived Algorand keys.
 */

import algosdk from 'algosdk';
import type { WalletSigner } from '$lib/game-engine/adapters/VoiSlotMachineAdapter';
import { deriveAlgorandAccountFromEVM } from '$lib/chains/algorand-derive';

// CDP Core module type (from @coinbase/cdp-core)
export interface CdpCoreModule {
	exportEvmAccount(params: { evmAccount: `0x${string}` }): Promise<{ privateKey: string }>;
	getCurrentUser(): Promise<any>;
	getAccessToken(): Promise<string>;
}

/**
 * CDP-based Algorand transaction signer
 *
 * This signer exports the EVM private key from CDP wallet,
 * derives the Algorand keypair, signs transactions, and
 * securely erases the private key from memory.
 */
export class CdpAlgorandSigner implements WalletSigner {
	private cdpSdk: CdpCoreModule;
	private evmAddress: string;
	private _algorandAddress: string;

	constructor(cdpSdk: CdpCoreModule, evmAddress: string, algorandAddress: string) {
		this.cdpSdk = cdpSdk;
		this.evmAddress = evmAddress;
		this._algorandAddress = algorandAddress;
	}

	/**
	 * Get the Algorand address for this signer
	 */
	get address(): string {
		return this._algorandAddress;
	}

	/**
	 * Sign multiple Algorand transactions
	 *
	 * This method:
	 * 1. Exports the EVM private key from CDP (triggers user approval popup)
	 * 2. Derives the Algorand keypair deterministically
	 * 3. Signs all transactions
	 * 4. Securely erases the private key from memory
	 *
	 * @param txns - Array of unsigned Algorand transactions
	 * @returns Array of signed transaction blobs
	 * @throws Error if CDP export fails or user denies permission
	 */
	async signTransactions(txns: algosdk.Transaction[]): Promise<Uint8Array[]> {
		let derivedAccount: algosdk.Account | null = null;

		try {
			// Step 1: Export EVM private key from CDP
			// This will trigger a user approval popup in the CDP interface
			console.log('🔐 Requesting key export from CDP...');

			const { privateKey } = await this.cdpSdk.exportEvmAccount({
				evmAccount: this.evmAddress as `0x${string}`
			});

			if (!privateKey) {
				throw new Error('Failed to export private key from CDP');
			}

			// Step 2: Derive Algorand account from EVM key
			console.log('🔑 Deriving Algorand keypair...');
			derivedAccount = deriveAlgorandAccountFromEVM(privateKey);

			// Verify the derived address matches expected address
			if (derivedAccount.addr !== this._algorandAddress) {
				throw new Error(
					`Address mismatch: derived ${derivedAccount.addr}, expected ${this._algorandAddress}`
				);
			}

			// Step 3: Sign all transactions
			console.log(`✍️  Signing ${txns.length} transaction(s)...`);

			const signedBlobs: Uint8Array[] = txns.map((txn) => {
				const signed = algosdk.signTransaction(txn, derivedAccount!.sk);
				return signed.blob;
			});

			console.log('✅ Transaction(s) signed successfully');
			return signedBlobs;
		} catch (error) {
			// Handle specific CDP errors
			if (error instanceof Error) {
				if (error.message.includes('User denied')) {
					throw new Error('Transaction signing cancelled. Please approve in your CDP wallet.');
				}
				if (error.message.includes('not found') || error.message.includes('Invalid account')) {
					throw new Error('Wallet not found. Please ensure you are logged in to CDP.');
				}
			}

			// Re-throw with context
			console.error('Transaction signing failed:', error);
			throw new Error(
				`Failed to sign transactions: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		} finally {
			// Step 4: CRITICAL - Always cleanup private key
			// Overwrite the secret key bytes with zeros to remove from memory
			if (derivedAccount && derivedAccount.sk) {
				derivedAccount.sk.fill(0);
				console.log('🧹 Private key securely erased from memory');
			}
		}
	}
}

/**
 * Create a CDP Algorand signer instance
 *
 * @param cdpSdk - Initialized CDP core module
 * @param evmAddress - User's EVM wallet address (from CDP)
 * @param algorandAddress - User's derived Algorand address
 * @returns Configured WalletSigner
 */
export function createCdpAlgorandSigner(
	cdpSdk: CdpCoreModule,
	evmAddress: string,
	algorandAddress: string
): WalletSigner {
	return new CdpAlgorandSigner(cdpSdk, evmAddress, algorandAddress);
}
