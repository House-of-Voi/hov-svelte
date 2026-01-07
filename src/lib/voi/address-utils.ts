/**
 * Voi/Algorand address utilities
 */

import algosdk from 'algosdk';

/**
 * Validate if a string is a valid Algorand/Voi address
 *
 * @param address - The address string to validate
 * @returns true if the address is valid, false otherwise
 */
export function isValidAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }

  try {
    return algosdk.isValidAddress(address);
  } catch {
    return false;
  }
}

/**
 * Format an address for display (truncate middle)
 *
 * @param address - The full address
 * @param startChars - Number of characters to show at start (default: 6)
 * @param endChars - Number of characters to show at end (default: 4)
 * @returns Truncated address like "ABC123...XYZ9"
 */
export function truncateAddress(
  address: string,
  startChars: number = 6,
  endChars: number = 4
): string {
  if (!address || address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}
