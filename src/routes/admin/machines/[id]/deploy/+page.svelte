<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { signTransactions } from 'avm-wallet-svelte';
  import algosdk from 'algosdk';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import WalletConnectAdmin from '$lib/components/admin/WalletConnectAdmin.svelte';
  import MachineStatusBadge from '$lib/components/admin/machines/MachineStatusBadge.svelte';
  import MachineTypeBadge from '$lib/components/admin/machines/MachineTypeBadge.svelte';
  import { notificationStore } from '$lib/stores/notificationStore.svelte';
  import { PUBLIC_VOI_NODE_URL } from '$env/static/public';
  import type { PageData } from './$types';
  import type { DeploymentState } from '$lib/types/database';

  let { data }: { data: PageData } = $props();

  let machine = $derived(data.machine);

  // Deployment state
  type DeploymentPhase = 'wallet' | 'estimate' | 'phase1' | 'phase1b' | 'phase2' | 'phase2b' | 'phase3' | 'complete' | 'failed';

  let currentPhase = $state<DeploymentPhase>('wallet');
  let deployerAddress = $state('');
  let isProcessing = $state(false);
  let error = $state('');

  // Contract IDs from deployment
  let gameAppId = $state<number | null>(null);
  let treasuryAppId = $state<number | null>(null);

  // Error classification for better UX
  type ErrorType = 'insufficient_funds' | 'user_rejected' | 'network_error' | 'contract_exists' | 'unknown';

  interface ClassifiedError {
    type: ErrorType;
    message: string;
    guidance: string;
    recoverable: boolean;
  }

  function classifyError(errorMessage: string): ClassifiedError {
    // Handle null/undefined gracefully
    if (!errorMessage) {
      return {
        type: 'unknown',
        message: 'An unknown error occurred',
        guidance: 'Please try again or contact support.',
        recoverable: true
      };
    }

    const lowerError = errorMessage.toLowerCase();

    // Check for insufficient funds
    if (
      lowerError.includes('insufficient') ||
      lowerError.includes('balance') ||
      lowerError.includes('overspend') ||
      lowerError.includes('underflow') ||
      lowerError.includes('below min')
    ) {
      return {
        type: 'insufficient_funds',
        message: 'Insufficient funds to complete deployment',
        guidance:
          'Your wallet does not have enough VOI to cover the deployment costs. Please add more VOI to your wallet and try again.',
        recoverable: true
      };
    }

    // Check for user rejection
    if (
      lowerError.includes('rejected') ||
      lowerError.includes('cancelled') ||
      lowerError.includes('canceled') ||
      lowerError.includes('denied') ||
      lowerError.includes('user refused')
    ) {
      return {
        type: 'user_rejected',
        message: 'Transaction was rejected',
        guidance:
          'You rejected the transaction in your wallet. Click "Retry" to try again when ready.',
        recoverable: true
      };
    }

    // Check for network errors
    if (
      lowerError.includes('network') ||
      lowerError.includes('timeout') ||
      lowerError.includes('connection') ||
      lowerError.includes('fetch') ||
      lowerError.includes('failed to fetch') ||
      lowerError.includes('econnrefused')
    ) {
      return {
        type: 'network_error',
        message: 'Network error occurred',
        guidance:
          'There was a problem connecting to the blockchain. Please check your internet connection and try again.',
        recoverable: true
      };
    }

    // Check for contract already exists
    if (
      lowerError.includes('already exists') ||
      lowerError.includes('already set') ||
      lowerError.includes('cannot overwrite')
    ) {
      return {
        type: 'contract_exists',
        message: 'Contract already deployed',
        guidance:
          'This machine already has contracts deployed. If this is unexpected, please contact support.',
        recoverable: false
      };
    }

    // Default unknown error
    return {
      type: 'unknown',
      message: errorMessage,
      guidance:
        'An unexpected error occurred. You can retry the deployment or contact support if the issue persists.',
      recoverable: true
    };
  }

  let classifiedError = $state<ClassifiedError | null>(null);

  // Cost estimate
  let costEstimate = $state<{
    gameContractMinBalance: string;
    gameBootstrapCost: string;
    treasuryContractMinBalance: string;
    treasuryBootstrapCost: string;
    transactionFees: string;
    total: string;
    transactionCount: number;
  } | null>(null);

  // Progress tracking
  let completedPhases = $state<string[]>([]);

  const algodClient = new algosdk.Algodv2('', PUBLIC_VOI_NODE_URL || 'https://testnet-api.voi.nodly.io', '');

  /**
   * Restore deployment state from machine data on mount
   * This allows resuming interrupted deployments after page refresh
   */
  onMount(() => {
    restoreDeploymentState();
  });

  function restoreDeploymentState() {
    // Check if machine has existing contract IDs
    if (machine.game_contract_id) {
      gameAppId = machine.game_contract_id;
      completedPhases = [...completedPhases, 'phase1', 'phase1b'];
    }

    if (machine.treasury_contract_id) {
      treasuryAppId = machine.treasury_contract_id;
      completedPhases = [...completedPhases, 'phase2', 'phase2b'];
    }

    // Check if machine has persisted deployment state
    const savedState = machine.deployment_state as DeploymentState | null;
    if (savedState) {
      // Restore deployer address
      if (savedState.deployerAddress) {
        deployerAddress = savedState.deployerAddress;
      }

      // Restore contract IDs from state
      if (savedState.gameAppId && !gameAppId) {
        gameAppId = savedState.gameAppId;
      }
      if (savedState.treasuryAppId && !treasuryAppId) {
        treasuryAppId = savedState.treasuryAppId;
      }

      // Determine current phase based on saved state
      if (savedState.currentPhase && savedState.currentPhase !== 'complete') {
        // If we have a deployer address, skip to the saved phase
        if (deployerAddress) {
          currentPhase = savedState.currentPhase as DeploymentPhase;
          notificationStore.info(`Resuming deployment from ${phaseLabels[currentPhase]}`);
        }
      }
    }

    // Handle machine status
    if (machine.status === 'active') {
      // Already deployed
      currentPhase = 'complete';
      gameAppId = machine.game_contract_id || null;
      treasuryAppId = machine.treasury_contract_id || null;
    } else if (machine.status === 'failed') {
      // Failed deployment - allow retry
      currentPhase = 'failed';
      error = machine.deployment_error || 'Previous deployment failed';
      // Classify the restored error for proper UI display
      classifiedError = classifyError(error);
    }
  }

  const formatMicroVoi = (microVoi: string | number) => {
    const value = typeof microVoi === 'string' ? parseInt(microVoi) : microVoi;
    return (value / 1_000_000).toFixed(4);
  };

  const shortAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const phaseLabels: Record<DeploymentPhase, string> = {
    wallet: 'Connect Wallet',
    estimate: 'Review Cost',
    phase1: 'Create Game Contract',
    phase1b: 'Bootstrap Game',
    phase2: 'Create Treasury',
    phase2b: 'Bootstrap Treasury',
    phase3: 'Link & Transfer',
    complete: 'Complete',
    failed: 'Failed'
  };

  const phaseDescriptions: Record<DeploymentPhase, string> = {
    wallet: 'Connect your wallet to pay for deployment',
    estimate: 'Review the deployment cost before proceeding',
    phase1: 'Creating the game contract on the blockchain',
    phase1b: 'Bootstrapping the game contract with initial funds',
    phase2: 'Creating the treasury (YBT) contract',
    phase2b: 'Bootstrapping the treasury contract',
    phase3: 'Linking treasury to game and transferring ownership',
    complete: 'Deployment completed successfully!',
    failed: 'Deployment failed. You can retry from where you left off.'
  };

  function handleWalletSelected(address: string) {
    deployerAddress = address;
    error = '';
  }

  async function fetchCostEstimate() {
    if (!deployerAddress) {
      error = 'Please select a wallet first';
      return;
    }

    isProcessing = true;
    error = '';

    try {
      const response = await fetch(`/api/admin/machines/${machine.id}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deployerAddress,
          phase: 'estimate'
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to get cost estimate');
      }

      costEstimate = result.data.cost;
      currentPhase = 'estimate';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to get cost estimate';
    } finally {
      isProcessing = false;
    }
  }

  async function executeDeploymentPhase(phase: string) {
    isProcessing = true;
    error = '';

    try {
      // Build request body based on phase
      const requestBody: Record<string, unknown> = {
        deployerAddress,
        phase
      };

      if (gameAppId) requestBody.gameAppId = gameAppId;
      if (treasuryAppId) requestBody.treasuryAppId = treasuryAppId;

      // Request unsigned transactions
      const response = await fetch(`/api/admin/machines/${machine.id}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to build transactions');
      }

      const { transactions: encodedTxns } = result.data;

      // Decode transactions
      const transactions = encodedTxns.map((b64: string) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        return algosdk.decodeUnsignedTransaction(bytes);
      });

      // Sign transactions using avm-wallet-svelte
      notificationStore.info('Please sign the transaction in your wallet');
      const signedTxns = await signTransactions([transactions]);

      // Flatten signed transactions
      const signedBlobs = signedTxns.map((s) =>
        s instanceof Uint8Array ? s : (s as { blob: Uint8Array }).blob || new Uint8Array(s as unknown as number[])
      );

      // Submit to network
      const { txid } = await algodClient.sendRawTransaction(signedBlobs).do();

      // Wait for confirmation
      notificationStore.info('Waiting for confirmation...');
      const confirmedTxn = await algosdk.waitForConfirmation(algodClient, txid, 4);

      // Extract app ID if this was a create transaction
      let newAppId: number | undefined;
      if (confirmedTxn.applicationIndex) {
        newAppId = Number(confirmedTxn.applicationIndex);
      }

      // Determine confirmation type and update state
      let confirmationType: string;
      let confirmBody: Record<string, unknown> = { transactionId: txid };

      switch (phase) {
        case 'phase1':
          confirmationType = 'phase1_complete';
          if (newAppId) {
            gameAppId = newAppId;
            confirmBody.gameContractId = newAppId;
          }
          break;
        case 'phase1b':
          confirmationType = 'phase1b_complete';
          break;
        case 'phase2':
          confirmationType = 'phase2_complete';
          if (newAppId) {
            treasuryAppId = newAppId;
            confirmBody.treasuryContractId = newAppId;
          }
          break;
        case 'phase2b':
          confirmationType = 'phase2b_complete';
          break;
        case 'phase3':
          confirmationType = 'phase3_complete';
          break;
        default:
          throw new Error(`Unknown phase: ${phase}`);
      }

      // Confirm completion with server (include deployer address for audit trail)
      const confirmResponse = await fetch(`/api/admin/machines/${machine.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: confirmationType, deployerAddress, ...confirmBody })
      });

      const confirmResult = await confirmResponse.json();

      if (!confirmResult.success) {
        throw new Error(confirmResult.error || 'Failed to confirm deployment phase');
      }

      // Update UI state
      completedPhases = [...completedPhases, phase];
      notificationStore.success(`${phaseLabels[phase as DeploymentPhase]} completed!`);

      // Move to next phase
      const nextPhaseMap: Record<string, DeploymentPhase> = {
        phase1: 'phase1b',
        phase1b: 'phase2',
        phase2: 'phase2b',
        phase2b: 'phase3',
        phase3: 'complete'
      };
      currentPhase = nextPhaseMap[phase] || 'complete';

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Deployment failed';
      error = errorMessage;

      // Classify the error for better UX
      classifiedError = classifyError(errorMessage);

      // Report failure to server
      try {
        await fetch(`/api/admin/machines/${machine.id}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'failed',
            error: errorMessage,
            errorType: classifiedError.type
          })
        });
      } catch {
        // Ignore confirm error
      }

      currentPhase = 'failed';
      notificationStore.error(classifiedError.message);
    } finally {
      isProcessing = false;
    }
  }

  function startDeployment() {
    error = '';
    classifiedError = null;
    currentPhase = 'phase1';
    executeDeploymentPhase('phase1');
  }

  function continueDeployment() {
    error = '';
    classifiedError = null;
    executeDeploymentPhase(currentPhase);
  }

  function retryDeployment() {
    error = '';
    classifiedError = null;
    // Retry from the last incomplete phase
    const phaseToRetry = getLastIncompletePhase();
    currentPhase = phaseToRetry as DeploymentPhase;
    executeDeploymentPhase(phaseToRetry);
  }

  function getLastIncompletePhase(): string {
    const phases = ['phase1', 'phase1b', 'phase2', 'phase2b', 'phase3'];
    for (const phase of phases) {
      if (!completedPhases.includes(phase)) {
        return phase;
      }
    }
    return 'phase1';
  }

  function goToMachine() {
    goto(`/admin/machines/${machine.id}`);
  }

  const canProceed = $derived(deployerAddress && !isProcessing);
  const isDeploying = $derived(['phase1', 'phase1b', 'phase2', 'phase2b', 'phase3'].includes(currentPhase));
