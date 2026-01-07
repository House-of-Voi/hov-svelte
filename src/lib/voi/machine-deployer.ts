/**
 * Machine Deployer Service
 *
 * Builds deployment transactions for new game machines.
 * Handles the full deployment sequence:
 * 1. Create game contract (SlotMachine, Keno, etc.)
 * 2. Bootstrap game contract (payment + app call)
 * 3. Create treasury contract (YieldBearingToken)
 * 4. Bootstrap treasury contract (payment + app call)
 * 5. Link treasury to game (set_yield_bearing_source)
 * 6. Transfer game ownership to treasury
 *
 * All transactions are returned unsigned for client-side signing.
 */

import algosdk from 'algosdk';
import { CONTRACT } from 'ulujs';
import { PUBLIC_VOI_NODE_URL } from '$env/static/public';
import type { Machine, MachineType } from '$lib/types/database';
import {
  getGameContractSpec,
  getTreasuryContractSpec,
  getStateSchema,
  getCompiledPrograms,
  type ContractSpec
} from '$lib/contracts/registry';

// Voi network configuration
const VOI_NODE_URL = PUBLIC_VOI_NODE_URL || 'https://testnet-api.voi.nodly.io';

/**
 * Algorand/Voi minimum balance constants
 * Reference: https://developer.algorand.org/docs/get-details/accounts/#minimum-balance
 */

/** Base minimum balance for any account (0.1 VOI = 100,000 microVOI) */
const MIN_BALANCE_BASE = 100_000n;

/** Minimum balance per application created (0.1 VOI) */
const MIN_BALANCE_PER_APP = 100_000n;

/**
 * State schema storage costs per entry
 * Reference: https://developer.algorand.org/docs/get-details/dapps/smart-contracts/apps/#minimum-balance-requirement-for-a-smart-contract
 *
 * Each uint64 costs: 25,000 (base) + 3,500 (key-value) = 28,500 microVOI
 * Each byte slice costs: 25,000 (base) + 25,000 (max 128 bytes) = 50,000 microVOI
 */
const COST_PER_UINT = 28_500n;
const COST_PER_BYTE_SLICE = 50_000n;

/** Transaction fee (0.001 VOI = 1,000 microVOI) */
const TRANSACTION_FEE = 1_000n;

/**
 * Number of transactions in a full deployment:
 * 1. Create game contract
 * 2. Payment for game bootstrap
 * 3. Bootstrap game contract
 * 4. Create treasury contract
 * 5. Payment for treasury bootstrap
 * 6. Bootstrap treasury contract
 * 7. Link treasury to game (set_yield_bearing_source)
 * 8. Transfer game ownership to treasury
 */
const DEPLOYMENT_TRANSACTION_COUNT = 8;

/**
 * Deployment cost breakdown
 */
export interface DeploymentCost {
  /** Cost to create game contract (min balance) */
  gameContractMinBalance: bigint;
  /** Cost to bootstrap game contract */
  gameBootstrapCost: bigint;
  /** Cost to create treasury contract (min balance) */
  treasuryContractMinBalance: bigint;
  /** Cost to bootstrap treasury contract */
  treasuryBootstrapCost: bigint;
  /** Total transaction fees for all deployment transactions */
  transactionFees: bigint;
  /** Total deployment cost */
  total: bigint;
  /** Number of transactions in the deployment group */
  transactionCount: number;
}

/**
 * Result of building deployment transactions
 */
export interface DeploymentTransactions {
  /** Unsigned transactions to be signed and submitted */
  transactions: algosdk.Transaction[];
  /** Indexes of transactions that need signing (all of them) */
  signerIndexes: number[];
  /** Cost breakdown */
  cost: DeploymentCost;
  /** Contract specs used */
  gameContractSpec: ContractSpec;
  treasuryContractSpec: ContractSpec;
}

/**
 * Deployment result after transactions are confirmed
 */
export interface DeploymentResult {
  /** Game contract application ID */
  gameContractId: number;
  /** Treasury contract application ID */
  treasuryContractId: number;
  /** Transaction IDs */
  transactionIds: string[];
}

class MachineDeployer {
  private algodClient: algosdk.Algodv2;

  constructor() {
    this.algodClient = new algosdk.Algodv2('', VOI_NODE_URL, '');
  }

