/**
 * Voi Wallet Balance Utilities
 *
 * Fetches balances for whitelisted assets from tokens table, Mimir API, and Algod.
 * Now uses tokenService for dynamic token whitelist from database.
 */

import { tokenService, type TokenWithBalance } from '$lib/services/tokenService';

// Legacy constants for backward compatibility
// These are kept for any code that directly references them
export const AUSDC_CONTRACT_ID = 302190;
export const UNIT_CONTRACT_ID = 420069;

// Mimir API endpoint
const MIMIR_API_BASE = 'https://voi-mainnet-mimirapi.nftnavigator.xyz';

// Algod endpoint for native VOI balance
const ALGOD_API_BASE = 'https://mainnet-api.voi.nodely.dev';

export interface AssetBalance {
	symbol: string;
	name: string;
	balance: string;
	decimals: number;
	usdValue: string;
	contractId?: number; // undefined for native VOI
	imageUrl?: string;
}

export interface MimirAssetBalance {
	name: string;
	symbol: string;
	balance: string;
	decimals: number;
	imageUrl?: string;
	usdValue: string;
	verified: number;
	accountId: string;
	assetType: string;
	contractId: number;
}

export interface MimirResponse {
	balances: MimirAssetBalance[];
}

export interface AlgodAccountInfo {
	amount: number; // in microVOI
	[key: string]: unknown;
}

/**
 * Fetch ARC-200 token balances from Mimir API
 * @deprecated Use tokenService.getBalancesForAddress() instead for dynamic token support
 */
export async function fetchMimirBalances(address: string): Promise<AssetBalance[]> {
	try {
		const response = await fetch(`${MIMIR_API_BASE}/account/assets?accountId=${address}`, {
			cache: 'no-store',
		});

		if (!response.ok) {
			throw new Error(`Mimir API error: ${response.status}`);
		}

		const data: MimirResponse = await response.json();

		// Legacy: Use hardcoded whitelist for backward compatibility
		const whitelistedContracts = [AUSDC_CONTRACT_ID, UNIT_CONTRACT_ID];

		return data.balances
			.filter((asset) => whitelistedContracts.includes(asset.contractId))
			.map((asset) => ({
				symbol: asset.symbol,
				name: asset.name,
				balance: asset.balance,
				decimals: asset.decimals,
				usdValue: asset.usdValue,
				contractId: asset.contractId,
				imageUrl: asset.imageUrl,
			}));
	} catch (error) {
		console.error('Failed to fetch Mimir balances:', error);
		return [];
	}
}

/**
 * Fetch native VOI balance from Algod
 */
export async function fetchVoiBalance(address: string): Promise<AssetBalance | null> {
	try {
		const response = await fetch(`${ALGOD_API_BASE}/v2/accounts/${address}`, {
			cache: 'no-store',
		});

		if (!response.ok) {
			throw new Error(`Algod API error: ${response.status}`);
		}

		const data: AlgodAccountInfo = await response.json();

		// Native VOI has 6 decimals (microVOI)
		return {
			symbol: 'VOI',
			name: 'Voi',
			balance: data.amount.toString(),
			decimals: 6,
			usdValue: '0', // No USD pricing available for native VOI from algod
			contractId: undefined,
		};
	} catch (error) {
		console.error('Failed to fetch VOI balance:', error);
		return null;
	}
}

export interface WalletBalances {
	usdc: AssetBalance | null;
	otherTokens: AssetBalance[];
}

/**
 * Convert TokenWithBalance to AssetBalance for backward compatibility
 */
function tokenToAssetBalance(token: TokenWithBalance): AssetBalance {
	return {
		symbol: token.display_symbol || token.symbol,
		name: token.display_name || token.name,
		balance: token.balance,
		decimals: token.decimals,
		usdValue: token.usd_value || '0',
		contractId: token.contract_id ?? undefined,
		imageUrl: token.icon_url ?? undefined,
	};
}

/**
 * Fetch all displayable balances for an address
 * Uses tokenService to fetch tokens from database, providing dynamic token support.
 * Returns USDC separately as primary currency, with other tokens in array
 */
