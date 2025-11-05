/**
 * AlgoKit TransactionSigner factory
 *
 * Adapts the WalletSigner interface to AlgoKit's TransactionSigner function type.
 */

import algosdk from 'algosdk';
import type { TransactionSigner } from '@algorandfoundation/algokit-utils';

export interface WalletSigner {
	address: string;
	signTransactions: (txns: algosdk.Transaction[]) => Promise<Uint8Array[]>;
}

/**
 * Create an AlgoKit-compatible TransactionSigner that funnels signing
 * requests through the provided WalletSigner.
 */
export function createAlgoKitTransactionSigner(walletSigner: WalletSigner): TransactionSigner {
	console.log('🏭 createAlgoKitTransactionSigner called');
	console.log('  - walletSigner:', { 
		address: walletSigner.address,
		hasSignTransactions: typeof walletSigner.signTransactions === 'function'
	});
	
	const signerFunction: TransactionSigner = async (
		txnGroup: algosdk.Transaction[],
		indexesToSign: number[]
	): Promise<Uint8Array[]> => {
		console.log('🔐 TransactionSigner FUNCTION CALLED');
		console.log('  - txnGroup length:', txnGroup.length);
		console.log('  - indexesToSign:', indexesToSign);
		console.log('  - txnGroup types:', txnGroup.map(t => t.constructor.name));
		
		const txnsToSign = indexesToSign.map((i) => txnGroup[i]);
		console.log('  - txnsToSign length:', txnsToSign.length);
		
		console.log('  - Calling walletSigner.signTransactions...');
		const signedTxns = await walletSigner.signTransactions(txnsToSign);
		console.log('  - Got signedTxns:', {
			length: signedTxns.length,
			types: signedTxns.map((blob, i) => ({
				index: i,
				type: typeof blob,
				isUint8Array: blob instanceof Uint8Array,
				constructor: blob?.constructor?.name,
				length: blob instanceof Uint8Array ? blob.length : 'N/A'
			}))
		});

		if (signedTxns.length !== indexesToSign.length) {
			throw new Error(
				`Unexpected signature count: got ${signedTxns.length}, expected ${indexesToSign.length}`
			);
		}

		const result = signedTxns.map((blob, i) => {
			if (!(blob instanceof Uint8Array)) {
				console.warn(
					`⚠️ Signer returned non-Uint8Array at index ${i}; coercing to Uint8Array`,
					{ 
						constructor: blob?.constructor?.name,
						type: typeof blob,
						value: blob
					}
				);
				return new Uint8Array(blob);
			}
			return blob;
		});
		
		console.log('  - Returning result:', {
			length: result.length,
			allAreUint8Array: result.every(b => b instanceof Uint8Array)
		});
		
		return result;
	};
	
	// Ensure the function is properly recognized as a TransactionSigner
	// Add a marker to help with debugging
	(signerFunction as any).__isTransactionSigner = true;
	
	console.log('  - Created signerFunction:', {
		type: typeof signerFunction,
		isFunction: typeof signerFunction === 'function',
		hasMarker: !!(signerFunction as any).__isTransactionSigner
	});
	
	return signerFunction;
}
