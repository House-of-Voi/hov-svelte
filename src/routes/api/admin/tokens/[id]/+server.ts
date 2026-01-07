/**
 * Admin Single Token API
 * Get, update, and delete a specific token
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { requirePermission, getCurrentProfileId, PERMISSIONS } from '$lib/auth/admin';
import type { TokenUpdateRequest } from '$lib/types/token';

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
 * GET /api/admin/tokens/:id
 * Get a single token by ID
 */
export const GET: RequestHandler = async ({ params, cookies }) => {
	try {
		const profileId = await getCurrentProfileId(cookies);
		if (!profileId) {
			return json({ success: false, error: 'Authentication required' }, { status: 401 });
		}

		await requirePermission(cookies, PERMISSIONS.VIEW_GAMES, profileId);

		const { id } = params;

		if (!id) {
			return json({ success: false, error: 'Token ID is required' }, { status: 400 });
		}

		const supabase = createAdminClient();

		const { data: token, error } = await supabase
			.from('tokens')
			.select('*')
			.eq('id', id)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return json({ success: false, error: 'Token not found' }, { status: 404 });
			}
			console.error('Error fetching token:', { id, error: error.message });
			return json({ success: false, error: 'Failed to fetch token' }, { status: 500 });
		}

		return json({ success: true, data: token }, { status: 200 });
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

		console.error('Error in token GET API:', error);
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * PATCH /api/admin/tokens/:id
 * Update a token
 *
 * Updatable fields:
 * - symbol, name, decimals, icon_url
 * - display_symbol, display_name
 * - is_active, is_displayable, is_game_enabled, is_treasury_enabled
 *
 * Note: chain, contract_id, and token_standard cannot be changed after creation
 */
export const PATCH: RequestHandler = async ({ params, request, cookies }) => {
	try {
		const profileId = await getCurrentProfileId(cookies);
		if (!profileId) {
			return json({ success: false, error: 'Authentication required' }, { status: 401 });
		}

		await requirePermission(cookies, PERMISSIONS.EDIT_GAMES, profileId);

		const { id } = params;

		if (!id) {
			return json({ success: false, error: 'Token ID is required' }, { status: 400 });
		}

		const supabase = createAdminClient();

		// Check token exists
		const { data: existingToken, error: fetchError } = await supabase
			.from('tokens')
			.select('id')
			.eq('id', id)
			.single();

		if (fetchError) {
			if (fetchError.code === 'PGRST116') {
				return json({ success: false, error: 'Token not found' }, { status: 404 });
			}
			console.error('Error fetching token:', { id, error: fetchError.message });
			return json({ success: false, error: 'Failed to fetch token' }, { status: 500 });
		}

		const body: TokenUpdateRequest = await request.json();
		const updateData: Record<string, unknown> = {};

		// Process updatable fields
		if (body.symbol !== undefined) {
			const sanitized = sanitizeString(body.symbol, MAX_SYMBOL_LENGTH);
			if (sanitized) updateData.symbol = sanitized;
		}

		if (body.name !== undefined) {
			const sanitized = sanitizeString(body.name, MAX_NAME_LENGTH);
			if (sanitized) updateData.name = sanitized;
		}

		if (body.decimals !== undefined) {
			if (typeof body.decimals !== 'number' || body.decimals < 0 || body.decimals > 18) {
				return json(
					{ success: false, error: 'Decimals must be a number between 0 and 18' },
					{ status: 400 }
				);
			}
			updateData.decimals = body.decimals;
		}

		if (body.icon_url !== undefined) {
			updateData.icon_url = sanitizeString(body.icon_url, MAX_ICON_URL_LENGTH);
		}

		if (body.display_symbol !== undefined) {
			updateData.display_symbol = sanitizeString(body.display_symbol, MAX_SYMBOL_LENGTH);
		}

		if (body.display_name !== undefined) {
			updateData.display_name = sanitizeString(body.display_name, MAX_NAME_LENGTH);
		}

		// Boolean flags
		if (body.is_active !== undefined) {
			updateData.is_active = Boolean(body.is_active);
		}

		if (body.is_displayable !== undefined) {
			updateData.is_displayable = Boolean(body.is_displayable);
		}

		if (body.is_game_enabled !== undefined) {
			updateData.is_game_enabled = Boolean(body.is_game_enabled);
		}

		if (body.is_treasury_enabled !== undefined) {
			updateData.is_treasury_enabled = Boolean(body.is_treasury_enabled);
		}

		// Always update updated_at
		updateData.updated_at = new Date().toISOString();

		// Check if there's anything to update
		if (Object.keys(updateData).length === 1) {
			const { data: token } = await supabase
				.from('tokens')
				.select('*')
				.eq('id', id)
				.single();

			return json(
				{ success: true, data: token, message: 'No changes to update' },
				{ status: 200 }
			);
		}

		const { data: updatedToken, error: updateError } = await supabase
			.from('tokens')
			.update(updateData)
			.eq('id', id)
			.select()
			.single();

		if (updateError) {
			console.error('Error updating token:', { id, error: updateError.message });
			return json({ success: false, error: 'Failed to update token' }, { status: 500 });
		}

		return json(
			{ success: true, data: updatedToken, message: 'Token updated successfully' },
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

		console.error('Error in token PATCH API:', error);
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * DELETE /api/admin/tokens/:id
 * Delete a token (soft delete by setting is_active = false)
 *
 * Note: Tokens linked to active machines cannot be deleted
 */
export const DELETE: RequestHandler = async ({ params, cookies }) => {
	try {
		const profileId = await getCurrentProfileId(cookies);
		if (!profileId) {
			return json({ success: false, error: 'Authentication required' }, { status: 401 });
		}

		await requirePermission(cookies, PERMISSIONS.DELETE_GAMES, profileId);

		const { id } = params;

		if (!id) {
			return json({ success: false, error: 'Token ID is required' }, { status: 400 });
		}

		const supabase = createAdminClient();

		// Check token exists
		const { data: existingToken, error: fetchError } = await supabase
			.from('tokens')
			.select('id, contract_id, token_standard')
			.eq('id', id)
			.single();

		if (fetchError) {
			if (fetchError.code === 'PGRST116') {
				return json({ success: false, error: 'Token not found' }, { status: 404 });
			}
			console.error('Error fetching token:', { id, error: fetchError.message });
			return json({ success: false, error: 'Failed to fetch token' }, { status: 500 });
		}

		// Don't allow deleting native tokens
		if (existingToken.token_standard === 'native') {
			return json(
				{ success: false, error: 'Native tokens cannot be deleted' },
				{ status: 400 }
			);
		}

		// Soft delete - set is_active = false
		const { error: deleteError } = await supabase
			.from('tokens')
			.update({
				is_active: false,
				is_displayable: false,
				is_game_enabled: false,
				is_treasury_enabled: false,
				updated_at: new Date().toISOString(),
			})
			.eq('id', id);

		if (deleteError) {
			console.error('Error deleting token:', { id, error: deleteError.message });
			return json({ success: false, error: 'Failed to delete token' }, { status: 500 });
		}

		return json({ success: true, message: 'Token deleted successfully' }, { status: 200 });
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

		console.error('Error in token DELETE API:', error);
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};
