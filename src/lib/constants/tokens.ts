/**
 * Token Constants
 *
 * Shared constants for token IDs and configuration.
 * All token-related constants should be defined here to avoid duplication.
 */

// USDC (aUSDC) - The primary stablecoin on Voi
export const AUSDC_ASSET_ID = 302190;
export const AUSDC_DECIMALS = 6;

// Native VOI token
export const VOI_DECIMALS = 6;

// Swap configuration
export const SWAP_SLIPPAGE_TOLERANCE = 0.01; // 1% default slippage
export const SWAP_CONFIRMATION_ROUNDS = 4; // ~4 seconds on Voi network

// Balance refresh configuration
export const BALANCE_REFRESH_DELAY_MS = 4000;
export const BALANCE_REFRESH_MAX_ATTEMPTS = 5;
export const BALANCE_REFRESH_CHECK_DELAY_MS = 1000;

// Quote debounce
export const QUOTE_DEBOUNCE_MS = 500;

// Account preparation
export const ACCOUNT_PREP_CONFIRMATION_ROUNDS = 10;
export const ACCOUNT_PREP_VERIFY_TIMEOUT_MS = 15000;
export const ACCOUNT_PREP_VERIFY_INTERVAL_MS = 1000;

// Fountain (faucet)
export const FOUNTAIN_MAX_ATTEMPTS = 20;
export const FOUNTAIN_POLL_INTERVAL_MS = 1000;
