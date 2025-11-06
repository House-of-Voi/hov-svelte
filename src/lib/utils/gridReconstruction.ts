/**
 * Grid Reconstruction Utilities
 *
 * Utilities for reconstructing slot machine grids from transaction data.
 * Used for displaying historical spin outcomes.
 */

import algosdk from 'algosdk';
import { env } from './env';
import { parseBetKey, hexToUint8Array } from '$lib/game-engine/utils/betKeyUtils';
import { generateGridFromBetKey } from '$lib/game-engine/utils/gridGeneration';
import { base64ToUint8Array } from '$lib/game-engine/utils/betKeyUtils';
import { mimirClient } from '$lib/mimir/client';
import { ensureBase32TxId } from './txIdUtils';

/**
 * Decode base64 to Uint8Array (server-side compatible)
 */
function decodeBase64(base64: string): Uint8Array {
	// Use Buffer in Node.js environment
	if (typeof Buffer !== 'undefined') {
		return new Uint8Array(Buffer.from(base64, 'base64'));
	}
	// Fallback to base64ToUint8Array for browser
	return base64ToUint8Array(base64);
}

/**
 * Hardcoded reel data (matches VoiSlotMachineAdapter)
 */
const REEL_DATA = "_CCC__BD___D_____D_____D__DBDDCC_D_C_D__AD_D_CB_C_A_B___B_______DD___D_C_A_____B__C__D______D_______C_A_____C__DC_____B__B_CD_B___CD__DAD__C__C______CDD_______C_DA________DDD____CDDD___DB____BD__B_______D_D_B_________CD__D__C_C____B__A___CDB__BC_D__D__CD_C_________D___A_DC__B______B_DDDDD_____C_CDA_C___C_CDDDDC__D__CCB____D_B__B______D______BD_____A____D_D__AD__D__B___B__C____A____C_D_D___C__CDD___________________CC___DC___DDB_BDADDC______B____C__D___D__CA_______CD__D_D_C_______BD_C_DBA_BDD__CD_";
const REEL_LENGTH = 100;
const WINDOW_LENGTH = 3;

/**
 * Get algod client for server-side use
 */
function getAlgodClient(): algosdk.Algodv2 {
	const nodeUrl = env.VOI_NODE_URL || 'https://mainnet-api.voi.nodely.dev';
	return new algosdk.Algodv2('', nodeUrl, '');
}

/**
 * Get indexer client for server-side use
 */
function getIndexerClient(): algosdk.Indexer {
	const indexerUrl = env.VOI_INDEXER_URL || 'https://mainnet-idx.voi.nodely.dev';
	return new algosdk.Indexer('', indexerUrl, '');
}

// Re-export ensureBase32TxId for convenience (imported from txIdUtils)
export { ensureBase32TxId };

/**
 * Extract bet key from transaction logs
 * Returns both the bet key and the transaction round
 */
