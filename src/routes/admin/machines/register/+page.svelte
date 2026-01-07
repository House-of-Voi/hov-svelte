<script lang="ts">
  import { goto } from '$app/navigation';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { notificationStore } from '$lib/stores/notificationStore.svelte';
  import type { MachineType } from '$lib/types/database';

  // Validation constants
  const MAX_DISPLAY_NAME_LENGTH = 100;
  const VOI_ADDRESS_LENGTH = 58;
  const BASE32_REGEX = /^[A-Z2-7]+$/;

  // Contract references from API
  interface ContractRefs {
    tokenAppId: number | null;
    storageAppId: number | null;
    safeJackpotAppId: number | null;
    safeFeeAppId: number | null;
  }

  // Fee configuration from API
  interface FeeConfig {
    treasuryBps: number;
    treasuryAddress: string;
    marketingBps: number;
    marketingAddress: string;
  }

  // Contract state from API
  interface GameContractState {
    type: 'game';
    appId: number;
    contractAddress: string;
    owner: string;
    bootstrapped: boolean;
    balanceTotal: string;
    balanceAvailable: string;
    balanceLocked: string;
    balanceFuse: boolean;
    modeEnabled: number;
    contractRefs: ContractRefs;
    feeConfig: FeeConfig | null;
    detectedVersion?: number;
  }

  interface TreasuryContractState {
    type: 'treasury';
    appId: number;
    contractAddress: string;
    owner: string;
    bootstrapped: boolean;
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: string;
    yieldBearingSource: number | null;
  }

  // Standardized API response interface
  interface ContractStateApiResponse {
    success: boolean;
    data?: {
      type: 'game' | 'treasury';
      data: GameContractState | TreasuryContractState;
    };
    error?: string;
  }

  // Form state
  let gameContractId = $state('');
  let treasuryContractId = $state('');

  // Loaded state
  let gameState = $state<GameContractState | null>(null);
  let treasuryState = $state<TreasuryContractState | null>(null);
  let validationResult = $state<{ valid: boolean; errors: string[] } | null>(null);

  // Loading states
  let loadingGame = $state(false);
  let loadingTreasury = $state(false);
  let validating = $state(false);
  let saving = $state(false);

  // Form data
  let formData = $state({
    display_name: '',
    machine_type: 'slots_w2w' as MachineType
  });

  // Errors
  let errors = $state<Record<string, string>>({});

  /**
   * Client-side address validation
   */
  const isValidAddressFormat = (address: string): boolean => {
    if (!address || address.length !== VOI_ADDRESS_LENGTH) {
      return false;
    }
    return BASE32_REGEX.test(address);
  };

  const formatMicroVoi = (microVoi: string) => {
    try {
      const value = BigInt(microVoi);
      return (Number(value) / 1_000_000).toFixed(2);
    } catch {
      return '0.00';
    }
  };

  /**
   * Extract contract state from API response
   * Handles both nested and flat response structures
   */
  const extractContractState = <T extends GameContractState | TreasuryContractState>(
    result: ContractStateApiResponse,
    expectedType: 'game' | 'treasury'
  ): T | null => {
    if (!result.success || !result.data) {
      return null;
    }

    // Handle nested structure: { data: { type, data: {...} } }
    if (result.data.data && result.data.type === expectedType) {
      return result.data.data as T;
    }

    // Handle flat structure: { data: { type, appId, ... } }
    const data = result.data as unknown as T;
    if (data && 'type' in data && data.type === expectedType) {
      return data;
    }

    return null;
  };

  const loadGameState = async () => {
    if (!gameContractId.trim()) {
      notificationStore.error('Please enter a game contract ID');
      return;
    }

    const appId = parseInt(gameContractId, 10);
    if (isNaN(appId) || appId <= 0) {
      notificationStore.error('Invalid contract ID. Must be a positive integer.');
      return;
    }

    loadingGame = true;
    gameState = null;
    validationResult = null;

    try {
      const response = await fetch(`/api/admin/machines/contract-state/${appId}?type=game`);
      const result: ContractStateApiResponse = await response.json();

      const state = extractContractState<GameContractState>(result, 'game');
      if (state) {
        gameState = state;
        notificationStore.success('Game contract state loaded');
      } else if (result.error) {
        notificationStore.error(result.error);
      } else {
        notificationStore.error('Contract is not a valid game contract');
      }
    } catch (err) {
      console.error('Error loading game state:', err);
      notificationStore.error('Failed to load contract state');
    } finally {
      loadingGame = false;
    }
  };

  const loadTreasuryState = async () => {
    if (!treasuryContractId.trim()) {
      notificationStore.error('Please enter a treasury contract ID');
      return;
    }

    const appId = parseInt(treasuryContractId, 10);
    if (isNaN(appId) || appId <= 0) {
      notificationStore.error('Invalid treasury contract ID. Must be a positive integer.');
      return;
    }

    loadingTreasury = true;
    treasuryState = null;
    validationResult = null;

    try {
      const response = await fetch(`/api/admin/machines/contract-state/${appId}?type=treasury`);
      const result: ContractStateApiResponse = await response.json();

      const state = extractContractState<TreasuryContractState>(result, 'treasury');
      if (state) {
        treasuryState = state;
        notificationStore.success('Treasury contract state loaded');
      } else if (result.error) {
        notificationStore.error(result.error);
      } else {
        notificationStore.error('Contract is not a valid treasury contract');
      }
    } catch (err) {
      console.error('Error loading treasury state:', err);
      notificationStore.error('Failed to load contract state');
    } finally {
      loadingTreasury = false;
    }
  };

  const validatePair = async () => {
    if (!gameContractId.trim() || !treasuryContractId.trim()) {
      notificationStore.error('Both game and treasury contract IDs are required for validation');
      return;
    }

    const gameId = parseInt(gameContractId, 10);
    const treasuryId = parseInt(treasuryContractId, 10);

    validating = true;
    validationResult = null;

    try {
      const response = await fetch(
        `/api/admin/machines/contract-state/${gameId}?validate_with=${treasuryId}`
      );
      const result = await response.json();

      if (result.success && result.data?.validation) {
        validationResult = {
          valid: result.data.validation.valid,
          errors: result.data.validation.errors || []
        };

        if (result.data.validation.valid) {
          notificationStore.success('Contract pair is valid');
        } else {
          notificationStore.warning('Contract pair validation failed');
        }
      } else {
        notificationStore.error(result.error || 'Failed to validate contract pair');
      }
    } catch (err) {
      console.error('Error validating pair:', err);
      notificationStore.error('Failed to validate contract pair');
    } finally {
      validating = false;
    }
  };

  const validateForm = (): boolean => {
    errors = {};

    if (!gameContractId.trim()) {
      errors.game_contract_id = 'Game contract ID is required';
    }

    if (!treasuryContractId.trim()) {
      errors.treasury_contract_id = 'Treasury contract ID is required';
    }

    if (!formData.display_name.trim()) {
      errors.display_name = 'Display name is required';
    } else if (formData.display_name.length > MAX_DISPLAY_NAME_LENGTH) {
      errors.display_name = `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or less`;
    }

    if (!formData.machine_type) {
      errors.machine_type = 'Machine type is required';
    }

    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    if (!gameState) {
      notificationStore.error('Please load the game contract state first');
      return;
    }

    if (!treasuryState) {
      notificationStore.error('Please load the treasury contract state first');
      return;
    }

    if (!gameState.bootstrapped) {
      notificationStore.error('Cannot register a game contract that is not bootstrapped');
      return;
    }

    if (!treasuryState.bootstrapped) {
      notificationStore.error('Cannot register a treasury contract that is not bootstrapped');
      return;
    }

    saving = true;

    try {
      const response = await fetch('/api/admin/machines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'register',
          game_contract_id: parseInt(gameContractId, 10),
          treasury_contract_id: parseInt(treasuryContractId, 10),
          ...formData
        })
      });

      const result = await response.json();

      if (result.success && result.data?.id) {
        notificationStore.success('Machine registered successfully');
        goto(`/admin/machines/${result.data.id}`);
      } else {
        notificationStore.error(result.error || 'Failed to register machine');
      }
    } catch (err) {
      console.error('Error registering machine:', err);
      notificationStore.error('Failed to register machine');
    } finally {
      saving = false;
    }
  };

  const handleFormSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    handleSubmit();
  };

  // Derived state for submit button
  const canSubmit = $derived(
    gameState !== null &&
    gameState.bootstrapped &&
    treasuryState !== null &&
    treasuryState.bootstrapped &&
    !saving
  );
  const submitDisabledReason = $derived(() => {
    if (!gameState) return 'Load the game contract state first';
    if (!gameState.bootstrapped) return 'Game contract must be bootstrapped';
    if (!treasuryState) return 'Load the treasury contract state first';
    if (!treasuryState.bootstrapped) return 'Treasury contract must be bootstrapped';
    return null;
  });
