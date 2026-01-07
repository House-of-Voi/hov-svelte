/**
 * Admin Machines API
 * List and manage all machines with pagination and filters
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { requirePermission, getCurrentProfileId, PERMISSIONS } from '$lib/auth/admin';
import { machineStateReader } from '$lib/voi/machine-state-reader';
import { isValidAddress } from '$lib/voi/address-utils';
import type {
  PaginatedResponse,
  MachineListItem,
  MachineFilters,
  MachineCreateDraftRequest,
  MachineRegisterRequest,
} from '$lib/types/admin';
import type { Machine, MachineType, MachineStatus } from '$lib/types/database';

// Pagination constants
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 1;

// Bet limit defaults (in microVOI)
const DEFAULT_MIN_BET_MICROVOI = 1_000_000; // 1 VOI
const DEFAULT_MAX_BET_MICROVOI = 100_000_000; // 100 VOI

// Platform fee limits
const MIN_PLATFORM_FEE_PERCENT = 0;
const MAX_PLATFORM_FEE_PERCENT = 100;

// Input length limits
const MAX_NAME_LENGTH = 50;
const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_THEME_LENGTH = 50;

/**
 * Sanitize string input by:
 * 1. Trimming whitespace
 * 2. Removing HTML/script tags
 * 3. Escaping potentially dangerous characters
 */
function sanitizeString(input: string | undefined | null, maxLength: number): string | null {
  if (!input) return null;

  // Trim whitespace
  let sanitized = input.trim();

  // Remove HTML tags (basic protection against XSS)
  sanitized = sanitized.replace(/<[^>]*>/g, '');

  // Escape special characters that could be used in injection attacks
  sanitized = sanitized
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Enforce length limit
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized || null;
}

/**
 * Validate name format (lowercase alphanumeric with hyphens and underscores)
 */
function isValidNameFormat(name: string): boolean {
  return /^[a-z0-9_-]+$/.test(name);
}

/**
 * GET /api/admin/machines
 * List all machines with filters and pagination
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
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

    const searchParams = url.searchParams;

    // Parse query parameters with proper bounds
    const rawLimit = parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE));
    const limit = Math.max(MIN_PAGE_SIZE, Math.min(rawLimit, MAX_PAGE_SIZE));

    const filters: MachineFilters = {
      page: Math.max(1, parseInt(searchParams.get('page') || '1')),
      limit,
      machine_type: (searchParams.get('machine_type') as MachineType) || undefined,
      status: (searchParams.get('status') as MachineStatus) || undefined,
      chain: (searchParams.get('chain') as 'base' | 'voi' | 'solana') || undefined,
      is_active: searchParams.get('is_active') === 'true' ? true :
                 searchParams.get('is_active') === 'false' ? false : undefined,
      theme: searchParams.get('theme') || undefined,
      sort_by: searchParams.get('sort_by') || 'created_at',
      sort_order: (searchParams.get('sort_order') as 'asc' | 'desc') || 'desc',
    };

    const supabase = createAdminClient();
    const offset = (filters.page! - 1) * filters.limit!;

    // Build query for machines
    let query = supabase
      .from('machines')
      .select('*', { count: 'exact' });

    // Apply filters
    if (filters.machine_type) {
      query = query.eq('machine_type', filters.machine_type);
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.chain) {
      query = query.eq('chain', filters.chain);
    }

    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    if (filters.theme) {
      query = query.eq('theme', filters.theme);
    }

    // Apply sorting
    query = query.order(filters.sort_by!, { ascending: filters.sort_order === 'asc' });

    // Apply pagination
    query = query.range(offset, offset + filters.limit! - 1);

    const { data: machines, error, count } = await query;

    if (error) {
      console.error('Error fetching machines:', { error: error.message });
      return json(
        { success: false, error: 'Failed to fetch machines' },
        { status: 500 }
      );
    }

    // Format response
    // Note: Stats (total_spins, etc.) could be aggregated in a single query if needed
    const machinesData: MachineListItem[] = (machines || []).map((machine: Machine) => ({
      ...machine,
      total_spins: undefined,
      total_wagered: undefined,
      total_payout: undefined,
      unique_players: undefined,
    }));

    const response: PaginatedResponse<MachineListItem> = {
      data: machinesData,
      pagination: {
        page: filters.page!,
        limit: filters.limit!,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / filters.limit!),
      },
    };

    return json(
      { success: true, data: response },
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
    console.error('Error in machines API:', { error: errorMessage });
    return json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
};

/**
 * POST /api/admin/machines
 * Create a new machine (draft or register existing)
 *
 * Modes:
 * - draft: Create a new draft machine configuration (not yet deployed)
 * - register: Register an existing on-chain contract
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    // Explicit authentication check
    const profileId = await getCurrentProfileId(cookies);
    if (!profileId) {
      return json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    await requirePermission(cookies, PERMISSIONS.CREATE_GAMES, profileId);

    const body = await request.json();
    const mode = body.mode as 'draft' | 'register';

    if (!mode || (mode !== 'draft' && mode !== 'register')) {
      return json(
        { success: false, error: 'Invalid mode. Must be "draft" or "register".' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    if (mode === 'draft') {
      return await handleCreateDraft(body, profileId, supabase);
    } else {
      return await handleRegisterContract(body, profileId, supabase);
    }
  } catch (error: unknown) {
    if (error instanceof Error && (error.message?.includes('UNAUTHORIZED') || error.message?.includes('FORBIDDEN'))) {
      return json(
        { success: false, error: error.message },
        { status: error.message.includes('UNAUTHORIZED') ? 401 : 403 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in machines POST API:', { error: errorMessage });
    return json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
};

/**
 * Handle creating a draft machine
 */
