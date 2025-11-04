/**
 * Bet Key Utilities
 *
 * Utilities for encoding/decoding and validating bet keys.
 * Bet keys are 56 bytes (112 hex characters) in format:
 * Address(32 bytes) + Amount(8 bytes) + MaxPaylineIndex(8 bytes) + Index(8 bytes)
 */

/**
 * Convert hex string to Uint8Array
 */
export function hexToUint8Array(hex: string): Uint8Array {
	if (hex.length % 2 !== 0) {
		throw new Error('Invalid hex string length');
	}

	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
	}

	return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
export function uint8ArrayToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Parse bet key from hex string to Uint8Array
 */
export function parseBetKey(betKeyHex: string): Uint8Array {
	// Validate format
	if (!betKeyHex || betKeyHex.length !== 112) {
		throw new Error(`Invalid bet key format: expected 112 hex chars, got ${betKeyHex?.length || 0}`);
	}

	if (!/^[0-9a-fA-F]+$/.test(betKeyHex)) {
		throw new Error('Bet key contains non-hex characters');
	}

	return hexToUint8Array(betKeyHex);
}

/**
 * Encode bet key from Uint8Array to hex string
 */
export function encodeBetKey(betKeyBytes: Uint8Array): string {
	if (betKeyBytes.length !== 56) {
		throw new Error(`Invalid bet key length: expected 56 bytes, got ${betKeyBytes.length}`);
	}

	return uint8ArrayToHex(betKeyBytes);
}

/**
 * Validate bet key format
 */
export function isValidBetKey(betKeyHex: string): boolean {
	try {
		parseBetKey(betKeyHex);
		return true;
	} catch {
		return false;
	}
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes;
}

/**
 * Convert Uint8Array to base64 string
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

/**
 * Extract address from bet key
 */
export function extractAddressFromBetKey(betKeyHex: string): string {
	const betKeyBytes = parseBetKey(betKeyHex);
	const addressBytes = betKeyBytes.slice(0, 32);
	// Convert to Algorand address format if needed
	// For now, return as hex
	return uint8ArrayToHex(addressBytes);
}

/**
 * Extract bet amount from bet key
 */
export function extractBetAmountFromBetKey(betKeyHex: string): bigint {
	const betKeyBytes = parseBetKey(betKeyHex);
	const amountBytes = betKeyBytes.slice(32, 40);

	// Convert 8 bytes to bigint (big-endian)
	let amount = 0n;
	for (let i = 0; i < 8; i++) {
		amount = (amount << 8n) | BigInt(amountBytes[i]);
	}

	return amount;
}

/**
 * Extract max payline index from bet key
 */
export function extractMaxPaylineIndexFromBetKey(betKeyHex: string): number {
	const betKeyBytes = parseBetKey(betKeyHex);
	const maxPaylineBytes = betKeyBytes.slice(40, 48);

	// Convert 8 bytes to number (big-endian)
	let maxPaylineIndex = 0;
	for (let i = 0; i < 8; i++) {
		maxPaylineIndex = (maxPaylineIndex << 8) | maxPaylineBytes[i];
	}

	return maxPaylineIndex;
}

/**
 * Extract player index from bet key
 */
export function extractPlayerIndexFromBetKey(betKeyHex: string): number {
	const betKeyBytes = parseBetKey(betKeyHex);
	const indexBytes = betKeyBytes.slice(48, 56);

	// Convert 8 bytes to number (big-endian)
	let index = 0;
	for (let i = 0; i < 8; i++) {
		index = (index << 8) | indexBytes[i];
	}

	return index;
}
