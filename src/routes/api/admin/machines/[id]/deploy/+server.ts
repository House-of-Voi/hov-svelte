/**
 * Admin Machine Deploy API
 *
 * POST: Build deployment transactions for a draft machine
 * Returns unsigned transactions for client-side signing
 *
 * Security features:
 * - Rate limiting (1 new deployment per machine per 5 minutes)
 * - Transaction expiry tracking
 * - Deployment state initialization
 *
 * The deployment process is split into phases:
 * - Phase 1: Create game contract
 * - Phase 1b: Bootstrap game contract (after getting app ID)
 * - Phase 2: Create treasury contract
 * - Phase 2b: Bootstrap treasury contract (after getting app ID)
 * - Phase 3: Link treasury to game + transfer ownership
 *
 * Each phase returns transactions that must be signed and submitted
 * before requesting the next phase.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { requirePermission, getCurrentProfileId, PERMISSIONS } from '$lib/auth/admin';
import { machineDeployer } from '$lib/voi/machine-deployer';
import { isValidAddress } from '$lib/voi/address-utils';
import type { Machine, DeploymentState } from '$lib/types/database';
import algosdk from 'algosdk';
import { Buffer } from 'buffer';

// Rate limiting: minimum time between new deployment attempts (5 minutes)
const RATE_LIMIT_MS = 5 * 60 * 1000;

// Transaction validity window (in rounds, approximately 4.5 seconds per round)
// Default validity is 1000 rounds (~75 minutes)
const TRANSACTION_VALIDITY_ROUNDS = 1000;

/**
 * Deployment phases
 */
type DeploymentPhase =
  | 'estimate' // Just get cost estimate
  | 'phase1' // Create game contract
  | 'phase1b' // Bootstrap game contract
  | 'phase2' // Create treasury contract
  | 'phase2b' // Bootstrap treasury contract
  | 'phase3'; // Link + transfer ownership

interface DeployRequest {
  /** Deployer's Voi address (will pay for deployment) */
  deployerAddress: string;
  /** Which phase of deployment to build transactions for */
  phase: DeploymentPhase;
  /** Game contract app ID (required for phase1b, phase2, phase2b, phase3) */
  gameAppId?: number;
  /** Treasury contract app ID (required for phase2b, phase3) */
  treasuryAppId?: number;
}

/**
 * Encode transactions to base64 safely using Buffer
 * This avoids the stack overflow issue with btoa + String.fromCharCode spread
 */
function encodeTransactionsToBase64(transactions: algosdk.Transaction[]): string[] {
  return transactions.map((txn) => {
    const encoded = algosdk.encodeUnsignedTransaction(txn);
    return Buffer.from(encoded).toString('base64');
  });
}

/**
 * Calculate transaction expiry time based on last valid round
 */
function calculateExpiryTime(
  lastValidRound: number | bigint,
  currentRound: number | bigint
): { expiresInRounds: number; expiresInSeconds: number; expiresAt: string } {
  const roundsRemaining = Number(lastValidRound) - Number(currentRound);
  const secondsRemaining = Math.max(0, roundsRemaining * 4.5); // ~4.5 seconds per round

  return {
    expiresInRounds: roundsRemaining,
    expiresInSeconds: Math.floor(secondsRemaining),
    expiresAt: new Date(Date.now() + secondsRemaining * 1000).toISOString()
  };
}

