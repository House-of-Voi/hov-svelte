import { browser } from '$app/environment';
import { PUBLIC_CDP_PROJECT_ID } from '$env/static/public';
import type { User as CdpUser, OAuth2ProviderType } from '@coinbase/cdp-core';

type CdpCoreModule = typeof import('@coinbase/cdp-core');

// Re-export types for use in components
export type { CdpUser, OAuth2ProviderType };

let cdpModule: CdpCoreModule | null = null;
let initializePromise: Promise<void> | null = null;

const defaultConfig = PUBLIC_CDP_PROJECT_ID
  ? {
      projectId: PUBLIC_CDP_PROJECT_ID,
      debugging: import.meta.env.DEV,
      ethereum: {
        createOnLogin: 'smart' as const,
        enableSpendPermissions: true,
      },
      solana: {
        createOnLogin: false,
      },
    }
  : null;

async function importCdpCore(): Promise<CdpCoreModule> {
  if (!browser) {
    throw new Error('CDP core is only available in the browser environment');
  }

  if (!cdpModule) {
    cdpModule = await import('@coinbase/cdp-core');
  }

  return cdpModule;
}

export async function getInitializedCdp(): Promise<CdpCoreModule> {
  const module = await importCdpCore();

  if (!initializePromise) {
    if (!defaultConfig) {
      throw new Error('CDP project ID is not configured');
    }

    initializePromise = module.initialize(defaultConfig).catch((error) => {
      initializePromise = null;
      throw error;
    });
  }

  await initializePromise;
  return module;
}

export async function signOutCdpSession(): Promise<void> {
  try {
    const module = await getInitializedCdp();
    await module.signOut();
    cdpModule = null;
    initializePromise = null;
  } catch (error) {
    console.warn('CDP sign-out failed:', error);
  }
}

// ============================================================================
// Headless Auth API - Programmatic wallet access without CDP UI
// ============================================================================

export interface SendOtpResult {
  flowId: string;
  message: string;
}

export interface VerifyOtpResult {
  user: CdpUser;
  isNewUser: boolean;
}

/**
 * Send OTP to an email address for CDP wallet access
 */
export async function sendEmailOtp(email: string): Promise<SendOtpResult> {
  const cdp = await getInitializedCdp();
  return cdp.signInWithEmail({ email });
}

/**
 * Verify the email OTP code
 */
export async function verifyEmailOtp(
  flowId: string,
  otp: string
): Promise<VerifyOtpResult> {
  const cdp = await getInitializedCdp();
  const result = await cdp.verifyEmailOTP({ flowId, otp });
  return { user: result.user, isNewUser: result.isNewUser };
}

/**
 * Send OTP to a phone number for CDP wallet access
 */
export async function sendSmsOtp(phoneNumber: string): Promise<SendOtpResult> {
  const cdp = await getInitializedCdp();
  return cdp.signInWithSms({ phoneNumber });
}

/**
 * Verify the SMS OTP code
 */
export async function verifySmsOtp(
  flowId: string,
  otp: string
): Promise<VerifyOtpResult> {
  const cdp = await getInitializedCdp();
  const result = await cdp.verifySmsOTP({ flowId, otp });
  return { user: result.user, isNewUser: result.isNewUser };
}

/**
 * Initiate OAuth sign-in (opens popup)
 */
export async function signInWithOAuth(
  providerType: OAuth2ProviderType
): Promise<void> {
  const cdp = await getInitializedCdp();
  return cdp.signInWithOAuth(providerType);
}

/**
 * Subscribe to OAuth state changes
 */
export async function onOAuthStateChange(
  callback: (state: { status?: string; flowId?: string; code?: string; error?: string } | null) => void
): Promise<void> {
  const cdp = await getInitializedCdp();
  cdp.onOAuthStateChange(callback);
}

/**
 * Verify OAuth after callback
 */
export async function verifyOAuth(
  flowId: string,
  code: string,
  providerType: OAuth2ProviderType
): Promise<VerifyOtpResult> {
  const cdp = await getInitializedCdp();
  const result = await cdp.verifyOAuth({ flowId, code, providerType });
  return { user: result.user, isNewUser: result.isNewUser };
}

/**
 * Export EVM private key from a CDP wallet
 */
export async function exportEvmPrivateKey(
  evmAccount: `0x${string}`
): Promise<string> {
  const cdp = await getInitializedCdp();
  const { privateKey } = await cdp.exportEvmAccount({ evmAccount });
  return privateKey;
}

/**
 * Get the current CDP user (if signed in)
 */
export async function getCurrentCdpUser(): Promise<CdpUser | null> {
  const cdp = await getInitializedCdp();
  return cdp.getCurrentUser();
}

/**
 * Check if user is signed in to CDP
 */
export async function isCdpSignedIn(): Promise<boolean> {
  const cdp = await getInitializedCdp();
  return cdp.isSignedIn();
}

/**
 * Ensures CDP is signed out before starting a new auth flow.
 * CDP doesn't allow signing into a new account if already signed in.
 * Call this before sending OTP or starting OAuth.
 */
export async function ensureCdpSignedOut(): Promise<void> {
  try {
    const cdp = await getInitializedCdp();
    const isSignedIn = await cdp.isSignedIn();
    if (isSignedIn) {
      await cdp.signOut();
    }
  } catch (error) {
    // Ignore errors - we're just trying to clean up any stale session
    console.warn('CDP sign-out check failed:', error);
  }
}