  /**
   * Estimate deployment cost without building transactions
   *
   * @param machineType - Type of game machine
   * @param gameVersion - Game contract version
   * @param treasuryVersion - Treasury contract version
   * @returns Cost breakdown
   */
  async estimateDeploymentCost(
    machineType: MachineType,
    gameVersion: number = 1,
    treasuryVersion: number = 1
  ): Promise<DeploymentCost> {
    const gameSpec = getGameContractSpec(machineType, gameVersion);
    const treasurySpec = getTreasuryContractSpec(treasuryVersion);

    if (!gameSpec) {
      throw new Error(`No game contract found for ${machineType} v${gameVersion}`);
    }
    if (!treasurySpec) {
      throw new Error(`No treasury contract found for v${treasuryVersion}`);
    }

    // Calculate schema-based min balance for contract creation
    const gameSchema = getStateSchema(gameSpec.appSpec);
    const treasurySchema = getStateSchema(treasurySpec.appSpec);

    const gameMinBalance = this.calculateMinBalance(gameSchema);
    const treasuryMinBalance = this.calculateMinBalance(treasurySchema);

    // Get bootstrap costs from contract specs (configurable per version)
    const gameBootstrapCost = gameSpec.bootstrapCost;
    const treasuryBootstrapCost = treasurySpec.bootstrapCost;

    // Transaction fees for all deployment transactions
    const transactionFees = BigInt(DEPLOYMENT_TRANSACTION_COUNT) * TRANSACTION_FEE;

    const total =
      gameMinBalance +
      gameBootstrapCost +
      treasuryMinBalance +
      treasuryBootstrapCost +
      transactionFees;

    return {
      gameContractMinBalance: gameMinBalance,
      gameBootstrapCost,
      treasuryContractMinBalance: treasuryMinBalance,
      treasuryBootstrapCost,
      transactionFees,
      total,
      transactionCount
    };
  }

  /**
   * Calculate minimum balance based on state schema
   * Uses Algorand minimum balance requirements for application state
   */
  private calculateMinBalance(schema: {
    globalByteSlices: number;
    globalUints: number;
    localByteSlices: number;
    localUints: number;
  }): bigint {
    // Base minimum balance for application
    let minBalance = MIN_BALANCE_PER_APP;

    // Add costs for global state storage
    minBalance += BigInt(schema.globalUints) * COST_PER_UINT;
    minBalance += BigInt(schema.globalByteSlices) * COST_PER_BYTE_SLICE;

    // Note: Local state costs are paid by users who opt-in, not by the deployer
    // We don't include local state costs in deployment estimate

    return minBalance;
  }

  /**
   * Build deployment transactions for a machine
   *
   * @param machine - Machine configuration from database
   * @param deployerAddress - Address that will deploy and pay for the contracts
   * @returns Unsigned transaction group
   */
  async buildDeploymentTransactions(
    machine: Machine,
    deployerAddress: string
  ): Promise<DeploymentTransactions> {
    // Get contract specs
    const gameSpec = getGameContractSpec(
      machine.machine_type,
      machine.game_contract_version
    );
    const treasurySpec = getTreasuryContractSpec(machine.treasury_contract_version);

    if (!gameSpec) {
      throw new Error(
        `No game contract found for ${machine.machine_type} v${machine.game_contract_version}`
      );
    }
    if (!treasurySpec) {
      throw new Error(
        `No treasury contract found for v${machine.treasury_contract_version}`
      );
    }

    // Get suggested params
    const suggestedParams = await this.algodClient.getTransactionParams().do();

    // Build transactions
    const transactions: algosdk.Transaction[] = [];

    // 1. Create game contract
    const gameCreateTxn = await this.buildAppCreateTransaction(
      deployerAddress,
      gameSpec,
      suggestedParams
    );
    transactions.push(gameCreateTxn);

    // 2. Bootstrap game contract (payment + app call)
    // Note: We use placeholder app ID (0) - actual ID comes from create txn result
    // The client must update these after getting the created app ID
    const gameBootstrapPayment = this.buildBootstrapPayment(
      deployerAddress,
      algosdk.getApplicationAddress(0).toString(), // Placeholder - will be updated
      gameSpec.bootstrapCost,
      suggestedParams
    );
    transactions.push(gameBootstrapPayment);

    const gameBootstrapCall = this.buildBootstrapCall(
      deployerAddress,
      0, // Placeholder app ID
      gameSpec,
      suggestedParams
    );
    transactions.push(gameBootstrapCall);

    // 3. Create treasury contract
    const treasuryCreateTxn = await this.buildAppCreateTransaction(
      deployerAddress,
      treasurySpec,
      suggestedParams
    );
    transactions.push(treasuryCreateTxn);

    // 4. Bootstrap treasury contract (payment + app call)
    const treasuryBootstrapPayment = this.buildBootstrapPayment(
      deployerAddress,
      algosdk.getApplicationAddress(0).toString(), // Placeholder
      treasurySpec.bootstrapCost,
      suggestedParams
    );
    transactions.push(treasuryBootstrapPayment);

    const treasuryBootstrapCall = this.buildBootstrapCall(
      deployerAddress,
      0, // Placeholder
      treasurySpec,
      suggestedParams
    );
    transactions.push(treasuryBootstrapCall);

    // 5. Link treasury to game (set_yield_bearing_source)
    const linkTxn = this.buildSetYieldBearingSourceCall(
      deployerAddress,
      0, // Treasury app ID (placeholder)
      0, // Game app ID (placeholder)
      treasurySpec,
      suggestedParams
    );
    transactions.push(linkTxn);

    // 6. Transfer game ownership to treasury
    const transferTxn = this.buildTransferOwnershipCall(
      deployerAddress,
      0, // Game app ID (placeholder)
      algosdk.getApplicationAddress(0).toString(), // Treasury address (placeholder)
      gameSpec,
      suggestedParams
    );
    transactions.push(transferTxn);

    // Assign group ID
    algosdk.assignGroupID(transactions);

    // Calculate cost
    const cost = await this.estimateDeploymentCost(
      machine.machine_type,
      machine.game_contract_version,
      machine.treasury_contract_version
    );

    return {
      transactions,
      signerIndexes: transactions.map((_, i) => i), // All need signing
      cost,
      gameContractSpec: gameSpec,
      treasuryContractSpec: treasurySpec
    };
  }

