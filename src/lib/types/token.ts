/**
 * Token types for multi-token support
 *
 * Defines types for the tokens table and related operations.
 * Supports multiple chains (Voi, Base, Solana) and token standards.
 */

export type ChainType = 'voi' | 'base' | 'solana';

export type TokenStandard =
	| 'native' // Native chain token (VOI, ETH, SOL)
	| 'voi_asa' // Voi ASA (Algorand Standard Asset)
	| 'voi_arc200' // Voi ARC200 token
	| 'base_erc20' // Base ERC20 token
	| 'solana_spl'; // Solana SPL token

/**
 * Token record from the tokens table
 */
export interface Token {
	id: string;
	chain: ChainType;
	contract_id: number | null;
	token_standard: TokenStandard;
	symbol: string;
	name: string;
	decimals: number;
	icon_url: string | null;
	display_symbol: string | null;
	display_name: string | null;
	is_active: boolean;
	is_displayable: boolean;
	is_game_enabled: boolean;
	is_treasury_enabled: boolean;
	created_at: string;
	updated_at: string;
}

/**
 * Token with balance information for wallet display
 */
export interface TokenWithBalance extends Token {
	balance: string; // Raw balance in atomic units
	formatted_balance: string; // Human-readable balance
	usd_value: string | null; // USD value if available
}

/**
 * Request body for creating a new token
 */
export interface TokenCreateRequest {
	chain: ChainType;
	contract_id?: number | null;
	token_standard: TokenStandard;
	symbol: string;
	name: string;
	decimals?: number;
	icon_url?: string | null;
	display_symbol?: string | null;
	display_name?: string | null;
	is_displayable?: boolean;
	is_game_enabled?: boolean;
	is_treasury_enabled?: boolean;
}

/**
 * Request body for updating a token
 */
export interface TokenUpdateRequest {
	symbol?: string;
	name?: string;
	decimals?: number;
	icon_url?: string | null;
	display_symbol?: string | null;
	display_name?: string | null;
	is_active?: boolean;
	is_displayable?: boolean;
	is_game_enabled?: boolean;
	is_treasury_enabled?: boolean;
}

/**
 * Token filter options for queries
 */
export interface TokenFilter {
	chain?: ChainType;
	token_standard?: TokenStandard;
	is_active?: boolean;
	is_displayable?: boolean;
	is_game_enabled?: boolean;
	is_treasury_enabled?: boolean;
}

/**
 * Helper to get display symbol (falls back to symbol)
 */
export function getTokenDisplaySymbol(token: Token): string {
	return token.display_symbol || token.symbol;
}

/**
 * Helper to get display name (falls back to name)
 */
export function getTokenDisplayName(token: Token): string {
	return token.display_name || token.name;
}

/**
 * Check if token is native (no contract)
 */
export function isNativeToken(token: Token): boolean {
	return token.token_standard === 'native';
}

/**
 * Check if token is ARC200
 */
export function isArc200Token(token: Token): boolean {
	return token.token_standard === 'voi_arc200';
}

/**
 * Check if token is ASA
 */
export function isAsaToken(token: Token): boolean {
	return token.token_standard === 'voi_asa';
}