export async function fetchAllBalances(address: string): Promise<WalletBalances> {
	try {
		// Use tokenService to get balances for all displayable tokens
		const tokenBalances = await tokenService.getBalancesForAddress(address, 'voi');

		// Find USDC (aUSDC with display_symbol='USDC' or contract_id 302190)
		const usdcToken = tokenBalances.find(
			(t) =>
				t.display_symbol === 'USDC' ||
				t.symbol === 'aUSDC' ||
				t.contract_id === AUSDC_CONTRACT_ID
		);

		const usdc = usdcToken ? tokenToAssetBalance(usdcToken) : null;

		// Other tokens: everything except aUSDC, ordered by symbol
		const otherTokens: AssetBalance[] = tokenBalances
			.filter((t) => t.contract_id !== AUSDC_CONTRACT_ID)
			.map(tokenToAssetBalance);

		return {
			usdc,
			otherTokens,
		};
	} catch (error) {
		console.error('Failed to fetch balances via tokenService, falling back to legacy:', error);

		// Fallback to legacy hardcoded behavior
		const [mimirBalances, voiBalance] = await Promise.all([
			fetchMimirBalances(address),
			fetchVoiBalance(address),
		]);

		// Get USDC (aUSDC renamed)
		const ausdc = mimirBalances.find((b) => b.contractId === AUSDC_CONTRACT_ID);
		const usdc = ausdc
			? {
					...ausdc,
					symbol: 'USDC',
					name: 'USDC',
				}
			: null;

		// Create ordered list of other tokens: VOI, UNIT
		const otherTokens: AssetBalance[] = [];

		// Add VOI
		if (voiBalance) otherTokens.push(voiBalance);

		// Add UNIT
		const unit = mimirBalances.find((b) => b.contractId === UNIT_CONTRACT_ID);
		if (unit) otherTokens.push(unit);

		return {
			usdc,
			otherTokens,
		};
	}
}

/**
 * Fetch balances for game-enabled tokens only
 * Useful for game betting token selection
 */
export async function fetchGameEnabledBalances(address: string): Promise<AssetBalance[]> {
	try {
		const gameTokens = await tokenService.getGameEnabledTokens('voi');

		// Build a map of game-enabled contract IDs
		const gameContractIds = new Set(gameTokens.map((t) => t.contract_id));

		// Fetch all balances
		const allBalances = await tokenService.getBalancesForAddress(address, 'voi');

		// Filter to game-enabled tokens
		return allBalances
			.filter((t) => t.token_standard === 'native' || gameContractIds.has(t.contract_id))
			.filter((t) => t.is_game_enabled)
			.map(tokenToAssetBalance);
	} catch (error) {
		console.error('Failed to fetch game-enabled balances:', error);
		// Return VOI only as fallback
		const voiBalance = await fetchVoiBalance(address);
		return voiBalance ? [voiBalance] : [];
	}
}

/**
 * Fetch balance for a specific token by contract ID
 */
export async function fetchTokenBalance(
	address: string,
	contractId: number | null
): Promise<AssetBalance | null> {
	try {
		if (contractId === null) {
			// Native VOI
			return fetchVoiBalance(address);
		}

		const token = await tokenService.getTokenByContractId('voi', contractId);
		if (!token) {
			console.warn(`Token with contract ID ${contractId} not found in registry`);
			return null;
		}

		// Fetch balance for this specific token
		const balances = await tokenService.getBalancesForAddress(address, 'voi');
		const tokenBalance = balances.find((t) => t.contract_id === contractId);

		return tokenBalance ? tokenToAssetBalance(tokenBalance) : null;
	} catch (error) {
		console.error(`Failed to fetch balance for token ${contractId}:`, error);
		return null;
	}
}

/**
 * Format balance with decimals
 */
export function formatBalance(balance: string, decimals: number): string {
	try {
		const num = BigInt(balance);
		const divisor = BigInt(10 ** decimals);

		const wholePart = num / divisor;
		const fractionalPart = num % divisor;

		// Convert fractional part to string with leading zeros
		const fractionalStr = fractionalPart.toString().padStart(decimals, '0');

		// Trim trailing zeros but keep at least 2 decimal places
		let trimmed = fractionalStr.replace(/0+$/, '');
		if (trimmed.length < 2) {
			trimmed = fractionalStr.substring(0, 2);
		}

		return `${wholePart}.${trimmed}`;
	} catch {
		return '0.00';
	}
}

/**
 * Format USD value
 */
export function formatUsdValue(usdValue: string): string {
	const num = parseFloat(usdValue);

	if (num === 0) return '$0.00';
	if (num < 0.01) return '<$0.01';

	return `$${num.toFixed(2)}`;
}

// Re-export tokenService for convenience
export { tokenService };
