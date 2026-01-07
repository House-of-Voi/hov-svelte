<script lang="ts">
  import { goto } from '$app/navigation';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import MachineTypeBadge from '$lib/components/admin/machines/MachineTypeBadge.svelte';
  import { notificationStore } from '$lib/stores/notificationStore.svelte';
  import type { MachineType } from '$lib/types/database';

  const STEPS = ['Basic Info', 'Game Config', 'Platform Settings', 'Review'] as const;

  // Validation constants
  const MAX_NAME_LENGTH = 50;
  const MAX_DISPLAY_NAME_LENGTH = 100;
  const MAX_DESCRIPTION_LENGTH = 500;
  const MAX_THEME_LENGTH = 50;
  const VOI_ADDRESS_LENGTH = 58;
  // Base32 characters used in Algorand/Voi addresses
  const BASE32_REGEX = /^[A-Z2-7]+$/;

  let currentStep = $state(0);
  let saving = $state(false);

  // Form data
  let formData = $state({
    name: '',
    display_name: '',
    description: '',
    theme: '',
    machine_type: 'slots_w2w' as MachineType,
    chain: 'voi' as const,
    min_bet: 1_000_000, // 1 VOI in microVOI
    max_bet: 100_000_000, // 100 VOI in microVOI
    rtp_target: 96.5,
    house_edge: 3.5,
    platform_fee_percent: 0,
    platform_treasury_address: '',
    config: {} as Record<string, unknown>
  });

  // Validation state
  let errors = $state<Record<string, string>>({});

  /**
   * Client-side address validation
   * Checks length and base32 character set (full validation happens server-side)
   */
  const isValidAddressFormat = (address: string): boolean => {
    if (!address || address.length !== VOI_ADDRESS_LENGTH) {
      return false;
    }
    return BASE32_REGEX.test(address);
  };

  const validateStep = (step: number): boolean => {
    errors = {};

    if (step === 0) {
      // Basic Info validation
      if (!formData.name.trim()) {
        errors.name = 'Name is required';
      } else if (formData.name.length > MAX_NAME_LENGTH) {
        errors.name = `Name must be ${MAX_NAME_LENGTH} characters or less`;
      } else if (!/^[a-z0-9_-]+$/.test(formData.name)) {
        errors.name = 'Name must be lowercase with only letters, numbers, hyphens, and underscores';
      }

      if (!formData.display_name.trim()) {
        errors.display_name = 'Display name is required';
      } else if (formData.display_name.length > MAX_DISPLAY_NAME_LENGTH) {
        errors.display_name = `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or less`;
      }

      if (!formData.machine_type) {
        errors.machine_type = 'Machine type is required';
      }

      if (formData.description && formData.description.length > MAX_DESCRIPTION_LENGTH) {
        errors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`;
      }

      if (formData.theme && formData.theme.length > MAX_THEME_LENGTH) {
        errors.theme = `Theme must be ${MAX_THEME_LENGTH} characters or less`;
      }
    }

    if (step === 1) {
      // Game Config validation
      if (formData.min_bet <= 0) {
        errors.min_bet = 'Min bet must be positive';
      }

      if (formData.max_bet <= 0) {
        errors.max_bet = 'Max bet must be positive';
      }

      if (formData.min_bet > formData.max_bet) {
        errors.min_bet = 'Min bet cannot be greater than max bet';
      }

      if (formData.rtp_target !== undefined && (formData.rtp_target < 0 || formData.rtp_target > 100)) {
        errors.rtp_target = 'RTP target must be between 0 and 100';
      }

      if (formData.house_edge !== undefined && (formData.house_edge < 0 || formData.house_edge > 100)) {
        errors.house_edge = 'House edge must be between 0 and 100';
      }
    }

    if (step === 2) {
      // Platform Settings validation
      if (formData.platform_fee_percent < 0 || formData.platform_fee_percent > 100) {
        errors.platform_fee_percent = 'Platform fee must be between 0 and 100';
      }

      if (formData.platform_treasury_address && !isValidAddressFormat(formData.platform_treasury_address)) {
        errors.platform_treasury_address = 'Invalid address format. Must be a valid VOI/Algorand address (58 characters, base32)';
      }
    }

    return Object.keys(errors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      currentStep = Math.min(currentStep + 1, STEPS.length - 1);
    }
  };

  const prevStep = () => {
    currentStep = Math.max(currentStep - 1, 0);
  };

  const formatMicroVoi = (microVoi: number | string) => {
    const value = typeof microVoi === 'string' ? parseFloat(microVoi) : microVoi;
    return (value / 1_000_000).toFixed(2);
  };

  const parseMicroVoi = (voi: string): number => {
    const value = parseFloat(voi);
    return Math.round(value * 1_000_000);
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) {
      return;
    }

    saving = true;

    try {
      const response = await fetch('/api/admin/machines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'draft',
          ...formData
        })
      });

      const result = await response.json();

      if (result.success) {
        notificationStore.success('Draft machine created successfully');
        goto(`/admin/machines/${result.data.id}`);
      } else {
        notificationStore.error(result.error || 'Failed to create machine');
      }
    } catch (err) {
      console.error('Error creating machine:', err);
      notificationStore.error('Failed to create machine');
    } finally {
      saving = false;
    }
  };

  const handleFormSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (currentStep < STEPS.length - 1) {
      nextStep();
    } else {
      handleSubmit();
    }
  };
</script>

<svelte:head>
  <title>Create Machine - Admin - House of Voi</title>
</svelte:head>

<div class="space-y-8 max-w-3xl mx-auto">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-4xl font-semibold text-neutral-950 dark:text-white uppercase">Create Machine</h1>
      <p class="text-neutral-700 dark:text-neutral-300 mt-2">
        Create a new draft machine configuration
      </p>
    </div>
    <a href="/admin/machines">
      <Button variant="ghost" size="sm">Cancel</Button>
    </a>
  </div>

  <!-- Progress Steps -->
  <nav aria-label="Form progress" class="flex justify-between items-center">
    {#each STEPS as step, i}
      <div class="flex items-center {i < STEPS.length - 1 ? 'flex-1' : ''}">
        <div
          class="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold
            {i < currentStep
              ? 'bg-success-500 text-white'
              : i === currentStep
                ? 'bg-primary-500 text-white'
                : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}"
          aria-current={i === currentStep ? 'step' : undefined}
        >
          {#if i < currentStep}
            <span aria-hidden="true">&#10003;</span>
            <span class="sr-only">Completed:</span>
          {:else}
            {i + 1}
          {/if}
        </div>
        <span
          class="ml-2 text-sm font-medium
            {i === currentStep ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-500 dark:text-neutral-400'}"
        >
          {step}
        </span>
        {#if i < STEPS.length - 1}
          <div
            class="flex-1 h-0.5 mx-4
              {i < currentStep ? 'bg-success-500' : 'bg-neutral-300 dark:bg-neutral-700'}"
            aria-hidden="true"
          ></div>
        {/if}
      </div>
    {/each}
  </nav>

  <!-- Form -->
  <Card>
    <CardHeader>
      <h2 class="text-2xl font-bold text-neutral-900 dark:text-neutral-100 uppercase">
        {STEPS[currentStep]}
      </h2>
    </CardHeader>
    <CardContent>
      <form onsubmit={handleFormSubmit} class="space-y-6">
        {#if currentStep === 0}
          <!-- Step 1: Basic Info -->
          <div class="space-y-4">
            <div>
              <label for="name" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Internal Name <span class="text-error-600 dark:text-error-400" aria-hidden="true">*</span>
                <span class="sr-only">(required)</span>
              </label>
              <input
                id="name"
                type="text"
                bind:value={formData.name}
                placeholder="e.g., voi-slots-main"
                maxlength={MAX_NAME_LENGTH}
                required
                aria-describedby="name-hint name-error"
                aria-invalid={errors.name ? 'true' : undefined}
                class="w-full px-4 py-3 bg-white dark:bg-neutral-800 border rounded-lg text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2
                  {errors.name ? 'border-error-500 focus:ring-error-500' : 'border-neutral-300 dark:border-neutral-700 focus:ring-primary-500'}"
              />
              {#if errors.name}
                <p id="name-error" class="text-error-600 dark:text-error-400 text-sm mt-1" role="alert">{errors.name}</p>
              {:else}
                <p id="name-hint" class="text-neutral-500 dark:text-neutral-400 text-xs mt-1">Unique identifier (lowercase, no spaces)</p>
              {/if}
            </div>

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

            <div>
              <label for="description" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Description
              </label>
              <textarea
                id="description"
                bind:value={formData.description}
                placeholder="Optional description of the machine..."
                rows={3}
                maxlength={MAX_DESCRIPTION_LENGTH}
                aria-describedby="description-error"
                aria-invalid={errors.description ? 'true' : undefined}
                class="w-full px-4 py-3 bg-white dark:bg-neutral-800 border rounded-lg text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2
                  {errors.description ? 'border-error-500 focus:ring-error-500' : 'border-neutral-300 dark:border-neutral-700 focus:ring-primary-500'}"
              ></textarea>
              {#if errors.description}
                <p id="description-error" class="text-error-600 dark:text-error-400 text-sm mt-1" role="alert">{errors.description}</p>
              {/if}
            </div>

            <div>
              <label for="theme" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Theme
              </label>
              <input
                id="theme"
                type="text"
                bind:value={formData.theme}
                placeholder="e.g., space, egyptian, classic"
                maxlength={MAX_THEME_LENGTH}
                aria-describedby="theme-hint theme-error"
                aria-invalid={errors.theme ? 'true' : undefined}
                class="w-full px-4 py-3 bg-white dark:bg-neutral-800 border rounded-lg text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2
                  {errors.theme ? 'border-error-500 focus:ring-error-500' : 'border-neutral-300 dark:border-neutral-700 focus:ring-primary-500'}"
              />
              {#if errors.theme}
                <p id="theme-error" class="text-error-600 dark:text-error-400 text-sm mt-1" role="alert">{errors.theme}</p>
              {:else}
                <p id="theme-hint" class="text-neutral-500 dark:text-neutral-400 text-xs mt-1">Visual theme for the game</p>
              {/if}
            </div>
          </div>

        {:else if currentStep === 1}
          <!-- Step 2: Game Config -->
          <div class="space-y-4">
            <div class="grid md:grid-cols-2 gap-4">
              <div>
                <label for="min_bet" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Min Bet (VOI) <span class="text-error-600 dark:text-error-400" aria-hidden="true">*</span>
                  <span class="sr-only">(required)</span>
                </label>
                <input
                  id="min_bet"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formatMicroVoi(formData.min_bet)}
                  onchange={(e) => (formData.min_bet = parseMicroVoi(e.currentTarget.value))}
                  required
                  aria-describedby="min-bet-error"
                  aria-invalid={errors.min_bet ? 'true' : undefined}
                  class="w-full px-4 py-3 bg-white dark:bg-neutral-800 border rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2
                    {errors.min_bet ? 'border-error-500 focus:ring-error-500' : 'border-neutral-300 dark:border-neutral-700 focus:ring-primary-500'}"
                />
                {#if errors.min_bet}
                  <p id="min-bet-error" class="text-error-600 dark:text-error-400 text-sm mt-1" role="alert">{errors.min_bet}</p>
                {/if}
              </div>

              <div>
                <label for="max_bet" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Max Bet (VOI) <span class="text-error-600 dark:text-error-400" aria-hidden="true">*</span>
                  <span class="sr-only">(required)</span>
                </label>
                <input
                  id="max_bet"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formatMicroVoi(formData.max_bet)}
                  onchange={(e) => (formData.max_bet = parseMicroVoi(e.currentTarget.value))}
                  required
                  aria-describedby="max-bet-error"
                  aria-invalid={errors.max_bet ? 'true' : undefined}
                  class="w-full px-4 py-3 bg-white dark:bg-neutral-800 border rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2
                    {errors.max_bet ? 'border-error-500 focus:ring-error-500' : 'border-neutral-300 dark:border-neutral-700 focus:ring-primary-500'}"
                />
                {#if errors.max_bet}
                  <p id="max-bet-error" class="text-error-600 dark:text-error-400 text-sm mt-1" role="alert">{errors.max_bet}</p>
                {/if}
              </div>
            </div>

            <div class="grid md:grid-cols-2 gap-4">
              <div>
                <label for="rtp_target" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  RTP Target (%)
                </label>
                <input
                  id="rtp_target"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  bind:value={formData.rtp_target}
                  aria-describedby="rtp-hint rtp-error"
                  aria-invalid={errors.rtp_target ? 'true' : undefined}
                  class="w-full px-4 py-3 bg-white dark:bg-neutral-800 border rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2
                    {errors.rtp_target ? 'border-error-500 focus:ring-error-500' : 'border-neutral-300 dark:border-neutral-700 focus:ring-primary-500'}"
                />
                {#if errors.rtp_target}
                  <p id="rtp-error" class="text-error-600 dark:text-error-400 text-sm mt-1" role="alert">{errors.rtp_target}</p>
                {:else}
                  <p id="rtp-hint" class="text-neutral-500 dark:text-neutral-400 text-xs mt-1">Return to Player target percentage</p>
                {/if}
              </div>

              <div>
                <label for="house_edge" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  House Edge (%)
                </label>
                <input
                  id="house_edge"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  bind:value={formData.house_edge}
                  aria-describedby="house-edge-hint house-edge-error"
                  aria-invalid={errors.house_edge ? 'true' : undefined}
                  class="w-full px-4 py-3 bg-white dark:bg-neutral-800 border rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2
                    {errors.house_edge ? 'border-error-500 focus:ring-error-500' : 'border-neutral-300 dark:border-neutral-700 focus:ring-primary-500'}"
                />
                {#if errors.house_edge}
                  <p id="house-edge-error" class="text-error-600 dark:text-error-400 text-sm mt-1" role="alert">{errors.house_edge}</p>
                {:else}
                  <p id="house-edge-hint" class="text-neutral-500 dark:text-neutral-400 text-xs mt-1">Expected house edge percentage</p>
                {/if}
              </div>
            </div>

            <div class="p-4 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700" role="note">
              <p class="text-sm text-neutral-600 dark:text-neutral-400">
                <strong class="text-neutral-700 dark:text-neutral-300">Note:</strong> RTP + House Edge should typically equal 100%.
                Current total: <span class="font-mono">{(formData.rtp_target + formData.house_edge).toFixed(1)}%</span>
              </p>
            </div>
          </div>

        {:else if currentStep === 2}
          <!-- Step 3: Platform Settings -->
          <div class="space-y-4">
            <div>
              <label for="platform_fee_percent" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Platform Fee (%)
              </label>
              <input
                id="platform_fee_percent"
                type="number"
                step="0.1"
                min="0"
                max="100"
                bind:value={formData.platform_fee_percent}
                aria-describedby="platform-fee-hint platform-fee-error"
                aria-invalid={errors.platform_fee_percent ? 'true' : undefined}
                class="w-full px-4 py-3 bg-white dark:bg-neutral-800 border rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2
                  {errors.platform_fee_percent ? 'border-error-500 focus:ring-error-500' : 'border-neutral-300 dark:border-neutral-700 focus:ring-primary-500'}"
              />
              {#if errors.platform_fee_percent}
                <p id="platform-fee-error" class="text-error-600 dark:text-error-400 text-sm mt-1" role="alert">{errors.platform_fee_percent}</p>
              {:else}
                <p id="platform-fee-hint" class="text-neutral-500 dark:text-neutral-400 text-xs mt-1">Percentage of house profit sent to platform treasury</p>
              {/if}
            </div>

            <div>
              <label for="platform_treasury_address" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Platform Treasury Address
              </label>
              <input
                id="platform_treasury_address"
                type="text"
                bind:value={formData.platform_treasury_address}
                placeholder="VOI address (58 characters)"
                maxlength={VOI_ADDRESS_LENGTH}
                aria-describedby="treasury-hint treasury-error"
                aria-invalid={errors.platform_treasury_address ? 'true' : undefined}
                class="w-full px-4 py-3 bg-white dark:bg-neutral-800 border rounded-lg text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 font-mono text-sm
                  {errors.platform_treasury_address ? 'border-error-500 focus:ring-error-500' : 'border-neutral-300 dark:border-neutral-700 focus:ring-primary-500'}"
              />
              {#if errors.platform_treasury_address}
                <p id="treasury-error" class="text-error-600 dark:text-error-400 text-sm mt-1" role="alert">{errors.platform_treasury_address}</p>
              {:else}
                <p id="treasury-hint" class="text-neutral-500 dark:text-neutral-400 text-xs mt-1">Address to receive platform fees (optional)</p>
              {/if}
            </div>

            {#if formData.platform_fee_percent > 0 && !formData.platform_treasury_address}
              <div class="p-4 bg-warning-500/10 rounded-lg border border-warning-500/30" role="alert">
                <p class="text-sm text-warning-600 dark:text-warning-400">
                  Platform fee is set but no treasury address provided. Fees will not be collected.
                </p>
              </div>
            {/if}
          </div>

        {:else if currentStep === 3}
          <!-- Step 4: Review -->
          <div class="space-y-6">
            <div class="grid md:grid-cols-2 gap-6">
              <div class="space-y-4">
                <h3 class="text-lg font-bold text-neutral-700 dark:text-neutral-200 uppercase">Basic Info</h3>
                <dl class="space-y-2">
                  <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
                    <dt class="text-neutral-500 dark:text-neutral-400">Name:</dt>
                    <dd class="text-neutral-700 dark:text-neutral-200 font-mono">{formData.name}</dd>
                  </div>
                  <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
                    <dt class="text-neutral-500 dark:text-neutral-400">Display Name:</dt>
                    <dd class="text-neutral-700 dark:text-neutral-200">{formData.display_name}</dd>
                  </div>
                  <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
                    <dt class="text-neutral-500 dark:text-neutral-400">Type:</dt>
                    <dd><MachineTypeBadge type={formData.machine_type} /></dd>
                  </div>
                  {#if formData.theme}
                    <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
                      <dt class="text-neutral-500 dark:text-neutral-400">Theme:</dt>
                      <dd class="text-neutral-700 dark:text-neutral-200 capitalize">{formData.theme}</dd>
                    </div>
                  {/if}
                </dl>
              </div>

              <div class="space-y-4">
                <h3 class="text-lg font-bold text-neutral-700 dark:text-neutral-200 uppercase">Game Config</h3>
                <dl class="space-y-2">
                  <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
                    <dt class="text-neutral-500 dark:text-neutral-400">Bet Range:</dt>
                    <dd class="text-neutral-700 dark:text-neutral-200">{formatMicroVoi(formData.min_bet)} - {formatMicroVoi(formData.max_bet)} VOI</dd>
                  </div>
                  <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
                    <dt class="text-neutral-500 dark:text-neutral-400">RTP Target:</dt>
                    <dd class="text-neutral-700 dark:text-neutral-200">{formData.rtp_target}%</dd>
                  </div>
                  <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
                    <dt class="text-neutral-500 dark:text-neutral-400">House Edge:</dt>
                    <dd class="text-neutral-700 dark:text-neutral-200">{formData.house_edge}%</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div class="space-y-4">
              <h3 class="text-lg font-bold text-neutral-700 dark:text-neutral-200 uppercase">Platform Settings</h3>
              <dl class="grid md:grid-cols-2 gap-4">
                <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
                  <dt class="text-neutral-500 dark:text-neutral-400">Platform Fee:</dt>
                  <dd class="text-neutral-700 dark:text-neutral-200">{formData.platform_fee_percent}%</dd>
                </div>
                <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
                  <dt class="text-neutral-500 dark:text-neutral-400">Treasury:</dt>
                  <dd class="text-neutral-700 dark:text-neutral-200 font-mono text-xs truncate max-w-48">
                    {formData.platform_treasury_address || 'Not set'}
                  </dd>
                </div>
              </dl>
            </div>

            {#if formData.description}
              <div class="p-4 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg">
                <h4 class="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-2">Description</h4>
                <p class="text-neutral-600 dark:text-neutral-300">{formData.description}</p>
              </div>
            {/if}

            <div class="p-4 bg-primary-500/10 rounded-lg border border-primary-500/30" role="note">
              <p class="text-sm text-primary-700 dark:text-primary-300">
                This will create a <strong>draft</strong> machine. You can deploy it to the blockchain from the machine detail page.
              </p>
            </div>
          </div>
        {/if}

        <!-- Navigation -->
        <div class="flex justify-between pt-6 border-t border-neutral-200 dark:border-neutral-700">
          {#if currentStep > 0}
            <Button variant="ghost" type="button" onclick={prevStep}>Previous</Button>
          {:else}
            <div></div>
          {/if}

          {#if currentStep < STEPS.length - 1}
            <Button variant="primary" type="submit">Next</Button>
          {:else}
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create Draft'}
            </Button>
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
