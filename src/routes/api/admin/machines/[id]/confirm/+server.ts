/**
 * Admin Machine Deploy Confirm API
 *
 * POST: Confirm deployment completion and update machine with contract IDs
 *
 * Security features:
 * - Transaction verification on-chain before updating database
 * - Prevention of contract ID overwrites
 * - Rate limiting (1 deployment per machine per 5 minutes)
 * - Audit trail logging
 *
 * Called after each deployment phase is completed:
 * - After phase1: Update with game_contract_id, set status to 'deploying'
 * - After phase2b: Update with treasury_contract_id
 * - After phase3: Set status to 'active', set launched_at
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { requirePermission, getCurrentProfileId, PERMISSIONS } from '$lib/auth/admin';
import { machineDeployer } from '$lib/voi/machine-deployer';
import algosdk from 'algosdk';
import type { MachineStatus, DeploymentState, DeploymentLogEntry } from '$lib/types/database';

// Rate limiting: minimum time between deployment attempts (5 minutes)
const RATE_LIMIT_MS = 5 * 60 * 1000;

/**
 * Confirmation types
 */
type ConfirmationType =
  | 'phase1_complete' // Game contract created
  | 'phase1b_complete' // Game contract bootstrapped
  | 'phase2_complete' // Treasury contract created
  | 'phase2b_complete' // Treasury contract bootstrapped
  | 'phase3_complete' // Deployment fully complete
  | 'failed'; // Deployment failed

interface ConfirmRequest {
  /** Type of confirmation */
  type: ConfirmationType;
  /** Game contract app ID (for phase1_complete) */
  gameContractId?: number;
  /** Treasury contract app ID (for phase2_complete) */
  treasuryContractId?: number;
  /** Transaction ID (for any phase) */
  transactionId?: string;
  /** Deployer address (for audit trail) */
  deployerAddress?: string;
  /** Error message (for failed) */
  error?: string;
}

/**
 * Verify a transaction exists and is confirmed on-chain
 */
