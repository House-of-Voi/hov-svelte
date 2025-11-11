/**
 * Secure Key Storage Module
 * 
 * Stores Base (EVM) and Voi (Algorand) private keys encrypted in browser localStorage.
 * Keys are encrypted using Web Crypto API with a key derived from a session-derived value.
 * Keys are never sent to the server.
 */

import { browser } from '$app/environment';

const STORAGE_KEY = 'hov_encrypted_keys';
const KEY_DERIVATION_COOKIE = 'hov_key_derivation'; // Non-httpOnly cookie for key derivation
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM

/**
 * Gets the key derivation value from a non-httpOnly cookie
 * This cookie is set server-side when the session is created
 */
function getKeyDerivationValue(): string | null {
  if (!browser) {
    return null;
  }

  const value = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${KEY_DERIVATION_COOKIE}=`))
    ?.split('=')[1];

  return value ?? null;
}

/**
 * Derives an encryption key from the key derivation cookie
 * This ensures keys can only be decrypted when the user has a valid session
 */
async function deriveEncryptionKey(derivationValue: string): Promise<CryptoKey> {
  if (!browser) {
    throw new Error('Key storage is only available in the browser');
  }

  // Use the derivation value as the key material
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(derivationValue);

  // Import the key material
  const baseKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Derive the encryption key using PBKDF2
  const salt = encoder.encode('house-of-voi-key-derivation'); // Domain-specific salt
  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt']
  );

  return encryptionKey;
}

/**
 * Encrypts data using AES-GCM
 */
async function encryptData(data: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);

  // Generate a random IV for each encryption
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Encrypt the data
  const encrypted = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv,
    },
    key,
    dataBytes
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  // Convert to base64 for storage
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts data using AES-GCM
 */
async function decryptData(encryptedData: string, key: CryptoKey): Promise<string> {
  // Convert from base64
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

  // Extract IV and encrypted data
  const iv = combined.slice(0, IV_LENGTH);
  const encrypted = combined.slice(IV_LENGTH);

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv,
    },
    key,
    encrypted
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Stored keys structure
 */
export interface StoredKeys {
  basePrivateKey: string; // EVM private key
  voiPrivateKey: string; // Algorand private key (derived from Base)
  baseAddress: string; // Base wallet address
  voiAddress: string; // Voi wallet address
  storedAt: number; // Timestamp when keys were stored
}

/**
 * Stores the Base and Voi private keys encrypted in localStorage
 * 
 * @param basePrivateKey - The Base (EVM) private key
 * @param voiPrivateKey - The Voi (Algorand) private key
 * @param baseAddress - The Base wallet address
 * @param voiAddress - The Voi wallet address
 * @throws Error if session cookie is missing or encryption fails
 */
export async function storeKeys(
  basePrivateKey: string,
  voiPrivateKey: string,
  baseAddress: string,
  voiAddress: string
): Promise<void> {
  if (!browser) {
    throw new Error('Key storage is only available in the browser');
  }

  // Get key derivation value from cookie - we need it to derive the encryption key
  const derivationValue = getKeyDerivationValue();

  if (!derivationValue) {
    throw new Error('Key derivation cookie not found. Cannot store keys without a valid session.');
  }

  // Create the keys object
  const keys: StoredKeys = {
    basePrivateKey,
    voiPrivateKey,
    baseAddress,
    voiAddress,
    storedAt: Date.now(),
  };

  // Serialize to JSON
  const keysJson = JSON.stringify(keys);

  // Derive encryption key from derivation value
  const encryptionKey = await deriveEncryptionKey(derivationValue);

  // Encrypt the keys
  const encrypted = await encryptData(keysJson, encryptionKey);

  // Store in localStorage
  try {
    localStorage.setItem(STORAGE_KEY, encrypted);
  } catch (error) {
    throw new Error(`Failed to store keys: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Retrieves and decrypts the stored keys from localStorage
 * 
 * @returns The decrypted keys, or null if keys don't exist or decryption fails
 */
export async function getKeys(): Promise<StoredKeys | null> {
  if (!browser) {
    return null;
  }

  // Get encrypted keys from localStorage
  const encrypted = localStorage.getItem(STORAGE_KEY);
  if (!encrypted) {
    return null;
  }

  // Get key derivation value for decryption
  const derivationValue = getKeyDerivationValue();

  if (!derivationValue) {
    // No derivation value means we can't decrypt - keys are invalid
    console.warn('Key derivation cookie not found. Cannot decrypt stored keys.');
    return null;
  }

  try {
    // Derive decryption key from derivation value
    const decryptionKey = await deriveEncryptionKey(derivationValue);

    // Decrypt the keys
    const decryptedJson = await decryptData(encrypted, decryptionKey);

    // Parse JSON
    const keys = JSON.parse(decryptedJson) as StoredKeys;

    // Validate structure
    if (
      typeof keys.basePrivateKey !== 'string' ||
      typeof keys.voiPrivateKey !== 'string' ||
      typeof keys.baseAddress !== 'string' ||
      typeof keys.voiAddress !== 'string'
    ) {
      console.error('Invalid keys structure in storage');
      return null;
    }

    return keys;
  } catch (error) {
    console.error('Failed to decrypt stored keys:', error);
    // If decryption fails, clear the corrupted data
    clearKeys();
    return null;
  }
}

/**
 * Checks if stored keys exist in localStorage
 * Note: This doesn't verify the keys can be decrypted, just that they exist
 */
export function hasKeys(): boolean {
  if (!browser) {
    return false;
  }
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Clears the stored keys from localStorage
 */
export function clearKeys(): void {
  if (!browser) {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Gets the Base address from stored keys without decrypting the full keys
 * This is a convenience method for checking if we have keys for a specific address
 */
export async function getStoredBaseAddress(): Promise<string | null> {
  const keys = await getKeys();
  return keys?.baseAddress ?? null;
}

/**
 * Gets the Voi address from stored keys without needing to derive it
 */
export async function getStoredVoiAddress(): Promise<string | null> {
  const keys = await getKeys();
  return keys?.voiAddress ?? null;
}