export async function extractBetKeyFromTransaction(txId: string): Promise<{ betKey: string; round: number } | null> {
	try {
		const indexer = getIndexerClient();
		const base32TxId = ensureBase32TxId(txId);
		
		console.log('Extracting bet key from transaction:', txId, 'converted to:', base32TxId);
		
		// Fetch transaction from indexer
		const response = await indexer.lookupTransactionByID(base32TxId).do();
		const tx = response?.transaction;
		
		if (!tx) {
			console.warn('Transaction not found:', txId);
			return null;
		}

		// Get confirmed round (handle both property formats for algosdk 3.x)
		const getConfirmedRound = (): number | null => {
			const round = tx['confirmed-round'] ?? tx.confirmedRound;
			if (round !== undefined && round !== null) {
				return typeof round === 'bigint' ? Number(round) : Number(round);
			}
			return null;
		};

		// Find the app call transaction
		// If the main transaction is not an app call, we'll still check its logs
		// since transaction groups often have logs in the main transaction
		// Handle both indexer format ('tx-type') and algosdk 3.x format ('type')
		const txType = tx?.['tx-type'] ?? tx?.type;
		let appTxn: any = (txType === 'appl') ? tx : null;
		
		// If not an app call, we can still use the main transaction's logs
		// The bet key is typically logged in the main transaction even if it's part of a group

		// Check application call return value first (ARC-4 return)
		if (appTxn?.['application-transaction']?.['return-value']) {
			try {
				const returnValue = appTxn['application-transaction']['return-value'];
				const bytes = decodeBase64(returnValue);
				
				// Helper to convert bytes to hex
				const toHex = (arr: Uint8Array) => Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
				
				// The bet key is exactly 56 bytes (112 hex chars)
				if (bytes.length === 56) {
					const betKey = toHex(bytes);
					const round = getConfirmedRound();
					console.log('Found bet key in return value');
					if (round !== null) {
						return { betKey, round };
					}
				}
			} catch (error) {
				console.warn('Failed to parse return value:', error);
			}
		}

		// Check logs
		const logs: string[] = appTxn?.logs || tx?.logs || [];
		console.log('Transaction logs count:', logs.length);

		// ARC-4 return values are logged with a 4-byte prefix 0x151f7c75
		const ARC4_RETURN_PREFIX = new Uint8Array([0x15, 0x1f, 0x7c, 0x75]);

		// Helper to convert bytes to hex
		const toHex = (arr: Uint8Array) => Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');

		// Look for the bet key in logs
		for (let i = 0; i < logs.length; i++) {
			const b64Log = logs[i];
			try {
				// Decode base64 to bytes
				const bytes = decodeBase64(b64Log);
				console.log(`Log ${i}: ${bytes.length} bytes`);

				// The bet key is exactly 56 bytes (112 hex chars)
				if (bytes.length === 56) {
					// This log entry is exactly the bet key
					const betKey = toHex(bytes);
					const round = getConfirmedRound();
					console.log('Found bet key in log (56 bytes)');
					if (round !== null) {
						return { betKey, round };
					}
				}

				// ARC-4 return log: 0x151f7c75 + <56-byte bet key>
				if (bytes.length === 60) {
					const hasPrefix =
						bytes[0] === ARC4_RETURN_PREFIX[0] &&
						bytes[1] === ARC4_RETURN_PREFIX[1] &&
						bytes[2] === ARC4_RETURN_PREFIX[2] &&
						bytes[3] === ARC4_RETURN_PREFIX[3];
					if (hasPrefix) {
						const betKey = toHex(bytes.slice(4));
						const round = getConfirmedRound();
						console.log('Found bet key in log (ARC-4 format)');
						if (round !== null) {
							return { betKey, round };
						}
					}
				}
			} catch (e) {
				console.warn(`Failed to parse log ${i}:`, e);
				// Continue to next log entry
				continue;
			}
		}

		// Check inner transactions
		const innerTxns = appTxn?.['inner-txns'] ?? appTxn?.innerTxns ?? [];
		if (innerTxns.length > 0) {
			console.log('Checking inner transactions:', innerTxns.length);
			for (const innerTxn of innerTxns) {
				const innerTxType = innerTxn['tx-type'] ?? innerTxn.type;
				if (innerTxType === 'appl' && innerTxn.logs) {
					for (const b64Log of innerTxn.logs) {
						try {
							const bytes = decodeBase64(b64Log);
							if (bytes.length === 56) {
								const betKey = toHex(bytes);
								const round = getConfirmedRound();
								console.log('Found bet key in inner transaction log');
								if (round !== null) {
									return { betKey, round };
								}
							}
						} catch (e) {
							continue;
						}
					}
				}
			}
		}

		// If bet key not found in logs, reconstruct it from transaction data and Mimir database
		console.log('Bet key not found in logs, attempting reconstruction from transaction data...');
		// Use original txId (might be hex-encoded) for Mimir query, but also try base32
		return await reconstructBetKeyFromTransactionData(tx, txId, base32TxId);
	} catch (error) {
		console.error('Failed to extract bet key from transaction:', error);
		return null;
	}
}

/**
 * Reconstruct bet key from transaction data and Mimir database
 * Bet key format: 32 bytes sender + 8 bytes amount + 8 bytes max_payline_index + 8 bytes index_value
 */
async function reconstructBetKeyFromTransactionData(
	tx: any,
	originalTxId: string,
	base32TxId: string
): Promise<{ betKey: string; round: number } | null> {
	try {
		// Get sender address from transaction (handle algosdk 3.x Address objects)
		let sender: string | null = null;
		const senderField = tx?.sender;
		
		if (senderField) {
			// Handle Address object (algosdk 3.x)
			if (typeof senderField === 'object' && 'toString' in senderField) {
				sender = senderField.toString();
			} else if (typeof senderField === 'string') {
				sender = senderField;
			} else if (senderField.publicKey) {
				// If it's an Address-like object with publicKey, encode it
				const pk = senderField.publicKey;
				const pkBytes = pk instanceof Uint8Array ? pk : new Uint8Array(pk);
				sender = algosdk.encodeAddress(pkBytes);
			}
		}
		
		if (!sender) {
			console.warn('No sender in transaction');
			return null;
		}

		// Decode sender address to get public key (32 bytes)
		const decodedAddress = algosdk.decodeAddress(sender);
		const senderBytes = decodedAddress.publicKey;

		// Get bet parameters from Mimir database using transaction ID
		// Try both original and base32 formats since Mimir might store it differently
		let event = null;
		
		// First try with original txId (might be hex-encoded)
		const { data: event1 } = await mimirClient
			.from('hov_events')
			.select('amount, max_payline_index, index_value')
			.eq('txid', originalTxId)
			.limit(1)
			.maybeSingle();
		
		if (event1) {
			event = event1;
		} else {
			// Try with base32 format
			const { data: event2 } = await mimirClient
				.from('hov_events')
				.select('amount, max_payline_index, index_value')
				.eq('txid', base32TxId)
				.limit(1)
				.maybeSingle();
			
			if (event2) {
				event = event2;
			}
		}

		if (!event) {
			console.warn('Event not found in Mimir database for transaction:', originalTxId, 'or', base32TxId);
			return null;
		}

		const amount = Number(event.amount || 0);
		const maxPaylineIndex = Number(event.max_payline_index || 0);
		const indexValue = Number(event.index_value || 0);

		if (amount <= 0) {
			console.warn('Invalid amount in event data');
			return null;
		}

		// Helper to encode uint64 as big-endian bytes
		const u64be = (val: number | bigint): Uint8Array => {
			const buf = new Uint8Array(8);
			new DataView(buf.buffer).setBigUint64(0, BigInt(val), false);
			return buf;
		};

		// Reconstruct bet key: 32 bytes sender + 8 bytes amount + 8 bytes max_payline_index + 8 bytes index_value
		const keyBytes = new Uint8Array(32 + 8 + 8 + 8);
		keyBytes.set(senderBytes, 0);
		keyBytes.set(u64be(amount), 32);
		keyBytes.set(u64be(maxPaylineIndex), 40);
		keyBytes.set(u64be(indexValue), 48);

		const betKey = Array.from(keyBytes)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');

		// Get confirmed round (handle both property formats for algosdk 3.x)
		const round = tx['confirmed-round'] ?? tx.confirmedRound;
		if (round === undefined || round === null) {
			console.warn('No confirmed round in transaction');
			return null;
		}
		const roundNumber = typeof round === 'bigint' ? Number(round) : Number(round);

		console.log('Reconstructed bet key from transaction data and Mimir database');
		return { betKey, round: roundNumber };
	} catch (error) {
		console.error('Failed to reconstruct bet key from transaction data:', error);
		return null;
	}
}