  /**
   * Build a phased deployment - returns transactions for each phase
   * This allows the client to:
   * 1. Create and bootstrap game contract
   * 2. Get the game app ID from results
   * 3. Create and bootstrap treasury contract
   * 4. Get the treasury app ID from results
   * 5. Link and transfer ownership
   */
  async buildPhasedDeployment(
    machine: Machine,
    deployerAddress: string
  ): Promise<{
    phase1: algosdk.Transaction[]; // Create + bootstrap game
    phase2: algosdk.Transaction[]; // Create + bootstrap treasury (needs game app ID)
    phase3: algosdk.Transaction[]; // Link + transfer (needs both app IDs)
    cost: DeploymentCost;
    gameContractSpec: ContractSpec;
    treasuryContractSpec: ContractSpec;
  }> {
    const gameSpec = getGameContractSpec(
      machine.machine_type,
      machine.game_contract_version
    );
    const treasurySpec = getTreasuryContractSpec(machine.treasury_contract_version);

    if (!gameSpec) {
      throw new Error(
        `No game contract found for ${machine.machine_type} v${machine.game_contract_version}`
      );
    }
    if (!treasurySpec) {
      throw new Error(
        `No treasury contract found for v${machine.treasury_contract_version}`
      );
    }

    const suggestedParams = await this.algodClient.getTransactionParams().do();

    // Phase 1: Create and bootstrap game contract
    const phase1: algosdk.Transaction[] = [];
    const gameCreateTxn = await this.buildAppCreateTransaction(
      deployerAddress,
      gameSpec,
      suggestedParams
    );
    phase1.push(gameCreateTxn);

    // Phase 2 and 3 templates will be built by the client after getting app IDs

    const cost = await this.estimateDeploymentCost(
      machine.machine_type,
      machine.game_contract_version,
      machine.treasury_contract_version
    );

    return {
      phase1,
      phase2: [], // Built by client after phase 1 completion
      phase3: [], // Built by client after phase 2 completion
      cost,
      gameContractSpec: gameSpec,
      treasuryContractSpec: treasurySpec
    };
  }

