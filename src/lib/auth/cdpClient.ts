import { browser } from '$app/environment';
import { PUBLIC_CDP_PROJECT_ID } from '$env/static/public';

type CdpCoreModule = typeof import('@coinbase/cdp-core');

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