/**
 * Get block seed for a given round
 */
export async function getBlockSeedForRound(round: number): Promise<Uint8Array> {
	try {
		const client = getAlgodClient();
		const block = await client.block(round).do();
		// Use block.block.header.seed (matches VoiSlotMachineAdapter)
		const blockSeed = block.block.header.seed;
		
		let seedBytes: Uint8Array;
		if (blockSeed instanceof Uint8Array) {
			seedBytes = blockSeed;
		} else if (typeof blockSeed === 'string') {
			seedBytes = decodeBase64(blockSeed);
		} else if (Array.isArray(blockSeed)) {
			seedBytes = new Uint8Array(blockSeed);
		} else {
			throw new Error(`Unexpected block seed type: ${typeof blockSeed}`);
		}
		
		// Return last 32 bytes (matches contract behavior)
		return new Uint8Array(seedBytes.slice(-32));
	} catch (eAlgod: any) {
		console.warn('Algod block seed fetch failed, trying indexer:', eAlgod?.message || eAlgod);
		try {
			const indexer = getIndexerClient();
			const block = await indexer.lookupBlock(round).do();
			// Try multiple possible paths for indexer response structure
			const blockSeed = 
				(block as any)?.block?.header?.seed ||
				(block as any)?.header?.seed ||
				(block as any)?.block?.seed ||
				(block as any)?.seed;
			
			if (!blockSeed) {
				console.error('Indexer block structure:', JSON.stringify(block, null, 2).substring(0, 500));
				throw new Error('Indexer did not return a seed');
			}
			
			let seedBytes: Uint8Array;
			if (blockSeed instanceof Uint8Array) {
				seedBytes = blockSeed;
			} else if (typeof blockSeed === 'string') {
				seedBytes = decodeBase64(blockSeed);
			} else if (Array.isArray(blockSeed)) {
				seedBytes = new Uint8Array(blockSeed);
			} else {
				throw new Error(`Unexpected block seed type: ${typeof blockSeed}`);
			}
			return new Uint8Array(seedBytes.slice(-32));
		} catch (eIndexer: any) {
			throw new Error(`Failed to get block seed: ${eAlgod?.message || eAlgod}, ${eIndexer?.message || eIndexer}`);
		}
	}
}

/**
 * Get transaction round from transaction ID (kept for backward compatibility)
 * @deprecated Use extractBetKeyFromTransaction which returns both bet key and round
 */
export async function getTransactionRound(txId: string): Promise<number | null> {
	try {
		const result = await extractBetKeyFromTransaction(txId);
		return result?.round || null;
	} catch (error) {
		console.error('Failed to get transaction round:', error);
		return null;
	}
}

/**
 * Generate grid from bet key and claim round
 */
export async function generateGridFromBetKeyAndRound(
	betKey: string,
	claimRound: number
): Promise<string[][]> {
	const betKeyBytes = parseBetKey(betKey);
	const blockSeed = await getBlockSeedForRound(claimRound);
	
	const grid = await generateGridFromBetKey(
		betKeyBytes,
		blockSeed,
		REEL_DATA,
		REEL_LENGTH,
		WINDOW_LENGTH
	);
	
	// Convert from SymbolId[][] to string[][]
	return grid.map(col => col.map(symbol => symbol as string));
}