  /**
   * Build Phase 2 transactions (create + bootstrap treasury)
   * Called after Phase 1 is confirmed and game app ID is known
   */
  async buildPhase2Transactions(
    machine: Machine,
    deployerAddress: string,
    gameAppId: number
  ): Promise<algosdk.Transaction[]> {
    const treasurySpec = getTreasuryContractSpec(machine.treasury_contract_version);
    if (!treasurySpec) {
      throw new Error(`No treasury contract found for v${machine.treasury_contract_version}`);
    }

    const suggestedParams = await this.algodClient.getTransactionParams().do();
    const transactions: algosdk.Transaction[] = [];

    // Create treasury contract
    const treasuryCreateTxn = await this.buildAppCreateTransaction(
      deployerAddress,
      treasurySpec,
      suggestedParams
    );
    transactions.push(treasuryCreateTxn);

    return transactions;
  }

  /**
   * Build Phase 2b transactions (bootstrap treasury)
   * Called after treasury is created
   */
  async buildPhase2bTransactions(
    machine: Machine,
    deployerAddress: string,
    treasuryAppId: number
  ): Promise<algosdk.Transaction[]> {
    const treasurySpec = getTreasuryContractSpec(machine.treasury_contract_version);
    if (!treasurySpec) {
      throw new Error(`No treasury contract found for v${machine.treasury_contract_version}`);
    }

    const suggestedParams = await this.algodClient.getTransactionParams().do();
    const transactions: algosdk.Transaction[] = [];

    const treasuryAddress = algosdk.getApplicationAddress(treasuryAppId).toString();

    // Bootstrap payment (use configurable cost from contract spec)
    const bootstrapPayment = this.buildBootstrapPayment(
      deployerAddress,
      treasuryAddress,
      treasurySpec.bootstrapCost,
      suggestedParams
    );
    transactions.push(bootstrapPayment);

    // Bootstrap call
    const bootstrapCall = this.buildBootstrapCall(
      deployerAddress,
      treasuryAppId,
      treasurySpec,
      suggestedParams
    );
    transactions.push(bootstrapCall);

    algosdk.assignGroupID(transactions);

    return transactions;
  }

  /**
   * Build game bootstrap transactions
   * Called after game contract is created
   */
  async buildGameBootstrapTransactions(
    machine: Machine,
    deployerAddress: string,
    gameAppId: number
  ): Promise<algosdk.Transaction[]> {
    const gameSpec = getGameContractSpec(
      machine.machine_type,
      machine.game_contract_version
    );
    if (!gameSpec) {
      throw new Error(
        `No game contract found for ${machine.machine_type} v${machine.game_contract_version}`
      );
    }

    const suggestedParams = await this.algodClient.getTransactionParams().do();
    const transactions: algosdk.Transaction[] = [];

    const gameAddress = algosdk.getApplicationAddress(gameAppId).toString();

    // Bootstrap payment (use configurable cost from contract spec)
    const bootstrapPayment = this.buildBootstrapPayment(
      deployerAddress,
      gameAddress,
      gameSpec.bootstrapCost,
      suggestedParams
    );
    transactions.push(bootstrapPayment);

    // Bootstrap call
    const bootstrapCall = this.buildBootstrapCall(
      deployerAddress,
      gameAppId,
      gameSpec,
      suggestedParams
    );
    transactions.push(bootstrapCall);

    algosdk.assignGroupID(transactions);

    return transactions;
  }

  /**
   * Build Phase 3 transactions (link + transfer ownership)
   * Called after both contracts are created and bootstrapped
   */
  async buildPhase3Transactions(
    machine: Machine,
    deployerAddress: string,
    gameAppId: number,
    treasuryAppId: number
  ): Promise<algosdk.Transaction[]> {
    const gameSpec = getGameContractSpec(
      machine.machine_type,
      machine.game_contract_version
    );
    const treasurySpec = getTreasuryContractSpec(machine.treasury_contract_version);

    if (!gameSpec || !treasurySpec) {
      throw new Error('Contract specs not found');
    }

    const suggestedParams = await this.algodClient.getTransactionParams().do();
    const transactions: algosdk.Transaction[] = [];

    const treasuryAddress = algosdk.getApplicationAddress(treasuryAppId).toString();

    // Link treasury to game
    const linkTxn = this.buildSetYieldBearingSourceCall(
      deployerAddress,
      treasuryAppId,
      gameAppId,
      treasurySpec,
      suggestedParams
    );
    transactions.push(linkTxn);

    // Transfer game ownership to treasury
    const transferTxn = this.buildTransferOwnershipCall(
      deployerAddress,
      gameAppId,
      treasuryAddress,
      gameSpec,
      suggestedParams
    );
    transactions.push(transferTxn);

    algosdk.assignGroupID(transactions);

    return transactions;
  }

