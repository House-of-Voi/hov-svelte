/**
 * Admin Single Machine API
 * Get, update, and delete a specific machine
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { requirePermission, getCurrentProfileId, PERMISSIONS } from '$lib/auth/admin';
import { isValidAddress } from '$lib/voi/address-utils';
import type { Machine, MachineStatus } from '$lib/types/database';

// Platform fee limits
const MIN_PLATFORM_FEE_PERCENT = 0;
const MAX_PLATFORM_FEE_PERCENT = 100;

// Fields required for PATCH validation
const PATCH_REQUIRED_FIELDS = 'status, min_bet, max_bet, platform_fee_percent';

/**
 * Valid status transitions for deployed machines
 * Key: current status, Value: array of valid next states
 */
const STATUS_TRANSITIONS: Record<MachineStatus, MachineStatus[]> = {
  'draft': ['deploying'],
  'deploying': ['bootstrapping', 'failed'],
  'bootstrapping': ['active', 'failed'],
  'active': ['paused', 'deprecated'],
  'paused': ['active', 'deprecated'],
  'failed': ['draft'],
  'deprecated': [], // Terminal state - no transitions allowed
};

/**
 * GET /api/admin/machines/:id
 * Get a single machine by ID
 */
export const GET: RequestHandler = async ({ params, cookies }) => {
  try {
    // Explicit authentication check
    const profileId = await getCurrentProfileId(cookies);
    if (!profileId) {
      return json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    await requirePermission(cookies, PERMISSIONS.VIEW_GAMES, profileId);

    const { id } = params;

    if (!id) {
      return json(
        { success: false, error: 'Machine ID is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: machine, error } = await supabase
      .from('machines')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return json(
          { success: false, error: 'Machine not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching machine:', { id, error: error.message });
      return json(
        { success: false, error: 'Failed to fetch machine' },
        { status: 500 }
      );
    }

    return json(
      { success: true, data: machine },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof Error && (error.message?.includes('UNAUTHORIZED') || error.message?.includes('FORBIDDEN'))) {
      return json(
        { success: false, error: error.message },
        { status: error.message.includes('UNAUTHORIZED') ? 401 : 403 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in machine GET API:', { error: errorMessage });
    return json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
};

/**
 * PATCH /api/admin/machines/:id
 * Update a machine
 *
 * Update rules:
 * - Draft machines: All fields can be updated
 * - Deployed machines: Only display_name, description, theme, and status can be updated
 * - Status transitions are validated against STATUS_TRANSITIONS
 * - is_active is a convenience field that triggers status changes (active <-> paused)
 */
export const PATCH: RequestHandler = async ({ params, request, cookies }) => {
  try {
    // Explicit authentication check
    const profileId = await getCurrentProfileId(cookies);
    if (!profileId) {
      return json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    await requirePermission(cookies, PERMISSIONS.EDIT_GAMES, profileId);

    const { id } = params;

    if (!id) {
      return json(
        { success: false, error: 'Machine ID is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Get only the fields we need for validation
    const { data: existingMachine, error: fetchError } = await supabase
      .from('machines')
      .select(PATCH_REQUIRED_FIELDS)
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return json(
          { success: false, error: 'Machine not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching machine:', { id, error: fetchError.message });
      return json(
        { success: false, error: 'Failed to fetch machine' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const currentStatus = existingMachine.status as MachineStatus;
    const isDraft = currentStatus === 'draft';

    // Build update data based on what's allowed
    const updateData: Record<string, unknown> = {};

    // Process the update request
    const validationError = processUpdateRequest(body, existingMachine, isDraft, updateData);
    if (validationError) {
      return json(
        { success: false, error: validationError },
        { status: 400 }
      );
    }

    // Handle status/is_active changes
    const statusError = processStatusChange(body, currentStatus, isDraft, updateData);
    if (statusError) {
      return json(
        { success: false, error: statusError },
        { status: 400 }
      );
    }

    // Always update updated_at
    updateData.updated_at = new Date().toISOString();

    // Check if there's anything to update beyond updated_at
    if (Object.keys(updateData).length === 1) {
      // Fetch full machine to return
      const { data: fullMachine } = await supabase
        .from('machines')
        .select('*')
        .eq('id', id)
        .single();

      return json(
        { success: true, data: fullMachine, message: 'No changes to update' },
        { status: 200 }
      );
    }

    const { data: updatedMachine, error: updateError } = await supabase
      .from('machines')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating machine:', { id, error: updateError.message, code: updateError.code });

      if (updateError.code === '23505') {
        return json(
          { success: false, error: 'A machine with this name already exists' },
          { status: 409 }
        );
      }

      return json(
        { success: false, error: 'Failed to update machine' },
        { status: 500 }
      );
    }

    return json(
      { success: true, data: updatedMachine, message: 'Machine updated successfully' },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof Error && (error.message?.includes('UNAUTHORIZED') || error.message?.includes('FORBIDDEN'))) {
      return json(
        { success: false, error: error.message },
        { status: error.message.includes('UNAUTHORIZED') ? 401 : 403 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in machine PATCH API:', { error: errorMessage });
    return json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
};

/**
 * DELETE /api/admin/machines/:id
 * Delete a machine (only draft machines can be deleted)
 */
export const DELETE: RequestHandler = async ({ params, cookies }) => {
  try {
    // Explicit authentication check
    const profileId = await getCurrentProfileId(cookies);
    if (!profileId) {
      return json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    await requirePermission(cookies, PERMISSIONS.DELETE_GAMES, profileId);

    const { id } = params;

    if (!id) {
      return json(
        { success: false, error: 'Machine ID is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Only select status - that's all we need
    const { data: existingMachine, error: fetchError } = await supabase
      .from('machines')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return json(
          { success: false, error: 'Machine not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching machine:', { id, error: fetchError.message });
      return json(
        { success: false, error: 'Failed to fetch machine' },
        { status: 500 }
      );
    }

    // Only draft machines can be deleted
    if (existingMachine.status !== 'draft') {
      return json(
        { success: false, error: 'Only draft machines can be deleted. Use deprecate for deployed machines.' },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabase
      .from('machines')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting machine:', { id, error: deleteError.message });
      return json(
        { success: false, error: 'Failed to delete machine' },
        { status: 500 }
      );
    }

    return json(
      { success: true, message: 'Machine deleted successfully' },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof Error && (error.message?.includes('UNAUTHORIZED') || error.message?.includes('FORBIDDEN'))) {
      return json(
        { success: false, error: error.message },
        { status: error.message.includes('UNAUTHORIZED') ? 401 : 403 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in machine DELETE API:', { error: errorMessage });
    return json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
};

/**
 * Process update request and populate updateData
 * Returns error message if validation fails, null otherwise
 */
function processUpdateRequest(
  body: Record<string, unknown>,
  existingMachine: { min_bet: number; max_bet: number; platform_fee_percent: number },
  isDraft: boolean,
  updateData: Record<string, unknown>
): string | null {
  // Fields that can always be updated
  const alwaysEditableFields = ['display_name', 'description', 'theme'];
  for (const field of alwaysEditableFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }

  // Fields that can only be updated for draft machines
  if (isDraft) {
    const draftOnlyFields = [
      'name', 'machine_type', 'config', 'rtp_target', 'house_edge',
      'min_bet', 'max_bet', 'platform_fee_percent', 'platform_treasury_address'
    ];

    for (const field of draftOnlyFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Validate bet limits
    const minBet = (body.min_bet as number) ?? existingMachine.min_bet;
    const maxBet = (body.max_bet as number) ?? existingMachine.max_bet;

    if (minBet <= 0 || maxBet <= 0) {
      return 'min_bet and max_bet must be positive';
    }

    if (minBet > maxBet) {
      return 'min_bet cannot be greater than max_bet';
    }

    // Validate platform fee
    const platformFee = (body.platform_fee_percent as number) ?? existingMachine.platform_fee_percent;
    if (platformFee < MIN_PLATFORM_FEE_PERCENT || platformFee > MAX_PLATFORM_FEE_PERCENT) {
      return `platform_fee_percent must be between ${MIN_PLATFORM_FEE_PERCENT} and ${MAX_PLATFORM_FEE_PERCENT}`;
    }

    // Validate platform treasury address if provided
    if (body.platform_treasury_address && typeof body.platform_treasury_address === 'string') {
      if (!isValidAddress(body.platform_treasury_address)) {
        return 'Invalid platform_treasury_address. Must be a valid Algorand/Voi address.';
      }
    }
  }

  return null;
}

/**
 * Process status and is_active changes
 * Returns error message if validation fails, null otherwise
 */
function processStatusChange(
  body: Record<string, unknown>,
  currentStatus: MachineStatus,
  isDraft: boolean,
  updateData: Record<string, unknown>
): string | null {
  const requestedStatus = body.status as MachineStatus | undefined;
  const requestedIsActive = body.is_active as boolean | undefined;

  // Handle is_active as a convenience for pause/unpause
  // This takes precedence over explicit status changes
  if (requestedIsActive !== undefined && !isDraft) {
    if (currentStatus === 'active' && requestedIsActive === false) {
      updateData.status = 'paused';
      updateData.is_active = false;
      return null;
    }
    if (currentStatus === 'paused' && requestedIsActive === true) {
      updateData.status = 'active';
      updateData.is_active = true;
      return null;
    }
    // is_active doesn't make sense for other states - ignore it
  }

  // Handle explicit status changes
  if (requestedStatus !== undefined) {
    if (isDraft) {
      // Draft machines can transition to deploying
      if (requestedStatus === 'deploying') {
        updateData.status = 'deploying';
        updateData.deployment_started_at = new Date().toISOString();
        return null;
      }
      // Allow staying in draft
      if (requestedStatus === 'draft') {
        return null;
      }
      return `Draft machines can only transition to 'deploying'`;
    }

    // Validate transition for deployed machines
    const validNextStates = STATUS_TRANSITIONS[currentStatus] || [];
    if (!validNextStates.includes(requestedStatus)) {
      if (validNextStates.length === 0) {
        return `Cannot transition from '${currentStatus}' - it is a terminal state`;
      }
      return `Cannot transition from '${currentStatus}' to '${requestedStatus}'. Valid transitions: ${validNextStates.join(', ')}`;
    }

    updateData.status = requestedStatus;

    // Update is_active based on new status
    if (requestedStatus === 'active') {
      updateData.is_active = true;
    } else if (['paused', 'deprecated', 'failed'].includes(requestedStatus)) {
      updateData.is_active = false;
    }

    // Set timestamps
    if (requestedStatus === 'deprecated') {
      updateData.deprecated_at = new Date().toISOString();
    }
    if (requestedStatus === 'active' && currentStatus === 'bootstrapping') {
      updateData.launched_at = new Date().toISOString();
      updateData.deployment_completed_at = new Date().toISOString();
    }
  }

  return null;
}
