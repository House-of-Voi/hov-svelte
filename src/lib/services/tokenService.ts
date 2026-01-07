/**
 * Token Service
 *
 * Queries the tokens table from Supabase and fetches balances from various sources.
 * Supports native tokens, ARC200, ASA, ERC20, and SPL tokens across chains.
 */

import { supabaseBrowser } from '$lib/db/supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Token,
	TokenWithBalance,
	TokenFilter,
	ChainType,
	TokenStandard,
} from '$lib/types/token';
import { getArc200TokenInfo } from '$lib/voi/arc200';

// Mimir API endpoint for batch ARC200 balance fetching
const MIMIR_API_BASE = 'https://voi-mainnet-mimirapi.nftnavigator.xyz';

// Algod endpoint for native VOI balance
const ALGOD_API_BASE = 'https://mainnet-api.voi.nodely.dev';

interface MimirAssetBalance {
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

interface MimirResponse {
	balances: MimirAssetBalance[];
}

class TokenService {
	private supabase: SupabaseClient;
	private cache: Map<string, Token[]> = new Map();
	private singleCache: Map<string, Token> = new Map();
	private cacheExpiry: Map<string, number> = new Map();
	private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

	constructor(supabaseClient?: SupabaseClient) {
		this.supabase = supabaseClient || supabaseBrowser;
	}

	/**
	 * Get all tokens matching the filter criteria
	 */
	async getTokens(filter: TokenFilter = {}): Promise<Token[]> {
		const cacheKey = `tokens:${JSON.stringify(filter)}`;
		const cached = this.getFromCache(cacheKey);
		if (cached) return cached;

		try {
			let query = this.supabase.from('tokens').select('*');

			if (filter.chain) {
				query = query.eq('chain', filter.chain);
			}
			if (filter.token_standard) {
				query = query.eq('token_standard', filter.token_standard);
			}
			if (filter.is_active !== undefined) {
				query = query.eq('is_active', filter.is_active);
			}
			if (filter.is_displayable !== undefined) {
				query = query.eq('is_displayable', filter.is_displayable);
			}
			if (filter.is_game_enabled !== undefined) {
				query = query.eq('is_game_enabled', filter.is_game_enabled);
			}
			if (filter.is_treasury_enabled !== undefined) {
				query = query.eq('is_treasury_enabled', filter.is_treasury_enabled);
			}

			const { data, error } = await query.order('symbol');

			if (error) {
				console.error('Error fetching tokens:', error);
				return [];
			}

			this.setCache(cacheKey, data || []);
			return data || [];
		} catch (error) {
			console.error('Failed to fetch tokens:', error);
			return [];
		}
	}

	/**
	 * Get all displayable tokens for a chain
	 */
	async getDisplayableTokens(chain: ChainType = 'voi'): Promise<Token[]> {
		return this.getTokens({
			chain,
			is_active: true,
			is_displayable: true,
		});
	}

	/**
	 * Get all game-enabled tokens for a chain
	 */
	async getGameEnabledTokens(chain: ChainType = 'voi'): Promise<Token[]> {
		return this.getTokens({
			chain,
			is_active: true,
			is_game_enabled: true,
		});
	}

	/**
	 * Get all treasury-enabled tokens for a chain
	 */
	async getTreasuryEnabledTokens(chain: ChainType = 'voi'): Promise<Token[]> {
		return this.getTokens({
			chain,
			is_active: true,
			is_treasury_enabled: true,
		});
	}

	/**
	 * Get token by database ID
	 */
	async getTokenById(id: string): Promise<Token | null> {
		const cacheKey = `token:id:${id}`;
		const cached = this.singleCache.get(cacheKey);
		const expiry = this.cacheExpiry.get(cacheKey);

		if (cached && expiry && Date.now() < expiry) {
			return cached;
		}

		try {
			const { data, error } = await this.supabase
				.from('tokens')
				.select('*')
				.eq('id', id)
				.single();

			if (error) {
				if (error.code === 'PGRST116') return null;
				console.error('Error fetching token by ID:', error);
				return null;
			}

			if (data) {
				this.singleCache.set(cacheKey, data);
				this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);
			}

			return data;
		} catch (error) {
			console.error('Failed to fetch token by ID:', error);
			return null;
		}
	}

