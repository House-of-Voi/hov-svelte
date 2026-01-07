<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import MachineStatusBadge from '$lib/components/admin/machines/MachineStatusBadge.svelte';
  import MachineTypeBadge from '$lib/components/admin/machines/MachineTypeBadge.svelte';
  import { notificationStore } from '$lib/stores/notificationStore.svelte';
  import type { PageData } from './$types';
  import type { MachineType } from '$lib/types/database';

  let { data }: { data: PageData } = $props();

  let machine = $derived(data.machine);
  let isDraft = $derived(machine.status === 'draft');

  // Edit mode state
  let editing = $state(false);
  let saving = $state(false);
  let deleting = $state(false);

  // Edit form data
  let editData = $state({
    name: '',
    display_name: '',
    description: '',
    theme: '',
    machine_type: 'slots_w2w' as MachineType,
    min_bet: 0,
    max_bet: 0,
    rtp_target: 0,
    house_edge: 0,
    platform_fee_percent: 0,
    platform_treasury_address: ''
  });

  let errors = $state<Record<string, string>>({});

  const formatMicroVoi = (microVoi: number) => {
    return (microVoi / 1_000_000).toFixed(2);
  };

  const parseMicroVoi = (voi: string): number => {
    const value = parseFloat(voi);
    return Math.round(value * 1_000_000);
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString();
  };

  const startEditing = () => {
    editData = {
      name: machine.name,
      display_name: machine.display_name,
      description: machine.description || '',
      theme: machine.theme || '',
      machine_type: machine.machine_type,
      min_bet: machine.min_bet,
      max_bet: machine.max_bet,
      rtp_target: machine.rtp_target || 0,
      house_edge: machine.house_edge || 0,
      platform_fee_percent: machine.platform_fee_percent,
      platform_treasury_address: machine.platform_treasury_address || ''
    };
    editing = true;
  };

  const cancelEditing = () => {
    editing = false;
    errors = {};
  };

  const validateEdit = (): boolean => {
    errors = {};

    if (!editData.name.trim()) {
      errors.name = 'Name is required';
    } else if (!/^[a-z0-9_-]+$/.test(editData.name)) {
      errors.name = 'Name must be lowercase with only letters, numbers, hyphens, and underscores';
    }

    if (!editData.display_name.trim()) {
      errors.display_name = 'Display name is required';
    }

    if (editData.min_bet <= 0) {
      errors.min_bet = 'Min bet must be positive';
    }

    if (editData.max_bet <= 0) {
      errors.max_bet = 'Max bet must be positive';
    }

    if (editData.min_bet > editData.max_bet) {
      errors.min_bet = 'Min bet cannot be greater than max bet';
    }

    if (editData.platform_fee_percent < 0 || editData.platform_fee_percent > 100) {
      errors.platform_fee_percent = 'Platform fee must be between 0 and 100';
    }

    if (editData.platform_treasury_address && editData.platform_treasury_address.length !== 58) {
      errors.platform_treasury_address = 'Invalid address format (must be 58 characters)';
    }

    return Object.keys(errors).length === 0;
  };

  const saveChanges = async () => {
    if (!validateEdit()) {
      return;
    }

    saving = true;

    try {
      const response = await fetch(`/api/admin/machines/${machine.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      });

      const result = await response.json();

      if (result.success) {
        notificationStore.success('Machine updated successfully');
        editing = false;
        await invalidateAll();
      } else {
        notificationStore.error(result.error || 'Failed to update machine');
      }
    } catch (err) {
      console.error('Error updating machine:', err);
      notificationStore.error('Failed to update machine');
    } finally {
      saving = false;
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this draft machine? This cannot be undone.')) {
      return;
    }

    deleting = true;

    try {
      const response = await fetch(`/api/admin/machines/${machine.id}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        notificationStore.success('Machine deleted successfully');
        // Reset pagination to page 1 to avoid empty page after deletion
        goto('/admin/machines?page=1');
      } else {
        notificationStore.error(result.error || 'Failed to delete machine');
      }
    } catch (err) {
      console.error('Error deleting machine:', err);
      notificationStore.error('Failed to delete machine');
    } finally {
      deleting = false;
    }
  };

  const handleToggleStatus = async () => {
    if (machine.status !== 'active' && machine.status !== 'paused') {
      notificationStore.info(`Cannot toggle machines with status: ${machine.status}`);
      return;
    }

    try {
      const response = await fetch(`/api/admin/machines/${machine.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_active: !machine.is_active
        })
      });

      const result = await response.json();

      if (result.success) {
        notificationStore.success(`Machine ${machine.is_active ? 'paused' : 'activated'} successfully`);
        await invalidateAll();
      } else {
        notificationStore.error(result.error || 'Failed to update machine');
      }
    } catch (err) {
      console.error('Error toggling machine status:', err);
      notificationStore.error('Failed to update machine');
    }
  };
</script>

<svelte:head>
  <title>{machine.display_name} - Admin - House of Voi</title>
</svelte:head>

<div class="space-y-8 max-w-5xl mx-auto">
  <!-- Header -->
  <div class="flex items-center justify-between flex-wrap gap-4">
    <div>
      <div class="flex items-center gap-3 flex-wrap">
        <h1 class="text-4xl font-semibold text-neutral-950 dark:text-white uppercase">
          {machine.display_name}
        </h1>
        <MachineStatusBadge status={machine.status} />
      </div>
      <p class="text-neutral-500 dark:text-neutral-400 mt-2 font-mono">{machine.name}</p>
    </div>
    <div class="flex gap-2 flex-wrap">
      <a href="/admin/machines">
        <Button variant="ghost" size="sm">Back to List</Button>
      </a>
      {#if isDraft && !editing}
        <Button variant="outline" size="sm" onclick={startEditing}>Edit</Button>
        <a href="/admin/machines/{machine.id}/deploy">
          <Button variant="primary" size="sm">Deploy</Button>
        </a>
      {:else if machine.status === 'deploying' || machine.status === 'bootstrapping' || machine.status === 'failed'}
        <a href="/admin/machines/{machine.id}/deploy">
          <Button variant="primary" size="sm">
            {machine.status === 'failed' ? 'Retry Deploy' : 'Resume Deploy'}
          </Button>
        </a>
      {:else if machine.status === 'active' || machine.status === 'paused'}
        <Button
          variant={machine.is_active ? 'outline' : 'primary'}
          size="sm"
          onclick={handleToggleStatus}
        >
          {machine.is_active ? 'Pause' : 'Activate'}
        </Button>
      {/if}
    </div>
  </div>

  {#if editing}
    <!-- Edit Form -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-bold text-neutral-900 dark:text-neutral-100 uppercase">
            Edit Machine
          </h2>
          <Button variant="ghost" size="sm" onclick={cancelEditing}>Cancel</Button>
        </div>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="grid md:grid-cols-2 gap-6">
          <div>
            <label for="name" class="block text-sm font-medium text-neutral-300 mb-2">
              Internal Name <span class="text-error-400">*</span>
            </label>
            <input
              id="name"
              type="text"
              bind:value={editData.name}
              class="w-full px-4 py-3 bg-neutral-800 border rounded-lg text-neutral-100 focus:outline-none focus:ring-2
                {errors.name ? 'border-error-500 focus:ring-error-500' : 'border-neutral-700 focus:ring-primary-500'}"
            />
            {#if errors.name}
              <p class="text-error-400 text-sm mt-1">{errors.name}</p>
            {/if}
          </div>

          <div>
            <label for="display_name" class="block text-sm font-medium text-neutral-300 mb-2">
              Display Name <span class="text-error-400">*</span>
            </label>
            <input
              id="display_name"
              type="text"
              bind:value={editData.display_name}
              class="w-full px-4 py-3 bg-neutral-800 border rounded-lg text-neutral-100 focus:outline-none focus:ring-2
                {errors.display_name ? 'border-error-500 focus:ring-error-500' : 'border-neutral-700 focus:ring-primary-500'}"
            />
            {#if errors.display_name}
              <p class="text-error-400 text-sm mt-1">{errors.display_name}</p>
            {/if}
          </div>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
          <div>
            <label for="machine_type" class="block text-sm font-medium text-neutral-300 mb-2">
              Machine Type
            </label>
            <select
              id="machine_type"
              bind:value={editData.machine_type}
              class="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="slots_5reel">5-Reel Slots</option>
              <option value="slots_w2w">Ways to Win Slots</option>
              <option value="keno">Keno</option>
              <option value="roulette">Roulette</option>
            </select>
          </div>

          <div>
            <label for="theme" class="block text-sm font-medium text-neutral-300 mb-2">
              Theme
            </label>
            <input
              id="theme"
              type="text"
              bind:value={editData.theme}
              class="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div>
          <label for="description" class="block text-sm font-medium text-neutral-300 mb-2">
            Description
          </label>
          <textarea
            id="description"
            bind:value={editData.description}
            rows={3}
            class="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          ></textarea>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
          <div>
            <label for="min_bet" class="block text-sm font-medium text-neutral-300 mb-2">
              Min Bet (VOI) <span class="text-error-400">*</span>
            </label>
            <input
              id="min_bet"
              type="number"
              step="0.01"
              min="0"
              value={formatMicroVoi(editData.min_bet)}
              onchange={(e) => (editData.min_bet = parseMicroVoi(e.currentTarget.value))}
              class="w-full px-4 py-3 bg-neutral-800 border rounded-lg text-neutral-100 focus:outline-none focus:ring-2
                {errors.min_bet ? 'border-error-500 focus:ring-error-500' : 'border-neutral-700 focus:ring-primary-500'}"
            />
            {#if errors.min_bet}
              <p class="text-error-400 text-sm mt-1">{errors.min_bet}</p>
            {/if}
          </div>

          <div>
            <label for="max_bet" class="block text-sm font-medium text-neutral-300 mb-2">
              Max Bet (VOI) <span class="text-error-400">*</span>
            </label>
            <input
              id="max_bet"
              type="number"
              step="0.01"
              min="0"
              value={formatMicroVoi(editData.max_bet)}
              onchange={(e) => (editData.max_bet = parseMicroVoi(e.currentTarget.value))}
              class="w-full px-4 py-3 bg-neutral-800 border rounded-lg text-neutral-100 focus:outline-none focus:ring-2
                {errors.max_bet ? 'border-error-500 focus:ring-error-500' : 'border-neutral-700 focus:ring-primary-500'}"
            />
            {#if errors.max_bet}
              <p class="text-error-400 text-sm mt-1">{errors.max_bet}</p>
            {/if}
          </div>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
          <div>
            <label for="rtp_target" class="block text-sm font-medium text-neutral-300 mb-2">
              RTP Target (%)
            </label>
            <input
              id="rtp_target"
              type="number"
              step="0.1"
              min="0"
              max="100"
              bind:value={editData.rtp_target}
              class="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label for="house_edge" class="block text-sm font-medium text-neutral-300 mb-2">
              House Edge (%)
            </label>
            <input
              id="house_edge"
              type="number"
              step="0.1"
              min="0"
              max="100"
              bind:value={editData.house_edge}
              class="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
          <div>
            <label for="platform_fee_percent" class="block text-sm font-medium text-neutral-300 mb-2">
              Platform Fee (%)
            </label>
            <input
              id="platform_fee_percent"
              type="number"
              step="0.1"
              min="0"
              max="100"
              bind:value={editData.platform_fee_percent}
              class="w-full px-4 py-3 bg-neutral-800 border rounded-lg text-neutral-100 focus:outline-none focus:ring-2
                {errors.platform_fee_percent ? 'border-error-500 focus:ring-error-500' : 'border-neutral-700 focus:ring-primary-500'}"
            />
            {#if errors.platform_fee_percent}
              <p class="text-error-400 text-sm mt-1">{errors.platform_fee_percent}</p>
            {/if}
          </div>

          <div>
            <label for="platform_treasury_address" class="block text-sm font-medium text-neutral-300 mb-2">
              Platform Treasury Address
            </label>
            <input
              id="platform_treasury_address"
              type="text"
              bind:value={editData.platform_treasury_address}
              placeholder="VOI address (58 characters)"
              class="w-full px-4 py-3 bg-neutral-800 border rounded-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 font-mono text-sm
                {errors.platform_treasury_address ? 'border-error-500 focus:ring-error-500' : 'border-neutral-700 focus:ring-primary-500'}"
            />
            {#if errors.platform_treasury_address}
              <p class="text-error-400 text-sm mt-1">{errors.platform_treasury_address}</p>
            {/if}
          </div>
        </div>

        <div class="flex justify-between pt-6 border-t border-neutral-700">
          <Button variant="ghost" class="text-error-400 hover:text-error-300" onclick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete Draft'}
          </Button>
          <div class="flex gap-2">
            <Button variant="ghost" onclick={cancelEditing}>Cancel</Button>
            <Button variant="primary" onclick={saveChanges} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  {:else}
    <!-- View Mode -->
    <div class="grid lg:grid-cols-2 gap-6">
      <!-- Basic Info -->
      <Card>
        <CardHeader>
          <h2 class="text-xl font-bold text-neutral-900 dark:text-neutral-100 uppercase">
            Basic Info
          </h2>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
            <span class="text-neutral-500 dark:text-neutral-400">Type:</span>
            <MachineTypeBadge type={machine.machine_type} />
          </div>
          <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
            <span class="text-neutral-500 dark:text-neutral-400">Chain:</span>
            <span class="text-neutral-700 dark:text-neutral-200 uppercase">{machine.chain}</span>
          </div>
          {#if machine.theme}
            <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
              <span class="text-neutral-500 dark:text-neutral-400">Theme:</span>
              <span class="text-neutral-700 dark:text-neutral-200 capitalize">{machine.theme}</span>
            </div>
          {/if}
          <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
            <span class="text-neutral-500 dark:text-neutral-400">Version:</span>
            <span class="text-neutral-700 dark:text-neutral-200">v{machine.version}</span>
          </div>
          <div class="flex justify-between py-2">
            <span class="text-neutral-500 dark:text-neutral-400">Active:</span>
            <span class="text-neutral-700 dark:text-neutral-200">{machine.is_active ? 'Yes' : 'No'}</span>
          </div>
          {#if machine.description}
            <div class="pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <span class="text-neutral-500 dark:text-neutral-400 text-sm block mb-2">Description:</span>
              <p class="text-neutral-600 dark:text-neutral-300">{machine.description}</p>
            </div>
          {/if}
        </CardContent>
      </Card>

      <!-- Contract Info -->
      <Card>
        <CardHeader>
          <h2 class="text-xl font-bold text-neutral-900 dark:text-neutral-100 uppercase">
            Contract Info
          </h2>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
            <span class="text-neutral-500 dark:text-neutral-400">Game Contract:</span>
            <span class="text-neutral-700 dark:text-neutral-200 font-mono">
              {machine.game_contract_id || 'Not deployed'}
            </span>
          </div>
          <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
            <span class="text-neutral-500 dark:text-neutral-400">Treasury Contract:</span>
            <span class="text-neutral-700 dark:text-neutral-200 font-mono">
              {machine.treasury_contract_id || 'Not set'}
            </span>
          </div>
          {#if machine.treasury_asset_id}
            <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
              <span class="text-neutral-500 dark:text-neutral-400">Treasury Asset:</span>
              <span class="text-neutral-700 dark:text-neutral-200 font-mono">{machine.treasury_asset_id}</span>
            </div>
          {/if}
          {#if machine.deployment_tx_id}
            <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
              <span class="text-neutral-500 dark:text-neutral-400">Deploy TX:</span>
              <span class="text-neutral-700 dark:text-neutral-200 font-mono text-xs truncate max-w-48">
                {machine.deployment_tx_id}
              </span>
            </div>
          {/if}
          {#if machine.deployment_error}
            <div class="p-3 bg-error-500/10 rounded-lg border border-error-500/30">
              <span class="text-error-600 dark:text-error-400 text-sm block mb-1">Deployment Error:</span>
              <p class="text-error-500 dark:text-error-300 text-sm">{machine.deployment_error}</p>
            </div>
          {/if}
        </CardContent>
      </Card>

      <!-- Game Config -->
      <Card>
        <CardHeader>
          <h2 class="text-xl font-bold text-neutral-900 dark:text-neutral-100 uppercase">
            Game Config
          </h2>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
            <span class="text-neutral-500 dark:text-neutral-400">Min Bet:</span>
            <span class="text-neutral-700 dark:text-neutral-200">{formatMicroVoi(machine.min_bet)} VOI</span>
          </div>
          <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
            <span class="text-neutral-500 dark:text-neutral-400">Max Bet:</span>
            <span class="text-neutral-700 dark:text-neutral-200">{formatMicroVoi(machine.max_bet)} VOI</span>
          </div>
          {#if machine.rtp_target}
            <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
              <span class="text-neutral-500 dark:text-neutral-400">RTP Target:</span>
              <span class="text-neutral-700 dark:text-neutral-200">{machine.rtp_target}%</span>
            </div>
          {/if}
          {#if machine.house_edge}
            <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
              <span class="text-neutral-500 dark:text-neutral-400">House Edge:</span>
              <span class="text-neutral-700 dark:text-neutral-200">{machine.house_edge}%</span>
            </div>
          {/if}
          {#if machine.config && Object.keys(machine.config).length > 0}
            <div class="pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <span class="text-neutral-500 dark:text-neutral-400 text-sm block mb-2">Config:</span>
              <pre class="text-xs text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 p-3 rounded-lg overflow-x-auto max-h-32 overflow-y-auto">{JSON.stringify(machine.config, null, 2)}</pre>
            </div>
          {/if}
        </CardContent>
      </Card>

      <!-- Platform Settings -->
      <Card>
        <CardHeader>
          <h2 class="text-xl font-bold text-neutral-900 dark:text-neutral-100 uppercase">
            Platform Settings
          </h2>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
            <span class="text-neutral-500 dark:text-neutral-400">Platform Fee:</span>
            <span class="text-neutral-700 dark:text-neutral-200">{machine.platform_fee_percent}%</span>
          </div>
          <div class="flex justify-between py-2">
            <span class="text-neutral-500 dark:text-neutral-400">Treasury Address:</span>
            <span class="text-neutral-700 dark:text-neutral-200 font-mono text-xs truncate max-w-48">
              {machine.platform_treasury_address || 'Not set'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Timestamps -->
    <Card>
      <CardHeader>
        <h2 class="text-xl font-bold text-neutral-900 dark:text-neutral-100 uppercase">
          Timeline
        </h2>
      </CardHeader>
      <CardContent>
        <div class="grid md:grid-cols-4 gap-4">
          <div class="p-4 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg">
            <span class="text-neutral-500 dark:text-neutral-400 text-xs uppercase block mb-1">Created</span>
            <span class="text-neutral-700 dark:text-neutral-200 text-sm">{formatDate(machine.created_at)}</span>
          </div>
          <div class="p-4 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg">
            <span class="text-neutral-500 dark:text-neutral-400 text-xs uppercase block mb-1">Updated</span>
            <span class="text-neutral-700 dark:text-neutral-200 text-sm">{formatDate(machine.updated_at)}</span>
          </div>
          {#if machine.deployment_started_at}
            <div class="p-4 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg">
              <span class="text-neutral-500 dark:text-neutral-400 text-xs uppercase block mb-1">Deploy Started</span>
              <span class="text-neutral-700 dark:text-neutral-200 text-sm">{formatDate(machine.deployment_started_at)}</span>
            </div>
          {/if}
          {#if machine.launched_at}
            <div class="p-4 bg-success-500/10 rounded-lg border border-success-500/30">
              <span class="text-success-600 dark:text-success-400 text-xs uppercase block mb-1">Launched</span>
              <span class="text-success-700 dark:text-success-300 text-sm">{formatDate(machine.launched_at)}</span>
            </div>
          {/if}
          {#if machine.deprecated_at}
            <div class="p-4 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg">
              <span class="text-neutral-500 dark:text-neutral-400 text-xs uppercase block mb-1">Deprecated</span>
              <span class="text-neutral-600 dark:text-neutral-400 text-sm">{formatDate(machine.deprecated_at)}</span>
            </div>
          {/if}
        </div>
      </CardContent>
    </Card>
  {/if}
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