</script>

<svelte:head>
  <title>Deploy {machine.display_name} - Admin - House of Voi</title>
</svelte:head>

<div class="space-y-8 max-w-3xl mx-auto">
  <!-- Header -->
  <div class="flex items-center justify-between flex-wrap gap-4">
    <div>
      <div class="flex items-center gap-3 flex-wrap">
        <h1 class="text-3xl font-semibold text-neutral-950 dark:text-white uppercase">
          Deploy Machine
        </h1>
      </div>
      <p class="text-neutral-500 mt-2">
        {machine.display_name}
        <span class="font-mono text-sm">({machine.name})</span>
      </p>
    </div>
    <div class="flex gap-2 flex-wrap items-center">
      <MachineStatusBadge status={machine.status} />
      <MachineTypeBadge type={machine.machine_type} />
      <a href="/admin/machines/{machine.id}">
        <Button variant="ghost" size="sm">Back to Machine</Button>
      </a>
    </div>
  </div>

  <!-- Progress Steps -->
  <div class="flex items-center justify-between overflow-x-auto pb-2">
    {#each ['wallet', 'estimate', 'phase1', 'phase1b', 'phase2', 'phase2b', 'phase3', 'complete'] as step, i}
      {@const isActive = currentPhase === step}
      {@const isCompleted = completedPhases.includes(step) ||
        (step === 'wallet' && deployerAddress) ||
        (step === 'estimate' && costEstimate) ||
        (step === 'complete' && currentPhase === 'complete')}
      {@const isFailed = currentPhase === 'failed' && step === getLastIncompletePhase()}

      <div class="flex items-center {i < 7 ? 'flex-1' : ''}">
        <div class="flex flex-col items-center">
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
            {isActive ? 'bg-primary-500 text-white' : ''}
            {isCompleted && !isActive ? 'bg-success-500 text-white' : ''}
            {isFailed ? 'bg-error-500 text-white' : ''}
            {!isActive && !isCompleted && !isFailed ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500' : ''}">
            {#if isCompleted && !isActive}
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
            {:else if isFailed}
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            {:else}
              {i + 1}
            {/if}
          </div>
          <span class="text-xs mt-1 text-neutral-500 whitespace-nowrap hidden md:block">
            {step === 'phase1' ? 'Game' : step === 'phase1b' ? 'Bootstrap' : step === 'phase2' ? 'Treasury' : step === 'phase2b' ? 'Bootstrap' : step === 'phase3' ? 'Link' : step.charAt(0).toUpperCase() + step.slice(1)}
          </span>
        </div>
        {#if i < 7}
          <div class="flex-1 h-0.5 mx-2 {isCompleted ? 'bg-success-500' : 'bg-neutral-200 dark:bg-neutral-700'}"></div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Current Phase Content -->
  <Card>
    <CardHeader>
      <h2 class="text-xl font-bold text-neutral-900 dark:text-neutral-100 uppercase">
        {phaseLabels[currentPhase]}
      </h2>
      <p class="text-neutral-500 text-sm mt-1">
        {phaseDescriptions[currentPhase]}
      </p>
    </CardHeader>
    <CardContent class="space-y-6">

      {#if currentPhase === 'wallet'}
        <WalletConnectAdmin
          onWalletSelected={handleWalletSelected}
          selectedAddress={deployerAddress}
          {error}
          disabled={isProcessing}
        />

        <div class="flex justify-end pt-4 border-t border-neutral-700">
          <Button variant="primary" onclick={fetchCostEstimate} disabled={!canProceed}>
            {isProcessing ? 'Loading...' : 'Continue'}
          </Button>
        </div>

      {:else if currentPhase === 'estimate'}
        {#if costEstimate}
          <div class="space-y-4">
            <div class="bg-neutral-800/50 rounded-lg p-4 space-y-3">
              <div class="flex justify-between">
                <span class="text-neutral-400">Game Contract Creation</span>
                <span class="text-neutral-200 font-mono">{formatMicroVoi(costEstimate.gameContractMinBalance)} VOI</span>
              </div>
              <div class="flex justify-between">
                <span class="text-neutral-400">Game Bootstrap</span>
                <span class="text-neutral-200 font-mono">{formatMicroVoi(costEstimate.gameBootstrapCost)} VOI</span>
              </div>
              <div class="flex justify-between">
                <span class="text-neutral-400">Treasury Contract Creation</span>
                <span class="text-neutral-200 font-mono">{formatMicroVoi(costEstimate.treasuryContractMinBalance)} VOI</span>
              </div>
              <div class="flex justify-between">
                <span class="text-neutral-400">Treasury Bootstrap</span>
                <span class="text-neutral-200 font-mono">{formatMicroVoi(costEstimate.treasuryBootstrapCost)} VOI</span>
              </div>
              <div class="flex justify-between">
                <span class="text-neutral-400">Transaction Fees ({costEstimate.transactionCount} txns)</span>
                <span class="text-neutral-200 font-mono">{formatMicroVoi(costEstimate.transactionFees)} VOI</span>
              </div>
              <div class="border-t border-neutral-700 pt-3 flex justify-between">
                <span class="text-neutral-200 font-semibold">Total Deployment Cost</span>
                <span class="text-primary-400 font-mono font-bold">{formatMicroVoi(costEstimate.total)} VOI</span>
              </div>
            </div>

            <div class="bg-warning-500/10 border border-warning-500/30 rounded-lg p-4">
              <p class="text-warning-400 text-sm">
                <strong>Important:</strong> Deployment requires multiple transactions that must be signed in your wallet.
                The deployer address <span class="font-mono">{shortAddress(deployerAddress)}</span> will pay for all costs.
              </p>
            </div>
          </div>
        {/if}

        {#if error}
          <div class="bg-error-500/10 border border-error-500/30 rounded-lg p-4">
            <p class="text-error-400 text-sm">{error}</p>
          </div>
        {/if}

        <div class="flex justify-between pt-4 border-t border-neutral-700">
          <Button variant="ghost" onclick={() => currentPhase = 'wallet'}>
            Back
          </Button>
          <Button variant="primary" onclick={startDeployment} disabled={isProcessing}>
            {isProcessing ? 'Starting...' : 'Start Deployment'}
          </Button>
        </div>

      {:else if isDeploying}
        <div class="text-center py-8">
          {#if isProcessing}
            <div class="animate-spin w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p class="text-neutral-300">{phaseDescriptions[currentPhase]}</p>
            <p class="text-neutral-500 text-sm mt-2">Please approve the transaction in your wallet...</p>
          {:else}
            <p class="text-neutral-300 mb-4">Ready to continue with {phaseLabels[currentPhase]}</p>
            <Button variant="primary" onclick={continueDeployment}>
              Continue
            </Button>
          {/if}
        </div>

        {#if gameAppId || treasuryAppId}
          <div class="bg-neutral-800/50 rounded-lg p-4 space-y-2">
            {#if gameAppId}
              <div class="flex justify-between">
                <span class="text-neutral-400">Game Contract ID</span>
                <span class="text-success-400 font-mono">{gameAppId}</span>
              </div>
            {/if}
            {#if treasuryAppId}
              <div class="flex justify-between">
                <span class="text-neutral-400">Treasury Contract ID</span>
                <span class="text-success-400 font-mono">{treasuryAppId}</span>
              </div>
            {/if}
          </div>
        {/if}

        {#if error}
          <div class="bg-error-500/10 border border-error-500/30 rounded-lg p-4">
            <p class="text-error-400 text-sm">{error}</p>
          </div>
        {/if}

      {:else if currentPhase === 'complete'}
        <div class="text-center py-8">
          <div class="w-16 h-16 bg-success-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 class="text-xl font-bold text-success-400 mb-2">Deployment Complete!</h3>
          <p class="text-neutral-400 mb-6">Your machine is now active on the blockchain.</p>

          <div class="bg-neutral-800/50 rounded-lg p-4 space-y-2 mb-6 max-w-sm mx-auto">
            <div class="flex justify-between">
              <span class="text-neutral-400">Game Contract ID</span>
              <span class="text-success-400 font-mono">{gameAppId}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-neutral-400">Treasury Contract ID</span>
              <span class="text-success-400 font-mono">{treasuryAppId}</span>
            </div>
          </div>

          <Button variant="primary" onclick={goToMachine}>
            View Machine
          </Button>
        </div>

      {:else if currentPhase === 'failed'}
        <div class="text-center py-8">
          <!-- Error type icon -->
          <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4
            {classifiedError?.type === 'insufficient_funds' ? 'bg-warning-500' :
             classifiedError?.type === 'user_rejected' ? 'bg-neutral-500' :
             classifiedError?.type === 'network_error' ? 'bg-blue-500' :
             'bg-error-500'}">
            {#if classifiedError?.type === 'insufficient_funds'}
              <svg class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            {:else if classifiedError?.type === 'user_rejected'}
              <svg class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            {:else if classifiedError?.type === 'network_error'}
              <svg class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              </svg>
            {:else}
              <svg class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            {/if}
          </div>

          <h3 class="text-xl font-bold mb-2
            {classifiedError?.type === 'insufficient_funds' ? 'text-warning-400' :
             classifiedError?.type === 'user_rejected' ? 'text-neutral-300' :
             classifiedError?.type === 'network_error' ? 'text-blue-400' :
             'text-error-400'}">
            {classifiedError?.message || 'Deployment Failed'}
          </h3>

          <!-- Guidance message -->
          <div class="max-w-md mx-auto mb-6">
            <p class="text-neutral-400 mb-4">
              {classifiedError?.guidance || 'An error occurred during deployment.'}
            </p>

            {#if classifiedError?.type === 'insufficient_funds' && costEstimate}
              <div class="bg-warning-500/10 border border-warning-500/30 rounded-lg p-3 text-sm">
                <p class="text-warning-400">
                  Required: approximately <span class="font-mono font-bold">{formatMicroVoi(costEstimate.total)} VOI</span>
                </p>
              </div>
            {/if}
          </div>

          <!-- Progress so far -->
          {#if gameAppId || treasuryAppId}
            <div class="bg-neutral-800/50 rounded-lg p-4 space-y-2 mb-6 max-w-sm mx-auto">
              <p class="text-neutral-500 text-xs uppercase tracking-wider mb-2">Progress Saved</p>
              {#if gameAppId}
                <div class="flex justify-between">
                  <span class="text-neutral-400">Game Contract ID</span>
                  <span class="text-success-400 font-mono">{gameAppId}</span>
                </div>
              {/if}
              {#if treasuryAppId}
                <div class="flex justify-between">
                  <span class="text-neutral-400">Treasury Contract ID</span>
                  <span class="text-success-400 font-mono">{treasuryAppId}</span>
                </div>
              {/if}
              <p class="text-neutral-500 text-xs mt-2">
                Your progress has been saved. You can resume from the last completed phase.
              </p>
            </div>
          {/if}

          <!-- Technical error details (collapsed by default) -->
          {#if error && classifiedError?.type === 'unknown'}
            <details class="max-w-md mx-auto mb-6 text-left">
              <summary class="text-neutral-500 text-sm cursor-pointer hover:text-neutral-400">
                Show technical details
              </summary>
              <pre class="mt-2 p-3 bg-neutral-900 rounded text-xs text-error-400 overflow-x-auto whitespace-pre-wrap">{error}</pre>
            </details>
          {/if}

          <div class="flex gap-3 justify-center">
            <Button variant="ghost" onclick={goToMachine}>
              Back to Machine
            </Button>
            {#if classifiedError?.recoverable !== false}
              <Button variant="primary" onclick={retryDeployment}>
                Retry
              </Button>
            {/if}
          </div>
        </div>
      {/if}

    </CardContent>
  </Card>

  <!-- Machine Info -->
  <Card>
    <CardHeader>
      <h2 class="text-lg font-bold text-neutral-900 dark:text-neutral-100 uppercase">
        Machine Configuration
      </h2>
    </CardHeader>
    <CardContent>
      <div class="grid md:grid-cols-2 gap-4 text-sm">
        <div class="flex justify-between py-2 border-b border-neutral-700">
          <span class="text-neutral-500">Type:</span>
          <MachineTypeBadge type={machine.machine_type} />
        </div>
        <div class="flex justify-between py-2 border-b border-neutral-700">
          <span class="text-neutral-500">Chain:</span>
          <span class="text-neutral-200 uppercase">{machine.chain}</span>
        </div>
        <div class="flex justify-between py-2 border-b border-neutral-700">
          <span class="text-neutral-500">Min Bet:</span>
          <span class="text-neutral-200">{formatMicroVoi(machine.min_bet)} VOI</span>
        </div>
        <div class="flex justify-between py-2 border-b border-neutral-700">
          <span class="text-neutral-500">Max Bet:</span>
          <span class="text-neutral-200">{formatMicroVoi(machine.max_bet)} VOI</span>
        </div>
        <div class="flex justify-between py-2 border-b border-neutral-700">
          <span class="text-neutral-500">Platform Fee:</span>
          <span class="text-neutral-200">{machine.platform_fee_percent}%</span>
        </div>
        <div class="flex justify-between py-2 border-b border-neutral-700">
          <span class="text-neutral-500">Contract Version:</span>
          <span class="text-neutral-200">v{machine.game_contract_version}</span>
        </div>
      </div>
    </CardContent>
  </Card>
</div>