  /**
   * Build an application create transaction
   */
  private async buildAppCreateTransaction(
    sender: string,
    spec: ContractSpec,
    suggestedParams: algosdk.SuggestedParams
  ): Promise<algosdk.Transaction> {
    const { approvalProgram, clearProgram } = getCompiledPrograms(spec.appSpec);
    const schema = getStateSchema(spec.appSpec);

    // Decode base64 TEAL to Uint8Array
    const approvalBytes = Uint8Array.from(atob(approvalProgram), (c) => c.charCodeAt(0));
    const clearBytes = Uint8Array.from(atob(clearProgram), (c) => c.charCodeAt(0));

    return algosdk.makeApplicationCreateTxnFromObject({
      sender,
      approvalProgram: approvalBytes,
      clearProgram: clearBytes,
      numGlobalByteSlices: schema.globalByteSlices,
      numGlobalInts: schema.globalUints,
      numLocalByteSlices: schema.localByteSlices,
      numLocalInts: schema.localUints,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      suggestedParams
    });
  }

  /**
   * Build a bootstrap payment transaction
   */
  private buildBootstrapPayment(
    sender: string,
    receiver: string,
    amount: bigint,
    suggestedParams: algosdk.SuggestedParams
  ): algosdk.Transaction {
    return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender,
      receiver,
      amount: Number(amount),
      suggestedParams
    });
  }

  /**
   * Build a bootstrap app call transaction
   */
  private buildBootstrapCall(
    sender: string,
    appId: number,
    spec: ContractSpec,
    suggestedParams: algosdk.SuggestedParams
  ): algosdk.Transaction {
    // Get the bootstrap method selector
    const bootstrapSelector = this.getMethodSelector(spec.appSpec, 'bootstrap');

    return algosdk.makeApplicationCallTxnFromObject({
      sender,
      appIndex: appId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [bootstrapSelector],
      suggestedParams
    });
  }

  /**
   * Build set_yield_bearing_source call
   */
  private buildSetYieldBearingSourceCall(
    sender: string,
    treasuryAppId: number,
    gameAppId: number,
    treasurySpec: ContractSpec,
    suggestedParams: algosdk.SuggestedParams
  ): algosdk.Transaction {
    const methodSelector = this.getMethodSelector(
      treasurySpec.appSpec,
      'set_yield_bearing_source'
    );

    // Encode the game app ID as uint64
    const gameAppIdArg = algosdk.encodeUint64(gameAppId);

    return algosdk.makeApplicationCallTxnFromObject({
      sender,
      appIndex: treasuryAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [methodSelector, gameAppIdArg],
      foreignApps: [gameAppId],
      suggestedParams
    });
  }

  /**
   * Build transfer_ownership call
   */
  private buildTransferOwnershipCall(
    sender: string,
    gameAppId: number,
    newOwnerAddress: string,
    gameSpec: ContractSpec,
    suggestedParams: algosdk.SuggestedParams
  ): algosdk.Transaction {
    const methodSelector = this.getMethodSelector(gameSpec.appSpec, 'transfer_ownership');

    // Encode the new owner address
    const newOwnerArg = algosdk.decodeAddress(newOwnerAddress).publicKey;

    return algosdk.makeApplicationCallTxnFromObject({
      sender,
      appIndex: gameAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [methodSelector, newOwnerArg],
      suggestedParams
    });
  }

  /**
   * Get the ABI method selector for a method name
   */
  private getMethodSelector(appSpec: unknown, methodName: string): Uint8Array {
    const spec = appSpec as {
      contract?: { methods?: Array<{ name: string; args?: Array<{ type: string; name?: string }>; returns?: { type: string } }> };
    };
    const methods = spec?.contract?.methods || [];
    const method = methods.find((m) => m.name === methodName);

    if (!method) {
      throw new Error(`Method ${methodName} not found in contract ABI`);
    }

    // Create ABIMethod and get selector
    const abiMethod = new algosdk.ABIMethod({
      name: method.name,
      args: (method.args || []).map((a) => ({ type: a.type, name: a.name || '' })),
      returns: { type: method.returns?.type || 'void' }
    });

    return abiMethod.getSelector();
  }

  /**
   * Get the algod client for external use
   */
  getAlgodClient(): algosdk.Algodv2 {
    return this.algodClient;
  }
}

// Export singleton instance
export const machineDeployer = new MachineDeployer();

// Export class for testing
export { MachineDeployer };
