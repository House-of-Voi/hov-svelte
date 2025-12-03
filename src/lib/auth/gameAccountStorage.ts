/**
 * Game Account Key Storage Module
 *
 * Stores private keys for multiple game accounts (CDP wallets) encrypted in browser localStorage.
 * Keys are encrypted using Web Crypto API with a key derived from a session-derived value.
 * Keys are never sent to the server.
 *
 * This module supports multiple game accounts per user, each identified by their Voi address.
 */

import { browser } from '$app/environment';

const STORAGE_KEY = 'hov_game_account_keys';
const KEY_DERIVATION_COOKIE = 'hov_key_derivation';
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM

/**
 * Gets the key derivation value from a non-httpOnly cookie
 */
function getKeyDerivationValue(): string | null {
  if (!browser) return null;

  const value = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${KEY_DERIVATION_COOKIE}=`))
    ?.split('=')[1];

  return value ?? null;
}

/**
 * Derives an encryption key from the key derivation cookie
 */
async function deriveEncryptionKey(derivationValue: string): Promise<CryptoKey> {
  if (!browser) {
    throw new Error('Key storage is only available in the browser');
  }

  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(derivationValue);

  const baseKey = await crypto.subtle.importKey('raw', keyMaterial, { name: 'PBKDF2' }, false, [
    'deriveKey',
  ]);

  // Use a different salt than the original keyStorage to keep them separate
  const salt = encoder.encode('house-of-voi-game-account-keys');
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

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, dataBytes);

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts data using AES-GCM
 */
async function decryptData(encryptedData: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const encrypted = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, encrypted);

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Keys for a single game account
 */
export interface GameAccountKeys {
  basePrivateKey: string; // EVM private key
  voiPrivateKey: string; // Algorand private key (derived from Base)
  baseAddress: string; // Base wallet address
  voiAddress: string; // Voi wallet address
  storedAt: number; // Timestamp when keys were stored
}

/**
 * Storage structure: map of Voi address -> encrypted keys
 */
interface StoredGameAccounts {
  [voiAddress: string]: string; // Encrypted GameAccountKeys JSON
}

/**
 * Gets all stored game accounts from localStorage (encrypted form)
 */
function getStoredAccounts(): StoredGameAccounts {
  if (!browser) return {};

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return {};

  try {
    return JSON.parse(stored) as StoredGameAccounts;
  } catch {
    return {};
  }
}

/**
 * Saves the game accounts storage to localStorage
 */
function saveStoredAccounts(accounts: StoredGameAccounts): void {
  if (!browser) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

/**
 * Stores keys for a game account
 *
 * @param keys - The game account keys to store
 * @throws Error if session cookie is missing or encryption fails
 */
export async function storeGameAccountKeys(keys: GameAccountKeys): Promise<void> {
  if (!browser) {
    throw new Error('Key storage is only available in the browser');
  }

  const derivationValue = getKeyDerivationValue();
  if (!derivationValue) {
    throw new Error('Key derivation cookie not found. Cannot store keys without a valid session.');
  }

  // Add timestamp if not present
  const keysWithTimestamp: GameAccountKeys = {
    ...keys,
    storedAt: keys.storedAt || Date.now(),
  };

  // Serialize to JSON
  const keysJson = JSON.stringify(keysWithTimestamp);

  // Derive encryption key
  const encryptionKey = await deriveEncryptionKey(derivationValue);

  // Encrypt the keys
  const encrypted = await encryptData(keysJson, encryptionKey);

  // Get existing accounts and add/update this one
  const accounts = getStoredAccounts();
  accounts[keys.voiAddress] = encrypted;

  // Save back to localStorage
  saveStoredAccounts(accounts);
}

/**
 * Retrieves and decrypts the keys for a specific game account
 *
 * @param voiAddress - The Voi address of the game account
 * @returns The decrypted keys, or null if not found or decryption fails
 */
export async function getGameAccountKeys(voiAddress: string): Promise<GameAccountKeys | null> {
  if (!browser) return null;

  const accounts = getStoredAccounts();
  const encrypted = accounts[voiAddress];

  if (!encrypted) return null;

  const derivationValue = getKeyDerivationValue();
  if (!derivationValue) {
    console.warn('Key derivation cookie not found. Cannot decrypt stored keys.');
    return null;
  }

  try {
    const decryptionKey = await deriveEncryptionKey(derivationValue);
    const decryptedJson = await decryptData(encrypted, decryptionKey);
    const keys = JSON.parse(decryptedJson) as GameAccountKeys;

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
    console.error('Failed to decrypt game account keys:', error);
    return null;
  }
}

/**
 * Checks if keys exist for a specific game account
 *
 * @param voiAddress - The Voi address of the game account
 * @returns true if encrypted keys exist (doesn't verify decryption)
 */
export function hasGameAccountKeys(voiAddress: string): boolean {
  if (!browser) return false;

  const accounts = getStoredAccounts();
  return voiAddress in accounts;
}

/**
 * Gets all Voi addresses that have stored keys
 *
 * @returns Array of Voi addresses with stored keys
 */
export function getStoredGameAccountAddresses(): string[] {
  if (!browser) return [];

  const accounts = getStoredAccounts();
  return Object.keys(accounts);
}

/**
 * Removes keys for a specific game account
 *
 * @param voiAddress - The Voi address of the game account to remove
 */
export function removeGameAccountKeys(voiAddress: string): void {
  if (!browser) return;

  const accounts = getStoredAccounts();
  delete accounts[voiAddress];
  saveStoredAccounts(accounts);
}

/**
 * Clears all game account keys from localStorage
 * Should be called on logout
 */
export function clearAllGameAccountKeys(): void {
  if (!browser) return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Checks if the user can decrypt their keys (has valid session)
 *
 * @returns true if the key derivation cookie exists
 */
export function canDecryptKeys(): boolean {
  if (!browser) return false;
  return getKeyDerivationValue() !== null;
}

/**
 * Gets the count of stored game accounts
 *
 * @returns Number of game accounts with stored keys
 */
export function getStoredGameAccountCount(): number {
  if (!browser) return 0;

  const accounts = getStoredAccounts();
  return Object.keys(accounts).length;
}

/**
 * Checks if a game account is "unlocked" (keys available and decryptable)
 *
 * @param voiAddress - The Voi address of the game account
 * @returns true if keys exist and can be decrypted
 */
export async function isGameAccountUnlocked(voiAddress: string): Promise<boolean> {
  const keys = await getGameAccountKeys(voiAddress);
  return keys !== null;
}

/**
 * Gets all unlocked game accounts (keys that can be decrypted)
 *
 * @returns Array of GameAccountKeys for all unlocked accounts
 */
export async function getAllUnlockedGameAccounts(): Promise<GameAccountKeys[]> {
  if (!browser) return [];

  const addresses = getStoredGameAccountAddresses();
  const unlocked: GameAccountKeys[] = [];

  for (const address of addresses) {
    const keys = await getGameAccountKeys(address);
    if (keys) {
      unlocked.push(keys);
    }
  }

  return unlocked;
}

/**
 * Gets the first stored Voi address (convenience function for fallback usage)
 *
 * @returns The first Voi address with stored keys, or null if none exist
 */
export function getFirstStoredVoiAddress(): string | null {
  const addresses = getStoredGameAccountAddresses();
  return addresses[0] ?? null;
}
