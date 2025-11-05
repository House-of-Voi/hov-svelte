/**
 * Client-safe referral utility functions
 * These can be safely used in browser code without importing server-only dependencies
 */

/**
 * Format referral link URL
 */
export function formatReferralLink(code: string): string {
  if (typeof window === 'undefined') {
    // Server-side: use environment variable or default
    // Note: This function is primarily for client-side use
    // For server-side, pass the base URL explicitly
    return `/r/${code.toUpperCase()}`;
  }
  // Client-side: use current origin
  return `${window.location.origin}/r/${code.toUpperCase()}`;
}

