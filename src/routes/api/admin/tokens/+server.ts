/**
 * Admin Tokens API
 * List and create tokens
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { requirePermission, getCurrentProfileId, PERMISSIONS } from '$lib/auth/admin';
import { getArc200TokenInfo } from '$lib/voi/arc200';
import type {
	Token,
	TokenCreateRequest,
	ChainType,
	TokenStandard,
} from '$lib/types/token';

// Pagination constants
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

// Valid token standards
const VALID_TOKEN_STANDARDS: TokenStandard[] = [
	'native',
	'voi_asa',
	'voi_arc200',
	'base_erc20',
	'solana_spl',
];

// Valid chains
const VALID_CHAINS: ChainType[] = ['voi', 'base', 'solana'];

// Input limits
const MAX_SYMBOL_LENGTH = 20;
const MAX_NAME_LENGTH = 100;
const MAX_ICON_URL_LENGTH = 500;

/**
 * Sanitize string input
 */
function sanitizeString(input: string | undefined | null, maxLength: number): string | null {
	if (!input) return null;
	let sanitized = input.trim();
	sanitized = sanitized.replace(/<[^>]*>/g, '');
	if (sanitized.length > maxLength) {
		sanitized = sanitized.substring(0, maxLength);
	}
	return sanitized || null;
}

