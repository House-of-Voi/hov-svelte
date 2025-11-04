import type { Cookies } from '@sveltejs/kit';

export const SESSION_COOKIE = 'hov_sess';

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
