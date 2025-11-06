/**
 * Voi URI Generation Utilities
 * 
 * Generates voi:// URIs following the Algorand URI scheme specification
 * https://developer.algorand.org/docs/get-details/transactions/payment_prompts/
 */

/**
 * Generate a voi:// URI for payment/transfer
 * 
 * @param address - Voi address (base32 format)
 * @param amountMicroVoi - Optional amount in microVoi (smallest unit, no decimals)
 * @param label - Optional label for the address
 * @returns voi:// URI string
 */
export function generateVoiUri(
  address: string,
  amountMicroVoi?: number,
  label?: string
): string {
  // Validate address format (should be base32, 58 characters)
  if (!address || address.length !== 58) {
    throw new Error('Invalid Voi address: must be 58 characters');
  }

  // Build base URI
  let uri = `voi://${address}`;

  // Build query parameters
  const params: string[] = [];

  // Add amount if provided (must be non-negative integer in microVoi)
  if (amountMicroVoi !== undefined) {
    if (amountMicroVoi < 0 || !Number.isInteger(amountMicroVoi)) {
      throw new Error('Amount must be a non-negative integer (microVoi)');
    }
    params.push(`amount=${amountMicroVoi}`);
  }

  // Add label if provided (URL encode)
  if (label) {
    params.push(`label=${encodeURIComponent(label)}`);
  }

  // Append query string if we have parameters
  if (params.length > 0) {
    uri += `?${params.join('&')}`;
  }

  return uri;
}

