/**
 * Session Recovery Module
 * 
 * Handles recovery of stored keys when they are missing or session is invalid.
 * Falls back to CDP if keys are missing and CDP session is available.
 */

import { browser } from '$app/environment';
import { getInitializedCdp } from '$lib/auth/cdpClient';
import { storeKeys, hasKeys, getKeys } from '$lib/auth/keyStorage';
import { deriveAlgorandAccountFromEVM } from '$lib/chains/algorand-derive';
import { goto } from '$app/navigation';

/**
 * Attempts to recover stored keys from CDP if they are missing
 * 
 * @returns true if recovery successful, false otherwise
 */
export async function recoverKeysFromCdp(): Promise<boolean> {
	if (!browser) {
		return false;
	}

	// If keys already exist, no recovery needed
	if (hasKeys()) {
		const keys = await getKeys();
		if (keys) {
			console.log('✅ Keys already stored, no recovery needed');
			return true;
		}
	}

	console.log('🔐 Attempting to recover keys from CDP...');

	try {
		// Get CDP SDK
		const cdpSdk = await getInitializedCdp();
		const user = await cdpSdk.getCurrentUser();

		// If no CDP user, recovery is not possible
		if (!user) {
			console.warn('No CDP user found - cannot recover keys');
			return false;
		}

		// Get EVM accounts
		const evmAccounts = user.evmAccounts || [];
		if (evmAccounts.length === 0) {
			console.warn('No EVM accounts found in CDP session');
			return false;
		}

		// Export Base private key from CDP
		let exportedBaseKey: string | null = null;
		let baseWalletAddress: string | null = null;

		for (const candidate of evmAccounts) {
			const formatted = candidate.startsWith('0x')
				? (candidate as `0x${string}`)
				: (`0x${candidate.replace(/^0x/, '')}` as `0x${string}`);

			try {
				const { privateKey } = await cdpSdk.exportEvmAccount({
					evmAccount: formatted,
				});

				if (privateKey) {
					exportedBaseKey = privateKey;
					baseWalletAddress = formatted;
					break;
				}
			} catch (exportError) {
				console.warn('CDP key export failed for candidate', candidate, exportError);
			}
		}

		if (!exportedBaseKey || !baseWalletAddress) {
			console.warn('Failed to export Base private key from CDP');
			return false;
		}

		// Derive Voi private key
		const derivedAccount = deriveAlgorandAccountFromEVM(exportedBaseKey);
		const voiPrivateKey = Array.from(derivedAccount.sk)
			.map(b => b.toString(16).padStart(2, '0'))
			.join('');

		// Get addresses
		const baseAddr = baseWalletAddress.toLowerCase();
		const voiAddr = derivedAccount.addr;

		// Store keys encrypted in browser storage
		await storeKeys(exportedBaseKey, voiPrivateKey, baseAddr, voiAddr);

		// Clear keys from memory immediately
		exportedBaseKey = '';
		derivedAccount.sk.fill(0);

		console.log('✅ Keys recovered and stored successfully');
		return true;
	} catch (error) {
		console.error('Failed to recover keys from CDP:', error);
		return false;
	}
}

/**
 * Checks if stored keys exist and are valid
 * 
 * @returns true if keys exist and can be decrypted, false otherwise
 */
export async function validateStoredKeys(): Promise<boolean> {
	if (!browser) {
		return false;
	}

	if (!hasKeys()) {
		return false;
	}

	try {
		const keys = await getKeys();
		return keys !== null;
	} catch {
		return false;
	}
}

/**
 * Handles session recovery flow:
 * 1. Check if stored keys exist
 * 2. If missing, attempt to recover from CDP
 * 3. If recovery fails, redirect to login
 * 
 * @returns true if keys are available (existing or recovered), false if redirecting to login
 */
export async function handleSessionRecovery(): Promise<boolean> {
	if (!browser) {
		return false;
	}

	// Check if keys exist
	const keysValid = await validateStoredKeys();
	if (keysValid) {
		return true;
	}

	// Attempt recovery from CDP
	const recovered = await recoverKeysFromCdp();
	if (recovered) {
		return true;
	}

	// Recovery failed - redirect to login
	console.warn('Session recovery failed - redirecting to login');
	await goto('/auth?expired=true');
	return false;
}