</script>

<svelte:head>
  <title>Register Machine - Admin - House of Voi</title>
</svelte:head>

<div class="space-y-8 max-w-4xl mx-auto">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-4xl font-semibold text-neutral-950 dark:text-white uppercase">
        Register Machine
      </h1>
      <p class="text-neutral-700 dark:text-neutral-300 mt-2">
        Register an existing deployed contract as a machine
      </p>
    </div>
    <a href="/admin/machines">
      <Button variant="ghost" size="sm">Cancel</Button>
    </a>
  </div>

  <!-- Contract IDs -->
  <Card>
    <CardHeader>
      <h2 class="text-2xl font-bold text-neutral-900 dark:text-neutral-100 uppercase">
        Contract IDs
      </h2>
    </CardHeader>
    <CardContent class="space-y-6">
      <!-- Game Contract -->
      <div>
        <label for="game_contract_id" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Game Contract ID <span class="text-error-600 dark:text-error-400" aria-hidden="true">*</span>
          <span class="sr-only">(required)</span>
        </label>
        <div class="flex gap-2">
          <input
            id="game_contract_id"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            bind:value={gameContractId}
            placeholder="e.g., 123456"
            aria-describedby="game-contract-error"
            aria-invalid={errors.game_contract_id ? 'true' : undefined}
            class="flex-1 px-4 py-3 bg-white dark:bg-neutral-800 border rounded-lg text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 font-mono
              {errors.game_contract_id ? 'border-error-500 focus:ring-error-500' : 'border-neutral-300 dark:border-neutral-700 focus:ring-primary-500'}"
          />
          <Button
            variant="outline"
            onclick={loadGameState}
            disabled={loadingGame}
            aria-describedby={loadingGame ? 'loading-game-status' : undefined}
          >
            {loadingGame ? 'Loading...' : 'Load State'}
          </Button>
          {#if loadingGame}
            <span id="loading-game-status" class="sr-only" role="status">Loading game contract state</span>
          {/if}
        </div>
        {#if errors.game_contract_id}
          <p id="game-contract-error" class="text-error-600 dark:text-error-400 text-sm mt-1" role="alert">{errors.game_contract_id}</p>
        {/if}
      </div>

      <!-- Game State Display -->
      {#if gameState}
        <div
          class="p-4 rounded-lg border {gameState.bootstrapped ? 'bg-success-500/10 border-success-500/30' : 'bg-warning-500/10 border-warning-500/30'}"
          role="region"
          aria-label="Game contract details"
        >
          <h4 class="text-sm font-bold uppercase mb-3 {gameState.bootstrapped ? 'text-success-600 dark:text-success-400' : 'text-warning-600 dark:text-warning-400'}">
            Game Contract Loaded {gameState.bootstrapped ? '' : '(Not Bootstrapped)'}
          </h4>
          <dl class="grid md:grid-cols-2 gap-4 text-sm">
            <div class="flex justify-between">
              <dt class="text-neutral-500 dark:text-neutral-400">App ID:</dt>
              <dd class="text-neutral-700 dark:text-neutral-200 font-mono">{gameState.appId}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-neutral-500 dark:text-neutral-400">Bootstrapped:</dt>
              <dd class="text-neutral-700 dark:text-neutral-200">{gameState.bootstrapped ? 'Yes' : 'No'}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-neutral-500 dark:text-neutral-400">Balance Total:</dt>
              <dd class="text-neutral-700 dark:text-neutral-200">{formatMicroVoi(gameState.balanceTotal)} VOI</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-neutral-500 dark:text-neutral-400">Balance Available:</dt>
              <dd class="text-neutral-700 dark:text-neutral-200">{formatMicroVoi(gameState.balanceAvailable)} VOI</dd>
            </div>
            <div class="md:col-span-2 flex justify-between">
              <dt class="text-neutral-500 dark:text-neutral-400">Owner:</dt>
              <dd class="text-neutral-700 dark:text-neutral-200 font-mono text-xs">{gameState.owner}</dd>
            </div>
          </dl>

          <!-- Fee Configuration (if available) -->
          {#if gameState.feeConfig}
            <div class="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <h5 class="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400 mb-2">Fee Configuration</h5>
              <dl class="grid md:grid-cols-2 gap-3 text-sm">
                <div class="flex justify-between">
                  <dt class="text-neutral-500 dark:text-neutral-400">Treasury Fee:</dt>
                  <dd class="text-neutral-700 dark:text-neutral-200">{(gameState.feeConfig.treasuryBps / 100).toFixed(2)}%</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-neutral-500 dark:text-neutral-400">Marketing Fee:</dt>
                  <dd class="text-neutral-700 dark:text-neutral-200">{(gameState.feeConfig.marketingBps / 100).toFixed(2)}%</dd>
                </div>
                {#if gameState.feeConfig.treasuryAddress}
                  <div class="md:col-span-2 flex justify-between">
                    <dt class="text-neutral-500 dark:text-neutral-400">Treasury Address:</dt>
                    <dd class="text-neutral-700 dark:text-neutral-200 font-mono text-xs truncate max-w-[300px]" title={gameState.feeConfig.treasuryAddress}>{gameState.feeConfig.treasuryAddress}</dd>
                  </div>
                {/if}
                {#if gameState.feeConfig.marketingAddress}
                  <div class="md:col-span-2 flex justify-between">
                    <dt class="text-neutral-500 dark:text-neutral-400">Marketing Address:</dt>
                    <dd class="text-neutral-700 dark:text-neutral-200 font-mono text-xs truncate max-w-[300px]" title={gameState.feeConfig.marketingAddress}>{gameState.feeConfig.marketingAddress}</dd>
                  </div>
                {/if}
              </dl>
            </div>
          {/if}

          {#if !gameState.bootstrapped}
            <p class="mt-3 text-warning-600 dark:text-warning-400 text-sm" role="alert">
              This contract is not bootstrapped and cannot be registered.
            </p>
          {/if}
        </div>
      {/if}

      <!-- Treasury Contract -->
      <div>
        <label for="treasury_contract_id" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Treasury Contract ID <span class="text-error-600 dark:text-error-400" aria-hidden="true">*</span>
          <span class="sr-only">(required)</span>
        </label>
        <div class="flex gap-2">
          <input
            id="treasury_contract_id"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            bind:value={treasuryContractId}
            placeholder="e.g., 123457"
            aria-describedby="treasury-contract-error treasury-hint"
            aria-invalid={errors.treasury_contract_id ? 'true' : undefined}
            class="flex-1 px-4 py-3 bg-white dark:bg-neutral-800 border rounded-lg text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 font-mono
              {errors.treasury_contract_id ? 'border-error-500 focus:ring-error-500' : 'border-neutral-300 dark:border-neutral-700 focus:ring-primary-500'}"
          />
          <Button
            variant="outline"
            onclick={loadTreasuryState}
            disabled={loadingTreasury}
            aria-describedby={loadingTreasury ? 'loading-treasury-status' : undefined}
          >
            {loadingTreasury ? 'Loading...' : 'Load State'}
          </Button>
          {#if loadingTreasury}
            <span id="loading-treasury-status" class="sr-only" role="status">Loading treasury contract state</span>
          {/if}
        </div>
        {#if errors.treasury_contract_id}
          <p id="treasury-contract-error" class="text-error-600 dark:text-error-400 text-sm mt-1" role="alert">{errors.treasury_contract_id}</p>
        {/if}
        <p id="treasury-hint" class="text-neutral-500 dark:text-neutral-400 text-xs mt-1">YBT contract for house pool management</p>
      </div>

      <!-- Treasury State Display -->
      {#if treasuryState}
        <div
          class="p-4 rounded-lg border {treasuryState.bootstrapped ? 'bg-success-500/10 border-success-500/30' : 'bg-warning-500/10 border-warning-500/30'}"
          role="region"
          aria-label="Treasury contract details"
        >
          <h4 class="text-sm font-bold uppercase mb-3 {treasuryState.bootstrapped ? 'text-success-600 dark:text-success-400' : 'text-warning-600 dark:text-warning-400'}">
            Treasury Contract Loaded {treasuryState.bootstrapped ? '' : '(Not Bootstrapped)'}
          </h4>
          <dl class="grid md:grid-cols-2 gap-4 text-sm">
            <div class="flex justify-between">
              <dt class="text-neutral-500 dark:text-neutral-400">App ID:</dt>
              <dd class="text-neutral-700 dark:text-neutral-200 font-mono">{treasuryState.appId}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-neutral-500 dark:text-neutral-400">Bootstrapped:</dt>
              <dd class="text-neutral-700 dark:text-neutral-200">{treasuryState.bootstrapped ? 'Yes' : 'No'}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-neutral-500 dark:text-neutral-400">Token:</dt>
              <dd class="text-neutral-700 dark:text-neutral-200">{treasuryState.name} ({treasuryState.symbol})</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-neutral-500 dark:text-neutral-400">Total Supply:</dt>
              <dd class="text-neutral-700 dark:text-neutral-200">{formatMicroVoi(treasuryState.totalSupply)}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-neutral-500 dark:text-neutral-400">Yield Source:</dt>
              <dd class="text-neutral-700 dark:text-neutral-200 font-mono">
                {treasuryState.yieldBearingSource ?? 'Not set'}
              </dd>
            </div>
          </dl>
          {#if !treasuryState.bootstrapped}
            <p class="mt-3 text-warning-600 dark:text-warning-400 text-sm" role="alert">
              This contract is not bootstrapped and cannot be registered.
            </p>
          {/if}
        </div>
      {/if}

      <!-- Validate Pair Button -->
      {#if gameContractId && treasuryContractId}
        <div class="flex items-center gap-4 flex-wrap">
          <Button variant="outline" onclick={validatePair} disabled={validating}>
            {validating ? 'Validating...' : 'Validate Pair'}
          </Button>

          {#if validationResult}
            {#if validationResult.valid}
              <span class="text-success-600 dark:text-success-400 text-sm font-medium" role="status">Valid contract pair</span>
            {:else}
              <div class="text-error-600 dark:text-error-400 text-sm" role="alert">
                <span class="font-medium">Validation failed:</span>
                <ul class="list-disc list-inside mt-1">
                  {#each validationResult.errors as err}
                    <li>{err}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          {/if}
        </div>
      {/if}
    </CardContent>
  </Card>

  <!-- Machine Metadata Form -->
  <Card>
    <CardHeader>
      <h2 class="text-2xl font-bold text-neutral-900 dark:text-neutral-100 uppercase">
        Machine Metadata
      </h2>
    </CardHeader>
    <CardContent>
      <form onsubmit={handleFormSubmit} class="space-y-6">
        <div>
          <label for="display_name" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Display Name <span class="text-error-600 dark:text-error-400" aria-hidden="true">*</span>
            <span class="sr-only">(required)</span>
          </label>
          <input
            id="display_name"
            type="text"
            bind:value={formData.display_name}
            placeholder="e.g., VOI Mega Slots"
            maxlength={MAX_DISPLAY_NAME_LENGTH}
            required
            aria-describedby="display-name-hint display-name-error"
            aria-invalid={errors.display_name ? 'true' : undefined}
            class="w-full px-4 py-3 bg-white dark:bg-neutral-800 border rounded-lg text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2
              {errors.display_name ? 'border-error-500 focus:ring-error-500' : 'border-neutral-300 dark:border-neutral-700 focus:ring-primary-500'}"
          />
          {#if errors.display_name}
            <p id="display-name-error" class="text-error-600 dark:text-error-400 text-sm mt-1" role="alert">{errors.display_name}</p>
          {:else}
            <p id="display-name-hint" class="text-neutral-500 dark:text-neutral-400 text-xs mt-1">Shown to players in the UI</p>
          {/if}
        </div>

        <div>
          <label for="machine_type" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Machine Type <span class="text-error-600 dark:text-error-400" aria-hidden="true">*</span>
            <span class="sr-only">(required)</span>
          </label>
          <select
            id="machine_type"
            bind:value={formData.machine_type}
            required
            aria-describedby="machine-type-error"
            aria-invalid={errors.machine_type ? 'true' : undefined}
            class="w-full px-4 py-3 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="slots_5reel">5-Reel Slots</option>
            <option value="slots_w2w">Ways to Win Slots</option>
            <option value="keno">Keno</option>
            <option value="roulette">Roulette</option>
          </select>
          {#if errors.machine_type}
            <p id="machine-type-error" class="text-error-600 dark:text-error-400 text-sm mt-1" role="alert">{errors.machine_type}</p>
          {/if}
        </div>

        <!-- Submit -->
        <div class="flex justify-end gap-4 pt-6 border-t border-neutral-200 dark:border-neutral-700">
          <a href="/admin/machines">
            <Button variant="ghost" type="button">Cancel</Button>
          </a>
          <Button
            variant="primary"
            type="submit"
            disabled={!canSubmit}
            aria-describedby={!canSubmit ? 'submit-disabled-reason' : undefined}
          >
            {saving ? 'Registering...' : 'Register Machine'}
          </Button>
          {#if !canSubmit && submitDisabledReason()}
            <span id="submit-disabled-reason" class="sr-only">{submitDisabledReason()}</span>
          {/if}
        </div>
      </form>
    </CardContent>
  </Card>
</div>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>