/**
 * GET /api/admin/tokens
 * List all tokens with filters
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
	try {
		const profileId = await getCurrentProfileId(cookies);
		if (!profileId) {
			return json({ success: false, error: 'Authentication required' }, { status: 401 });
		}

		await requirePermission(cookies, PERMISSIONS.VIEW_GAMES, profileId);

		const searchParams = url.searchParams;

		// Parse query parameters
		const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
		const limit = Math.min(
			MAX_PAGE_SIZE,
			Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE)))
		);
		const chain = searchParams.get('chain') as ChainType | null;
		const tokenStandard = searchParams.get('token_standard') as TokenStandard | null;
		const isActive = searchParams.get('is_active');
		const isDisplayable = searchParams.get('is_displayable');
		const isGameEnabled = searchParams.get('is_game_enabled');
		const isTreasuryEnabled = searchParams.get('is_treasury_enabled');

		const supabase = createAdminClient();
		const offset = (page - 1) * limit;

		// Build query
		let query = supabase.from('tokens').select('*', { count: 'exact' });

		if (chain && VALID_CHAINS.includes(chain)) {
			query = query.eq('chain', chain);
		}
		if (tokenStandard && VALID_TOKEN_STANDARDS.includes(tokenStandard)) {
			query = query.eq('token_standard', tokenStandard);
		}
		if (isActive !== null) {
			query = query.eq('is_active', isActive === 'true');
		}
		if (isDisplayable !== null) {
			query = query.eq('is_displayable', isDisplayable === 'true');
		}
		if (isGameEnabled !== null) {
			query = query.eq('is_game_enabled', isGameEnabled === 'true');
		}
		if (isTreasuryEnabled !== null) {
			query = query.eq('is_treasury_enabled', isTreasuryEnabled === 'true');
		}

		// Apply sorting and pagination
		query = query.order('symbol').range(offset, offset + limit - 1);

		const { data: tokens, error, count } = await query;

		if (error) {
			console.error('Error fetching tokens:', error.message);
			return json({ success: false, error: 'Failed to fetch tokens' }, { status: 500 });
		}

		return json(
			{
				success: true,
				data: {
					data: tokens || [],
					pagination: {
						page,
						limit,
						total: count || 0,
						total_pages: Math.ceil((count || 0) / limit),
					},
				},
			},
			{ status: 200 }
		);
	} catch (error: unknown) {
		if (
			error instanceof Error &&
			(error.message?.includes('UNAUTHORIZED') || error.message?.includes('FORBIDDEN'))
		) {
			return json(
				{ success: false, error: error.message },
				{ status: error.message.includes('UNAUTHORIZED') ? 401 : 403 }
			);
		}

		console.error('Error in tokens GET API:', error);
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * POST /api/admin/tokens
 * Create a new token
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const profileId = await getCurrentProfileId(cookies);
		if (!profileId) {
			return json({ success: false, error: 'Authentication required' }, { status: 401 });
		}

		await requirePermission(cookies, PERMISSIONS.CREATE_GAMES, profileId);

		const body: TokenCreateRequest = await request.json();

		// Validate required fields
		if (!body.chain || !body.token_standard || !body.symbol || !body.name) {
			return json(
				{ success: false, error: 'Missing required fields: chain, token_standard, symbol, name' },
				{ status: 400 }
			);
		}

		// Validate chain
		if (!VALID_CHAINS.includes(body.chain)) {
			return json(
				{ success: false, error: `Invalid chain. Must be one of: ${VALID_CHAINS.join(', ')}` },
				{ status: 400 }
			);
		}

		// Validate token standard
		if (!VALID_TOKEN_STANDARDS.includes(body.token_standard)) {
			return json(
				{
					success: false,
					error: `Invalid token_standard. Must be one of: ${VALID_TOKEN_STANDARDS.join(', ')}`,
				},
				{ status: 400 }
			);
		}

		// Validate native token has no contract_id
		if (body.token_standard === 'native' && body.contract_id) {
			return json(
				{ success: false, error: 'Native tokens cannot have a contract_id' },
				{ status: 400 }
			);
		}

		// Validate non-native tokens require contract_id
		if (body.token_standard !== 'native' && !body.contract_id) {
			return json(
				{ success: false, error: 'Non-native tokens require a contract_id' },
				{ status: 400 }
			);
		}

		// Sanitize inputs
		const sanitizedSymbol = sanitizeString(body.symbol, MAX_SYMBOL_LENGTH);
		const sanitizedName = sanitizeString(body.name, MAX_NAME_LENGTH);
		const sanitizedDisplaySymbol = sanitizeString(body.display_symbol, MAX_SYMBOL_LENGTH);
		const sanitizedDisplayName = sanitizeString(body.display_name, MAX_NAME_LENGTH);
		const sanitizedIconUrl = sanitizeString(body.icon_url, MAX_ICON_URL_LENGTH);

		if (!sanitizedSymbol || !sanitizedName) {
			return json(
				{ success: false, error: 'Symbol and name are required' },
				{ status: 400 }
			);
		}

		// For ARC200 tokens on Voi, try to fetch metadata from chain
		let decimals = body.decimals ?? 6;
		let chainSymbol = sanitizedSymbol;
		let chainName = sanitizedName;

		if (body.token_standard === 'voi_arc200' && body.contract_id) {
			try {
				const tokenInfo = await getArc200TokenInfo(body.contract_id);
				// Use chain data as fallback if not provided
				if (!body.symbol || body.symbol === 'UNKNOWN') {
					chainSymbol = tokenInfo.symbol || sanitizedSymbol;
				}
				if (!body.name || body.name === 'Unknown Token') {
					chainName = tokenInfo.name || sanitizedName;
				}
				decimals = tokenInfo.decimals ?? decimals;
			} catch (error) {
				console.warn('Failed to fetch ARC200 token info:', error);
				// Continue with provided data
			}
		}

		const supabase = createAdminClient();

		// Check for duplicate
		const { data: existing } = await supabase
			.from('tokens')
			.select('id')
			.eq('chain', body.chain)
			.eq('contract_id', body.contract_id ?? null)
			.single();

		if (existing) {
			return json(
				{ success: false, error: 'A token with this chain and contract_id already exists' },
				{ status: 409 }
			);
		}

		// Create token
		const { data: token, error } = await supabase
			.from('tokens')
			.insert({
				chain: body.chain,
				contract_id: body.contract_id ?? null,
				token_standard: body.token_standard,
				symbol: chainSymbol,
				name: chainName,
				decimals,
				icon_url: sanitizedIconUrl,
				display_symbol: sanitizedDisplaySymbol,
				display_name: sanitizedDisplayName,
				is_active: true,
				is_displayable: body.is_displayable ?? false,
				is_game_enabled: body.is_game_enabled ?? false,
				is_treasury_enabled: body.is_treasury_enabled ?? false,
			})
			.select()
			.single();

		if (error) {
			console.error('Error creating token:', error.message, error.code);
			if (error.code === '23505') {
				return json(
					{ success: false, error: 'A token with this chain and contract_id already exists' },
					{ status: 409 }
				);
			}
			return json({ success: false, error: 'Failed to create token' }, { status: 500 });
		}

		return json(
			{ success: true, data: token, message: 'Token created successfully' },
			{ status: 201 }
		);
	} catch (error: unknown) {
		if (
			error instanceof Error &&
			(error.message?.includes('UNAUTHORIZED') || error.message?.includes('FORBIDDEN'))
		) {
			return json(
				{ success: false, error: error.message },
				{ status: error.message.includes('UNAUTHORIZED') ? 401 : 403 }
			);
		}

		console.error('Error in tokens POST API:', error);
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};