	/**
	 * Get token by chain and contract ID
	 */
	async getTokenByContractId(
		chain: ChainType,
		contractId: number | null
	): Promise<Token | null> {
		const cacheKey = `token:contract:${chain}:${contractId}`;
		const cached = this.singleCache.get(cacheKey);
		const expiry = this.cacheExpiry.get(cacheKey);

		if (cached && expiry && Date.now() < expiry) {
			return cached;
		}

		try {
			let query = this.supabase.from('tokens').select('*').eq('chain', chain);

			if (contractId === null) {
				query = query.is('contract_id', null);
			} else {
				query = query.eq('contract_id', contractId);
			}

			const { data, error } = await query.single();

			if (error) {
				if (error.code === 'PGRST116') return null;
				console.error('Error fetching token by contract ID:', error);
				return null;
			}

			if (data) {
				this.singleCache.set(cacheKey, data);
				this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);
			}

			return data;
		} catch (error) {
			console.error('Failed to fetch token by contract ID:', error);
			return null;
		}
	}

	/**
	 * Get native token for a chain
	 */
	async getNativeToken(chain: ChainType): Promise<Token | null> {
		return this.getTokenByContractId(chain, null);
	}

	/**
	 * Fetch balances for all displayable tokens for an address
	 */
	async getBalancesForAddress(
		address: string,
		chain: ChainType = 'voi'
	): Promise<TokenWithBalance[]> {
		const tokens = await this.getDisplayableTokens(chain);

		if (tokens.length === 0) {
			return [];
		}

		// For Voi chain, fetch balances from various sources
		if (chain === 'voi') {
			return this.getVoiBalances(address, tokens);
		}

		// Future: Handle other chains
		return tokens.map((token) => ({
			...token,
			balance: '0',
			formatted_balance: '0.00',
			usd_value: null,
		}));
	}

	/**
	 * Fetch Voi chain balances for an address
	 */
	private async getVoiBalances(
		address: string,
		tokens: Token[]
	): Promise<TokenWithBalance[]> {
		const balances: TokenWithBalance[] = [];

		// Separate tokens by type for efficient fetching
		const nativeToken = tokens.find((t) => t.token_standard === 'native');
		const arc200Tokens = tokens.filter((t) => t.token_standard === 'voi_arc200');

		// Batch fetch ARC200 balances from Mimir
		const mimirBalances = await this.fetchMimirBalances(address, arc200Tokens);

		// Fetch native VOI balance
		let nativeBalance = '0';
		if (nativeToken) {
			nativeBalance = await this.fetchNativeVoiBalance(address);
		}

		// Build result array
		for (const token of tokens) {
			let balance = '0';
			let usdValue: string | null = null;

			if (token.token_standard === 'native') {
				balance = nativeBalance;
			} else if (token.token_standard === 'voi_arc200' && token.contract_id) {
				const mimirBalance = mimirBalances.get(token.contract_id);
				if (mimirBalance) {
					balance = mimirBalance.balance;
					usdValue = mimirBalance.usdValue;
				} else {
					// Fallback to direct ARC200 query
					try {
						const info = await getArc200TokenInfo(token.contract_id, address);
						balance = info.balance || '0';
					} catch (error) {
						console.warn(`Failed to fetch ARC200 balance for ${token.symbol}:`, error);
					}
				}
			}

			balances.push({
				...token,
				balance,
				formatted_balance: this.formatBalance(balance, token.decimals),
				usd_value: usdValue,
			});
		}

		return balances;
	}

	/**
	 * Fetch ARC200 balances from Mimir API
	 */
	private async fetchMimirBalances(
		address: string,
		tokens: Token[]
	): Promise<Map<number, { balance: string; usdValue: string }>> {
		const result = new Map<number, { balance: string; usdValue: string }>();

		if (tokens.length === 0) return result;

		try {
			const response = await fetch(
				`${MIMIR_API_BASE}/account/assets?accountId=${address}`,
				{ cache: 'no-store' }
			);

			if (!response.ok) return result;

			const data: MimirResponse = await response.json();
			const contractIds = new Set(tokens.map((t) => t.contract_id));

			for (const asset of data.balances || []) {
				if (contractIds.has(asset.contractId)) {
					result.set(asset.contractId, {
						balance: asset.balance,
						usdValue: asset.usdValue || '0',
					});
				}
			}
		} catch (error) {
			console.error('Mimir balance fetch failed:', error);
		}

		return result;
	}

	/**
	 * Fetch native VOI balance from Algod
	 */
	private async fetchNativeVoiBalance(address: string): Promise<string> {
		try {
			const response = await fetch(`${ALGOD_API_BASE}/v2/accounts/${address}`, {
				cache: 'no-store',
			});

			if (!response.ok) {
				console.warn('Failed to fetch VOI balance:', response.status);
				return '0';
			}

			const data = await response.json();
			return (data.amount || 0).toString();
		} catch (error) {
			console.error('Failed to fetch VOI balance:', error);
			return '0';
		}
	}

	/**
	 * Format balance for display
	 */
	formatBalance(balance: string, decimals: number): string {
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
	 * Get display symbol for a token
	 */
	getDisplaySymbol(token: Token): string {
		return token.display_symbol || token.symbol;
	}

	/**
	 * Get display name for a token
	 */
	getDisplayName(token: Token): string {
		return token.display_name || token.name;
	}

	/**
	 * Get from cache if not expired
	 */
	private getFromCache(key: string): Token[] | null {
		const cached = this.cache.get(key);
		const expiry = this.cacheExpiry.get(key);

		if (cached && expiry && Date.now() < expiry) {
			return cached;
		}

		// Clear expired cache
		if (cached) {
			this.cache.delete(key);
			this.cacheExpiry.delete(key);
		}

		return null;
	}

	/**
	 * Set cache with expiry
	 */
	private setCache(key: string, tokens: Token[]): void {
		this.cache.set(key, tokens);
		this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
	}

	/**
	 * Clear all caches
	 */
	clearCache(): void {
		this.cache.clear();
		this.singleCache.clear();
		this.cacheExpiry.clear();
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): { size: number; entries: string[] } {
		return {
			size: this.cache.size + this.singleCache.size,
			entries: [...Array.from(this.cache.keys()), ...Array.from(this.singleCache.keys())],
		};
	}
}

// Export singleton instance (uses browser client by default)
export const tokenService = new TokenService();

// Export class for server-side instantiation with admin client
export { TokenService };

// Re-export types for convenience
export type { Token, TokenWithBalance, TokenFilter, ChainType, TokenStandard };
