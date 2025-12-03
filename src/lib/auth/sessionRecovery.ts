/**
 * Session Recovery Module
 *
 * Provides utilities to check if game account keys are stored in localStorage.
 * With Supabase Auth, key recovery happens explicitly through the game account
 * unlock flow (CDP OTP or mnemonic re-import), NOT automatically.
 *
 * The auth state is managed by Supabase; this module only handles key storage validation.
 */

import { browser } from '$app/environment';
import { getGameAccountKeys, getStoredGameAccountAddresses } from '$lib/auth/gameAccountStorage';

/**
 * Checks if stored keys exist and are valid
 *
 * @returns true if keys exist and can be decrypted, false otherwise
 */
export async function validateStoredKeys(): Promise<boolean> {
	if (!browser) {
		return false;
	}

	const addresses = getStoredGameAccountAddresses();
	if (addresses.length === 0) {
		return false;
	}

	// Check if at least one account can be decrypted
	for (const addr of addresses) {
		try {
			const keys = await getGameAccountKeys(addr);
			if (keys) return true;
		} catch {
			// Continue checking other accounts
		}
	}
	return false;
}

/**
 * Checks if game account keys are available.
 *
 * With Supabase Auth, there is no automatic key recovery. Users must explicitly
 * unlock their game account through the UI (CDP OTP verification or mnemonic import).
 *
 * This function only validates if keys exist - it does NOT attempt recovery.
 *
 * @returns true if keys are stored and valid, false if user needs to unlock game account
 */
export async function checkGameAccountKeys(): Promise<boolean> {
	if (!browser) {
		return false;
	}

	return validateStoredKeys();
}

/**
 * @deprecated Use checkGameAccountKeys() instead.
 * This is kept for backwards compatibility but no longer attempts CDP recovery.
 */
export async function handleSessionRecovery(): Promise<boolean> {
	return checkGameAccountKeys();
}