async function handleCreateDraft(
  body: MachineCreateDraftRequest & { mode: string },
  profileId: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<Response> {
  const draftRequest = body;

  // Sanitize string inputs
  const sanitizedName = sanitizeString(draftRequest.name, MAX_NAME_LENGTH);
  const sanitizedDisplayName = sanitizeString(draftRequest.display_name, MAX_DISPLAY_NAME_LENGTH);
  const sanitizedDescription = sanitizeString(draftRequest.description, MAX_DESCRIPTION_LENGTH);
  const sanitizedTheme = sanitizeString(draftRequest.theme, MAX_THEME_LENGTH);

  // Validate required fields
  if (!sanitizedName || !sanitizedDisplayName || !draftRequest.machine_type) {
    return json(
      { success: false, error: 'Missing required fields: name, display_name, machine_type' },
      { status: 400 }
    );
  }

  // Validate name format
  if (!isValidNameFormat(sanitizedName)) {
    return json(
      { success: false, error: 'Name must be lowercase with only letters, numbers, hyphens, and underscores' },
      { status: 400 }
    );
  }

  if (draftRequest.min_bet === undefined || draftRequest.max_bet === undefined) {
    return json(
      { success: false, error: 'Missing required fields: min_bet, max_bet' },
      { status: 400 }
    );
  }

  if (draftRequest.min_bet <= 0 || draftRequest.max_bet <= 0) {
    return json(
      { success: false, error: 'min_bet and max_bet must be positive' },
      { status: 400 }
    );
  }

  if (draftRequest.min_bet > draftRequest.max_bet) {
    return json(
      { success: false, error: 'min_bet cannot be greater than max_bet' },
      { status: 400 }
    );
  }

  // Validate platform fee
  if (draftRequest.platform_fee_percent !== undefined) {
    if (draftRequest.platform_fee_percent < MIN_PLATFORM_FEE_PERCENT ||
        draftRequest.platform_fee_percent > MAX_PLATFORM_FEE_PERCENT) {
      return json(
        { success: false, error: `platform_fee_percent must be between ${MIN_PLATFORM_FEE_PERCENT} and ${MAX_PLATFORM_FEE_PERCENT}` },
        { status: 400 }
      );
    }
  }

  // Validate platform treasury address if provided
  if (draftRequest.platform_treasury_address) {
    if (!isValidAddress(draftRequest.platform_treasury_address)) {
      return json(
        { success: false, error: 'Invalid platform_treasury_address. Must be a valid Algorand/Voi address.' },
        { status: 400 }
      );
    }
  }

  // Create the machine with sanitized inputs
  const { data: machine, error } = await supabase
    .from('machines')
    .insert({
      name: sanitizedName,
      display_name: sanitizedDisplayName,
      description: sanitizedDescription,
      theme: sanitizedTheme,
      machine_type: draftRequest.machine_type,
      chain: draftRequest.chain || 'voi',
      config: draftRequest.config || {},
      rtp_target: draftRequest.rtp_target || null,
      house_edge: draftRequest.house_edge || null,
      min_bet: draftRequest.min_bet,
      max_bet: draftRequest.max_bet,
      platform_fee_percent: draftRequest.platform_fee_percent ?? 0,
      platform_treasury_address: draftRequest.platform_treasury_address || null,
      status: 'draft',
      is_active: false,
      created_by: profileId,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating draft machine:', { error: error.message, code: error.code });

    // Check for unique constraint violation
    if (error.code === '23505') {
      return json(
        { success: false, error: 'A machine with this name already exists' },
        { status: 409 }
      );
    }

    return json(
      { success: false, error: 'Failed to create machine' },
      { status: 500 }
    );
  }

  return json(
    { success: true, data: machine, message: 'Draft machine created successfully' },
    { status: 201 }
  );
}

/**
 * Handle registering an existing on-chain contract
 */
async function handleRegisterContract(
  body: MachineRegisterRequest & { mode: string },
  profileId: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<Response> {
  const registerRequest = body;

  // Sanitize string inputs
  const sanitizedDisplayName = sanitizeString(registerRequest.display_name, MAX_DISPLAY_NAME_LENGTH);

  // Validate required fields
  if (!registerRequest.game_contract_id || !registerRequest.treasury_contract_id ||
      !sanitizedDisplayName || !registerRequest.machine_type) {
    return json(
      { success: false, error: 'Missing required fields: game_contract_id, treasury_contract_id, display_name, machine_type' },
      { status: 400 }
    );
  }

  // Auto-generate name from machine_type and game_contract_id
  const generatedName = `${registerRequest.machine_type.replace('_', '-')}-${registerRequest.game_contract_id}`;

  // Validate that the game contract exists on-chain and read its state
  let platformFeePercent = 0;
  let platformTreasuryAddress: string | null = null;
  let treasuryAssetId: number | null = null;

  try {
    const contractExists = await machineStateReader.appExists(registerRequest.game_contract_id);
    if (!contractExists) {
      return json(
        { success: false, error: 'Game contract does not exist on-chain' },
        { status: 400 }
      );
    }

    // Validate it's actually a game contract
    const contractTypeResult = await machineStateReader.detectContractType(registerRequest.game_contract_id);
    if (contractTypeResult.type !== 'game') {
      return json(
        { success: false, error: `Contract ${registerRequest.game_contract_id} is not a valid game contract (detected: ${contractTypeResult.type})` },
        { status: 400 }
      );
    }

    // Read contract state to get fee configuration and token info
    const gameState = await machineStateReader.readGameContractState(registerRequest.game_contract_id, {
      machineType: registerRequest.machine_type
    });

    // Auto-populate fee values from contract state if available
    if (gameState.feeConfig) {
      // Convert basis points to percentage (30 bps = 0.3%)
      platformFeePercent = gameState.feeConfig.treasuryBps / 100;
      platformTreasuryAddress = gameState.feeConfig.treasuryAddress || null;
    }

    // Auto-populate token app ID if this is an ARC200 machine (mode 4 enabled)
    if (gameState.contractRefs?.tokenAppId) {
      treasuryAssetId = gameState.contractRefs.tokenAppId;
      console.log(`Detected ARC200 token contract: ${treasuryAssetId}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error validating game contract:', { contractId: registerRequest.game_contract_id, error: errorMessage });
    return json(
      { success: false, error: `Failed to validate game contract: ${errorMessage}` },
      { status: 400 }
    );
  }

  // Validate treasury contract if provided
  if (registerRequest.treasury_contract_id) {
    try {
      const treasuryExists = await machineStateReader.appExists(registerRequest.treasury_contract_id);
      if (!treasuryExists) {
        return json(
          { success: false, error: 'Treasury contract does not exist on-chain' },
          { status: 400 }
        );
      }

      // Validate it's actually a treasury contract
      const treasuryTypeResult = await machineStateReader.detectContractType(registerRequest.treasury_contract_id);
      if (treasuryTypeResult.type !== 'treasury') {
        return json(
          { success: false, error: `Contract ${registerRequest.treasury_contract_id} is not a valid treasury contract (detected: ${treasuryTypeResult.type})` },
          { status: 400 }
        );
      }

      // Validate the pair is properly linked
      const validation = await machineStateReader.validateContractPair(
        registerRequest.game_contract_id,
        registerRequest.treasury_contract_id
      );

      if (!validation.valid) {
        return json(
          { success: false, error: `Contract pair validation failed: ${validation.errors.join(', ')}` },
          { status: 400 }
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error validating treasury contract:', { contractId: registerRequest.treasury_contract_id, error: errorMessage });
      return json(
        { success: false, error: `Failed to validate treasury contract: ${errorMessage}` },
        { status: 400 }
      );
    }
  }

  // Check if contract is already registered
  const { data: existing } = await supabase
    .from('machines')
    .select('id')
    .eq('game_contract_id', registerRequest.game_contract_id)
    .single();

  if (existing) {
    return json(
      { success: false, error: 'This contract is already registered' },
      { status: 409 }
    );
  }

  // Create the machine with sanitized inputs and active status (since it's an existing contract)
  const { data: machine, error } = await supabase
    .from('machines')
    .insert({
      name: generatedName,
      display_name: sanitizedDisplayName,
      machine_type: registerRequest.machine_type,
      chain: 'voi', // Only Voi contracts can be registered
      game_contract_id: registerRequest.game_contract_id,
      treasury_contract_id: registerRequest.treasury_contract_id || null,
      treasury_asset_id: treasuryAssetId, // ARC200 token contract ID (auto-detected from game contract state)
      config: {},
      min_bet: DEFAULT_MIN_BET_MICROVOI,
      max_bet: DEFAULT_MAX_BET_MICROVOI,
      platform_fee_percent: platformFeePercent,
      platform_treasury_address: platformTreasuryAddress,
      status: 'active',
      is_active: true,
      created_by: profileId,
      launched_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error registering machine:', { error: error.message, code: error.code });

    // Check for unique constraint violation
    if (error.code === '23505') {
      if (error.message.includes('name')) {
        return json(
          { success: false, error: 'A machine with this name already exists' },
          { status: 409 }
        );
      }
      return json(
        { success: false, error: 'This contract is already registered' },
        { status: 409 }
      );
    }

    return json(
      { success: false, error: 'Failed to register machine' },
      { status: 500 }
    );
  }

  return json(
    { success: true, data: machine, message: 'Machine registered successfully' },
    { status: 201 }
  );
}