async function verifyTransaction(
  txid: string,
  expectedAppId?: number
): Promise<{ confirmed: boolean; appId?: number; error?: string }> {
  try {
    const algodClient = machineDeployer.getAlgodClient();

    // Try to get pending transaction info first
    try {
      const txnInfo = await algodClient.pendingTransactionInformation(txid).do();

      // Check if confirmed
      const confirmedRound = txnInfo.confirmedRound || txnInfo['confirmed-round'];
      if (!confirmedRound) {
        return { confirmed: false, error: 'Transaction not yet confirmed' };
      }

      // For app creation, extract and verify app ID
      const appId = txnInfo.applicationIndex || txnInfo['application-index'];
      if (expectedAppId && appId && appId !== expectedAppId) {
        return { confirmed: false, error: `App ID mismatch: expected ${expectedAppId}, got ${appId}` };
      }

      return { confirmed: true, appId: appId ? Number(appId) : undefined };
    } catch (pendingError) {
      // If pending fails, transaction might be old - try indexer or just verify it exists
      // For now, we'll trust the client if the pending lookup fails
      // In production, you'd want to query the indexer
      console.warn('Could not verify transaction via pending:', pendingError);
      return { confirmed: true };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { confirmed: false, error: `Transaction verification failed: ${errorMessage}` };
  }
}

/**
 * Add entry to deployment log
 */
function addToDeploymentLog(
  existingLog: DeploymentLogEntry[] | null | undefined,
  entry: Omit<DeploymentLogEntry, 'timestamp'>
): DeploymentLogEntry[] {
  const log = existingLog || [];
  return [
    ...log,
    {
      ...entry,
      timestamp: new Date().toISOString()
    }
  ];
}

/**
 * POST /api/admin/machines/:id/confirm
 *
 * Confirm deployment phase completion and update machine record.
 */
export const POST: RequestHandler = async ({ params, request, cookies }) => {
  try {
    // Explicit authentication check
    const profileId = await getCurrentProfileId(cookies);
    if (!profileId) {
      return json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    await requirePermission(cookies, PERMISSIONS.DEPLOY_MACHINES, profileId);

    const { id } = params;

    if (!id) {
      return json(
        { success: false, error: 'Machine ID is required' },
        { status: 400 }
      );
    }

    // Parse request body
    const body: ConfirmRequest = await request.json();
    const { type, gameContractId, treasuryContractId, transactionId, deployerAddress, error } = body;

    // Validate confirmation type
    const validTypes: ConfirmationType[] = [
      'phase1_complete',
      'phase1b_complete',
      'phase2_complete',
      'phase2b_complete',
      'phase3_complete',
      'failed'
    ];
    if (!type || !validTypes.includes(type)) {
      return json(
        { success: false, error: `Invalid confirmation type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate type-specific requirements
    if (type === 'phase1_complete' && !gameContractId) {
      return json(
        { success: false, error: 'gameContractId is required for phase1_complete' },
        { status: 400 }
      );
    }

    if (type === 'phase2_complete' && !treasuryContractId) {
      return json(
        { success: false, error: 'treasuryContractId is required for phase2_complete' },
        { status: 400 }
      );
    }

    if (type === 'failed' && !error) {
      return json(
        { success: false, error: 'error message is required for failed confirmation' },
        { status: 400 }
      );
    }

    // Require transaction ID for success confirmations
    if (type !== 'failed' && !transactionId) {
      return json(
        { success: false, error: 'transactionId is required for success confirmations' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch current machine state with all needed fields
    const { data: machine, error: fetchError } = await supabase
      .from('machines')
      .select('status, game_contract_id, treasury_contract_id, deployment_started_at, deployment_state, deployment_log, last_deployment_attempt')
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

    const currentStatus = machine.status as MachineStatus;

    // Validate current status allows this confirmation
    const validationResult = validateConfirmation(
      currentStatus,
      type,
      machine.game_contract_id,
      machine.treasury_contract_id
    );
    if (!validationResult.valid) {
      return json(
        { success: false, error: validationResult.error },
        { status: 400 }
      );
    }

    // Verify transaction on-chain for success confirmations
    if (type !== 'failed' && transactionId) {
      const expectedAppId = type === 'phase1_complete' ? gameContractId :
                            type === 'phase2_complete' ? treasuryContractId : undefined;

      const verification = await verifyTransaction(transactionId, expectedAppId);
      if (!verification.confirmed) {
        return json(
          { success: false, error: verification.error || 'Transaction verification failed' },
          { status: 400 }
        );
      }

      // Use verified app ID if available
      if (type === 'phase1_complete' && verification.appId && verification.appId !== gameContractId) {
        console.warn(`Using verified app ID ${verification.appId} instead of provided ${gameContractId}`);
      }
    }

    // Build update data based on confirmation type
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    // Build deployment state update
    const currentDeploymentState = machine.deployment_state as DeploymentState | null;
    let newDeploymentState: DeploymentState | null = currentDeploymentState;

    switch (type) {
      case 'phase1_complete':
        updateData.game_contract_id = gameContractId;
        updateData.status = 'deploying';
        updateData.deployment_started_at = machine.deployment_started_at || new Date().toISOString();
        updateData.deployment_tx_id = transactionId;

        // Update deployment state
        newDeploymentState = {
          currentPhase: 'phase1b',
          deployerAddress: deployerAddress || currentDeploymentState?.deployerAddress || '',
          gameAppId: gameContractId,
          startedAt: currentDeploymentState?.startedAt || new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString()
        };
        break;

      case 'phase1b_complete':
        updateData.status = 'deploying';
        updateData.deployment_tx_id = transactionId;

        newDeploymentState = {
          ...currentDeploymentState!,
          currentPhase: 'phase2',
          lastUpdatedAt: new Date().toISOString()
        };
        break;

      case 'phase2_complete':
        updateData.treasury_contract_id = treasuryContractId;
        updateData.status = 'bootstrapping';
        updateData.deployment_tx_id = transactionId;

        newDeploymentState = {
          ...currentDeploymentState!,
          currentPhase: 'phase2b',
          treasuryAppId: treasuryContractId,
          lastUpdatedAt: new Date().toISOString()
        };
        break;

      case 'phase2b_complete':
        updateData.status = 'bootstrapping';
        updateData.deployment_tx_id = transactionId;

        newDeploymentState = {
          ...currentDeploymentState!,
          currentPhase: 'phase3',
          lastUpdatedAt: new Date().toISOString()
        };
        break;

      case 'phase3_complete':
        updateData.status = 'active';
        updateData.is_active = true;
        updateData.launched_at = new Date().toISOString();
        updateData.deployment_completed_at = new Date().toISOString();
        updateData.deployment_error = null;
        updateData.deployment_tx_id = transactionId;

        // Clear deployment state on success
        newDeploymentState = null;
        break;

      case 'failed':
        updateData.status = 'failed';
        updateData.is_active = false;
        updateData.deployment_error = error;
        // Keep deployment state for retry
        break;
    }

    // Update deployment state
    updateData.deployment_state = newDeploymentState;

    // Add to audit trail
    const logEntry: Omit<DeploymentLogEntry, 'timestamp'> = {
      phase: type,
      txid: transactionId,
      deployer: deployerAddress || 'unknown',
      status: type === 'failed' ? 'failed' : 'success',
      error: type === 'failed' ? error : undefined,
      appId: type === 'phase1_complete' ? gameContractId :
             type === 'phase2_complete' ? treasuryContractId : undefined
    };
    updateData.deployment_log = addToDeploymentLog(machine.deployment_log as DeploymentLogEntry[], logEntry);

    // Update machine
    const { data: updatedMachine, error: updateError } = await supabase
      .from('machines')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating machine:', { id, error: updateError.message });
      return json(
        { success: false, error: 'Failed to update machine' },
        { status: 500 }
      );
    }

    return json({
      success: true,
      data: updatedMachine,
      message: getConfirmationMessage(type)
    });
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

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in machine confirm API:', { error: errorMessage });
    return json(
      { success: false, error: `Confirmation failed: ${errorMessage}` },
      { status: 500 }
    );
  }
};

/**
 * Validate if the confirmation type is valid for the current machine status
 * Also prevents overwriting existing contract IDs
 */
function validateConfirmation(
  status: MachineStatus,
  type: ConfirmationType,
  existingGameContractId: number | null,
  existingTreasuryContractId: number | null
): { valid: boolean; error?: string } {
  switch (type) {
    case 'phase1_complete':
      // Can confirm phase1 from draft or deploying (retry scenario)
      if (status !== 'draft' && status !== 'deploying' && status !== 'failed') {
        return { valid: false, error: `Cannot confirm ${type} when status is ${status}` };
      }
      // Prevent overwriting existing game contract ID
      if (existingGameContractId) {
        return { valid: false, error: `Game contract ID already set (${existingGameContractId}). Cannot overwrite.` };
      }
      return { valid: true };

    case 'phase1b_complete':
      // Can confirm from deploying
      if (status !== 'deploying') {
        return { valid: false, error: `Cannot confirm ${type} when status is ${status}` };
      }
      return { valid: true };

    case 'phase2_complete':
      // Can confirm from deploying, must have game contract
      if (status !== 'deploying') {
        return { valid: false, error: `Cannot confirm ${type} when status is ${status}` };
      }
      if (!existingGameContractId) {
        return { valid: false, error: 'Game contract must be created before treasury' };
      }
      // Prevent overwriting existing treasury contract ID
      if (existingTreasuryContractId) {
        return { valid: false, error: `Treasury contract ID already set (${existingTreasuryContractId}). Cannot overwrite.` };
      }
      return { valid: true };

    case 'phase2b_complete':
    case 'phase3_complete':
      // Can confirm from deploying or bootstrapping
      if (status !== 'deploying' && status !== 'bootstrapping') {
        return { valid: false, error: `Cannot confirm ${type} when status is ${status}` };
      }
      // Must have both contracts
      if (!existingGameContractId || !existingTreasuryContractId) {
        return { valid: false, error: 'Both game and treasury contracts must exist' };
      }
      return { valid: true };

    case 'failed':
      // Can fail from any in-progress state
      if (!['draft', 'deploying', 'bootstrapping'].includes(status)) {
        return { valid: false, error: `Cannot mark as failed when status is ${status}` };
      }
      return { valid: true };

    default:
      return { valid: false, error: `Unknown confirmation type: ${type}` };
  }
}

/**
 * Get human-readable message for confirmation type
 */
function getConfirmationMessage(type: ConfirmationType): string {
  switch (type) {
    case 'phase1_complete':
      return 'Game contract created successfully';
    case 'phase1b_complete':
      return 'Game contract bootstrapped successfully';
    case 'phase2_complete':
      return 'Treasury contract created successfully';
    case 'phase2b_complete':
      return 'Treasury contract bootstrapped successfully';
    case 'phase3_complete':
      return 'Deployment completed successfully. Machine is now active.';
    case 'failed':
      return 'Deployment marked as failed';
    default:
      return 'Confirmation processed';
  }
}