/**
 * POST /api/admin/machines/:id/deploy
 *
 * Build deployment transactions for a machine.
 * Returns unsigned transactions encoded as base64 for client-side signing.
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
    const body: DeployRequest = await request.json();
    const { deployerAddress, phase, gameAppId, treasuryAppId } = body;

    // Validate deployer address
    if (!deployerAddress || !isValidAddress(deployerAddress)) {
      return json(
        { success: false, error: 'Valid deployer address is required' },
        { status: 400 }
      );
    }

    // Validate phase
    const validPhases: DeploymentPhase[] = [
      'estimate',
      'phase1',
      'phase1b',
      'phase2',
      'phase2b',
      'phase3'
    ];
    if (!phase || !validPhases.includes(phase)) {
      return json(
        { success: false, error: `Invalid phase. Must be one of: ${validPhases.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate phase-specific requirements
    if ((phase === 'phase1b' || phase === 'phase2' || phase === 'phase2b' || phase === 'phase3') && !gameAppId) {
      return json(
        { success: false, error: 'gameAppId is required for this phase' },
        { status: 400 }
      );
    }

    if ((phase === 'phase2b' || phase === 'phase3') && !treasuryAppId) {
      return json(
        { success: false, error: 'treasuryAppId is required for this phase' },
        { status: 400 }
      );
    }

    // Fetch machine
    const supabase = createAdminClient();
    const { data: machine, error: fetchError } = await supabase
      .from('machines')
      .select('*')
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

    const typedMachine = machine as Machine;

    // Rate limiting for new deployments (phase1)
    if (phase === 'phase1') {
      const lastAttempt = typedMachine.last_deployment_attempt;
      if (lastAttempt) {
        const timeSinceLastAttempt = Date.now() - new Date(lastAttempt).getTime();
        if (timeSinceLastAttempt < RATE_LIMIT_MS) {
          const waitSeconds = Math.ceil((RATE_LIMIT_MS - timeSinceLastAttempt) / 1000);
          return json(
            {
              success: false,
              error: `Rate limited. Please wait ${waitSeconds} seconds before starting a new deployment.`,
              retryAfter: waitSeconds
            },
            { status: 429 }
          );
        }
      }
    }

    // Validate machine status
    // For estimate and phase1, machine must be in draft or failed status
    // For other phases, machine can be in deploying or bootstrapping status
    if (phase === 'estimate' || phase === 'phase1') {
      if (typedMachine.status !== 'draft' && typedMachine.status !== 'failed') {
        return json(
          { success: false, error: 'Only draft or failed machines can start deployment' },
          { status: 400 }
        );
      }
    } else {
      if (typedMachine.status !== 'deploying' && typedMachine.status !== 'bootstrapping') {
        return json(
          {
            success: false,
            error: `Machine must be in deploying or bootstrapping status. Current: ${typedMachine.status}`
          },
          { status: 400 }
        );
      }
    }

    // Handle estimate phase
    if (phase === 'estimate') {
      const cost = await machineDeployer.estimateDeploymentCost(
        typedMachine.machine_type,
        typedMachine.game_contract_version,
        typedMachine.treasury_contract_version
      );

      return json({
        success: true,
        data: {
          phase: 'estimate',
          cost: {
            gameContractMinBalance: cost.gameContractMinBalance.toString(),
            gameBootstrapCost: cost.gameBootstrapCost.toString(),
            treasuryContractMinBalance: cost.treasuryContractMinBalance.toString(),
            treasuryBootstrapCost: cost.treasuryBootstrapCost.toString(),
            transactionFees: cost.transactionFees.toString(),
            total: cost.total.toString(),
            transactionCount: cost.transactionCount
          },
          // Include existing deployment state if resuming
          deploymentState: typedMachine.deployment_state || null
        }
      });
    }

    // Build transactions based on phase
    let transactions: algosdk.Transaction[] = [];

    switch (phase) {
      case 'phase1': {
        // Update rate limit timestamp and initialize deployment state
        const deploymentState: DeploymentState = {
          currentPhase: 'phase1',
          deployerAddress,
          startedAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString()
        };

        await supabase
          .from('machines')
          .update({
            last_deployment_attempt: new Date().toISOString(),
            deployment_state: deploymentState,
            status: 'deploying',
            deployment_started_at: new Date().toISOString()
          })
          .eq('id', id);

        // Create game contract
        const phased = await machineDeployer.buildPhasedDeployment(typedMachine, deployerAddress);
        transactions = phased.phase1;
        break;
      }

      case 'phase1b': {
        // Bootstrap game contract
        transactions = await machineDeployer.buildGameBootstrapTransactions(
          typedMachine,
          deployerAddress,
          gameAppId!
        );
        break;
      }

      case 'phase2': {
        // Create treasury contract
        transactions = await machineDeployer.buildPhase2Transactions(
          typedMachine,
          deployerAddress,
          gameAppId!
        );
        break;
      }

      case 'phase2b': {
        // Bootstrap treasury contract
        transactions = await machineDeployer.buildPhase2bTransactions(
          typedMachine,
          deployerAddress,
          treasuryAppId!
        );
        break;
      }

      case 'phase3': {
        // Link and transfer ownership
        transactions = await machineDeployer.buildPhase3Transactions(
          typedMachine,
          deployerAddress,
          gameAppId!,
          treasuryAppId!
        );
        break;
      }
    }

    // Encode transactions as base64 for transport (using Buffer for safety)
    const encodedTransactions = encodeTransactionsToBase64(transactions);

    // Get transaction expiry info from first transaction
    let expiryInfo = null;
    if (transactions.length > 0) {
      const algodClient = machineDeployer.getAlgodClient();
      try {
        const status = await algodClient.status().do();
        const currentRound = status.lastRound || status['last-round'];
        const lastValidRound = transactions[0].lastValidRound;
        expiryInfo = calculateExpiryTime(lastValidRound, currentRound);
      } catch (err) {
        console.warn('Could not get current round for expiry calculation:', err);
      }
    }

    // Get cost estimate
    const cost = await machineDeployer.estimateDeploymentCost(
      typedMachine.machine_type,
      typedMachine.game_contract_version,
      typedMachine.treasury_contract_version
    );

    return json({
      success: true,
      data: {
        phase,
        transactions: encodedTransactions,
        transactionCount: transactions.length,
        signerIndexes: transactions.map((_, i) => i),
        cost: {
          gameContractMinBalance: cost.gameContractMinBalance.toString(),
          gameBootstrapCost: cost.gameBootstrapCost.toString(),
          treasuryContractMinBalance: cost.treasuryContractMinBalance.toString(),
          treasuryBootstrapCost: cost.treasuryBootstrapCost.toString(),
          transactionFees: cost.transactionFees.toString(),
          total: cost.total.toString(),
          transactionCount: cost.transactionCount
        },
        nextPhase: getNextPhase(phase),
        expiry: expiryInfo
      }
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
    console.error('Error in machine deploy API:', { error: errorMessage });
    return json(
      { success: false, error: `Deployment failed: ${errorMessage}` },
      { status: 500 }
    );
  }
};

/**
 * Get the next phase after the current phase
 */
function getNextPhase(currentPhase: DeploymentPhase): DeploymentPhase | 'complete' {
  switch (currentPhase) {
    case 'estimate':
      return 'phase1';
    case 'phase1':
      return 'phase1b';
    case 'phase1b':
      return 'phase2';
    case 'phase2':
      return 'phase2b';
    case 'phase2b':
      return 'phase3';
    case 'phase3':
      return 'complete';
    default:
      return 'complete';
  }
}
