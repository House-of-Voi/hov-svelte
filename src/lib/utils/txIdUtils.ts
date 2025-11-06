/**
 * Transaction ID Utility Functions
 * 
 * Client-safe utilities for working with Algorand/VOI transaction IDs.
 * These functions don't require any server-side environment variables.
 */

import algosdk from 'algosdk';

/**
 * Convert transaction ID to base32 format if needed
 * Transaction IDs from Mimir database are stored as hex-encoded ASCII strings
 * We need to convert them to proper base32 format for the indexer
 * 
 * This function is client-safe and doesn't require any environment variables
 */
export function ensureBase32TxId(txId: string): string {
	// Check if it's already in base32 format (52 chars, base32 alphabet)
	if (/^[A-Z2-7]{52}$/.test(txId)) {
		return txId;
	}
	
	// Check if it's hex-encoded (64 hex chars = 32 bytes)
	if (/^[0-9a-fA-F]{64}$/.test(txId)) {
		try {
			// Convert hex to bytes
			const bytes = new Uint8Array(32);
			for (let i = 0; i < 64; i += 2) {
				bytes[i / 2] = parseInt(txId.substr(i, 2), 16);
			}
			// Convert bytes to base32 using algosdk
			return algosdk.encodeAddress(bytes);
		} catch (error) {
			console.warn('Failed to convert hex transaction ID to base32:', error);
			return txId;
		}
	}
	
	// Check if it's hex-encoded ASCII (longer hex string representing ASCII chars of base32)
	// This is how the database stores them - hex encoding of the base32 string
	if (txId.length > 60 && /^[0-9a-fA-F]+$/.test(txId)) {
		try {
			// Convert hex string to bytes (each pair of hex chars = one byte)
			const bytes = [];
			for (let i = 0; i < txId.length; i += 2) {
				bytes.push(parseInt(txId.substr(i, 2), 16));
			}
			// Convert bytes to ASCII string (which is the base32 transaction ID)
			const base32TxId = String.fromCharCode.apply(null, bytes);
			// Validate it's actually base32
			if (/^[A-Z2-7]{52}$/.test(base32TxId)) {
				return base32TxId;
			}
		} catch (error) {
			console.warn('Failed to convert hex-encoded ASCII transaction ID:', error);
		}
	}
	
	// If we can't convert it, return as-is and let the indexer handle it
	// (might fail, but at least we tried)
	return txId;
}

