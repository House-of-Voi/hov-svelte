import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';

// Note: Session cookies are now managed by Supabase Auth automatically
// We only need to manage app-specific cookies

export const VOI_ADDRESS_COOKIE = 'hov_voi_addr';
export const KEY_DERIVATION_COOKIE = 'hov_key_derivation'; // Non-httpOnly cookie for key storage encryption

/**
 * Stores the CDP-derived Voi address in an HTTP-only cookie
 * This is set client-side after deriving the address from the CDP private key
 */
export function setVoiAddressCookie(
  cookies: Cookies,
  voiAddress: string,
  maxAgeSeconds: number = 3600 // 1 hour default
) {
  const payload = JSON.stringify({
    address: voiAddress,
    derivedAt: Date.now(),
  });
  cookies.set(VOI_ADDRESS_COOKIE, payload, {
    httpOnly: true,
    secure: !dev, // Only require HTTPS in production
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

/**
 * Clears the Voi address cookie
 */
export function clearVoiAddressCookie(cookies: Cookies) {
  cookies.set(VOI_ADDRESS_COOKIE, '', { maxAge: 0, path: '/' });
}

/**
 * Gets the CDP-derived Voi address from the cookie
 */
export function getVoiAddressFromCookie(cookies: Cookies): {
  address: string;
  derivedAt: number;
} | null {
  const cookieValue = cookies.get(VOI_ADDRESS_COOKIE);
  if (!cookieValue) return null;

  try {
    const parsed = JSON.parse(cookieValue);
    if (parsed.address && typeof parsed.derivedAt === 'number') {
      return {
        address: parsed.address,
        derivedAt: parsed.derivedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Sets a key derivation cookie (non-httpOnly) for client-side key encryption
 * This cookie contains a hash/derivation value that can be read by JavaScript
 * to encrypt/decrypt stored keys. It should be set when the session is created.
 *
 * @param cookies - SvelteKit cookies object
 * @param derivationValue - The value to use for key derivation (typically a hash of the session token)
 * @param maxAgeSeconds - Cookie expiration time in seconds (should match session cookie)
 */
export function setKeyDerivationCookie(
  cookies: Cookies,
  derivationValue: string,
  maxAgeSeconds: number
): void {
  cookies.set(KEY_DERIVATION_COOKIE, derivationValue, {
    httpOnly: false, // Must be readable by JavaScript for key encryption
    secure: !dev, // Only require HTTPS in production
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

/**
 * Clears the key derivation cookie
 */
export function clearKeyDerivationCookie(cookies: Cookies): void {
  cookies.set(KEY_DERIVATION_COOKIE, '', { maxAge: 0, path: '/' });
}

/**
 * Gets the key derivation value from cookies (server-side)
 */
export function getKeyDerivationCookie(cookies: Cookies): string | undefined {
  return cookies.get(KEY_DERIVATION_COOKIE);
}
