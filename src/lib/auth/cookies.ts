import type { Cookies } from '@sveltejs/kit';

export const SESSION_COOKIE = 'hov_sess';
export const VOI_ADDRESS_COOKIE = 'hov_voi_addr';

export function setSessionCookie(cookies: Cookies, token: string, maxAgeSeconds: number) {
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie(cookies: Cookies) {
  cookies.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' });
}

export function getSessionCookie(cookies: Cookies): string | undefined {
  return cookies.get(SESSION_COOKIE);
}

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
    secure: true,
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
