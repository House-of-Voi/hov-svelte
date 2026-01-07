<script lang="ts">
  import { onMount } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import SlotMachineIcon from '$lib/components/icons/SlotMachineIcon.svelte';
  import MachineStatusBadge from '$lib/components/admin/machines/MachineStatusBadge.svelte';
  import MachineTypeBadge from '$lib/components/admin/machines/MachineTypeBadge.svelte';
  import { notificationStore } from '$lib/stores/notificationStore.svelte';
  import type { MachineListItem, PaginatedResponse } from '$lib/types/admin';
  import type { MachineType, MachineStatus } from '$lib/types/database';

  interface ApiResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
  }

  type MachinesResponse = PaginatedResponse<MachineListItem>;

  const PAGE_SIZE = 20;

  let machines = $state<MachineListItem[]>([]);
  let page = $state(1);
  let pagination = $state({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    total_pages: 0
  });

  // Filters
  let typeFilter = $state<MachineType | 'all'>('all');
  let statusFilter = $state<MachineStatus | 'all'>('all');
  let chainFilter = $state<'all' | 'voi' | 'base' | 'solana'>('all');

  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);

  // AbortController for canceling in-flight requests
  let currentFetchController: AbortController | null = null;

  const formatMicroVoi = (microVoi: number | string) => {
    const value = typeof microVoi === 'string' ? parseFloat(microVoi) : microVoi;
    return (value / 1_000_000).toFixed(2);
  };

  const fetchMachines = async (background = false) => {
    // Cancel any in-flight request to prevent race conditions
    if (currentFetchController) {
      currentFetchController.abort();
    }
    currentFetchController = new AbortController();

    try {
      if (background) {
        refreshing = true;
      } else {
        loading = true;
        error = null;
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: PAGE_SIZE.toString()
      });

      if (typeFilter !== 'all') params.set('machine_type', typeFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (chainFilter !== 'all') params.set('chain', chainFilter);

      const response = await fetch(`/api/admin/machines?${params.toString()}`, {
        cache: 'no-store',
        signal: currentFetchController.signal
      });
      const body: ApiResult<MachinesResponse> = await response.json();

      if (body.success && body.data) {
        machines = body.data.data;
        pagination = body.data.pagination;
      } else {
        error = body.error || 'Failed to fetch machines';
      }
    } catch (err) {
      // Ignore abort errors - they're expected when canceling requests
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('Error fetching machines:', err);
      error = 'Failed to load machines';
    } finally {
      currentFetchController = null;
      if (background) {
        refreshing = false;
      } else {
        loading = false;
      }
    }
  };

  const handleToggleStatus = async (machine: MachineListItem) => {
    if (machine.status === 'draft') {
      notificationStore.info('Draft machines cannot be toggled. Deploy first.');
      return;
    }

    if (machine.status !== 'active' && machine.status !== 'paused') {
      notificationStore.info(`Cannot toggle machines with status: ${machine.status}`);
      return;
    }

    // Optimistic update
    const originalActive = machine.is_active;
    const machineIndex = machines.findIndex((m) => m.id === machine.id);
    if (machineIndex !== -1) {
      machines[machineIndex] = { ...machines[machineIndex], is_active: !originalActive };
      machines = [...machines];
    }

    try {
      const response = await fetch(`/api/admin/machines/${machine.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_active: !originalActive
        })
      });

      const result: ApiResult<MachineListItem> = await response.json();

      if (result.success) {
        notificationStore.success(`Machine ${originalActive ? 'paused' : 'activated'} successfully`);
        // Refresh to get updated data from server
        fetchMachines(true);
      } else {
        // Rollback on failure
        if (machineIndex !== -1) {
          machines[machineIndex] = { ...machines[machineIndex], is_active: originalActive };
          machines = [...machines];
        }
        notificationStore.error(result.error || 'Failed to update machine');
      }
    } catch (err) {
      // Rollback on error
      if (machineIndex !== -1) {
        machines[machineIndex] = { ...machines[machineIndex], is_active: originalActive };
        machines = [...machines];
      }
      console.error('Error toggling machine status:', err);
      notificationStore.error('Failed to update machine');
    }
  };

  // Fixed: $derived should not use a function wrapper
  const paginatedLabel = $derived(
    pagination.total === 0
      ? 'No machines'
      : `Showing ${(pagination.page - 1) * pagination.limit + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total}`
  );

  // Load initial data on mount instead of using $effect
  onMount(() => {
    fetchMachines();
  });
</script>

<svelte:head>
  <title>Machines - Admin - House of Voi</title>
</svelte:head>

<div class="space-y-8 max-w-7xl mx-auto">
  <!-- Header -->
  <div class="flex items-center justify-between flex-wrap gap-4">
    <div>
      <h1 class="text-4xl font-semibold text-neutral-950 dark:text-white uppercase">Machines</h1>
      <p class="text-neutral-700 dark:text-neutral-300 mt-2">
        Manage game machines - slots, keno, roulette contracts
      </p>
    </div>
    <div class="flex gap-2 flex-wrap">
      <button
        onclick={() => fetchMachines(true)}
        disabled={refreshing}
        aria-label="Refresh machine list"
        class="px-4 py-2 text-sm border-2 rounded-lg font-medium transition-colors {refreshing
          ? 'border-neutral-300 dark:border-neutral-700 text-neutral-400 dark:text-neutral-500 cursor-not-allowed'
          : 'border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950'}"
      >
        {refreshing ? 'Refreshing...' : 'Refresh'}
      </button>
      <a href="/admin/machines/register">
        <Button variant="outline" size="sm">Register Existing</Button>
      </a>
      <a href="/admin/machines/new">
        <Button variant="primary" size="sm">Create New</Button>
      </a>
    </div>
  </div>

  <!-- Filters -->
  <Card>
    <CardContent>
      <fieldset>
        <legend class="sr-only">Filter machines</legend>
        <div class="grid md:grid-cols-4 gap-4">
          <div>
            <label for="type-filter" class="sr-only">Filter by machine type</label>
            <select
              id="type-filter"
              bind:value={typeFilter}
              onchange={() => {
                page = 1;
                fetchMachines();
              }}
              aria-label="Filter by machine type"
              class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
            >
              <option value="all">All Types</option>
              <option value="slots_5reel">5-Reel Slots</option>
              <option value="slots_w2w">Ways to Win Slots</option>
              <option value="keno">Keno</option>
              <option value="roulette">Roulette</option>
            </select>
          </div>
          <div>
            <label for="status-filter" class="sr-only">Filter by status</label>
            <select
              id="status-filter"
              bind:value={statusFilter}
              onchange={() => {
                page = 1;
                fetchMachines();
              }}
              aria-label="Filter by status"
              class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="deploying">Deploying</option>
              <option value="bootstrapping">Bootstrapping</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="failed">Failed</option>
              <option value="deprecated">Deprecated</option>
            </select>
          </div>
          <div>
            <label for="chain-filter" class="sr-only">Filter by chain</label>
            <select
              id="chain-filter"
              bind:value={chainFilter}
              onchange={() => {
                page = 1;
                fetchMachines();
              }}
              aria-label="Filter by chain"
              class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
            >
              <option value="all">All Chains</option>
              <option value="voi">VOI</option>
              <option value="base">Base</option>
              <option value="solana">Solana</option>
            </select>
          </div>
          <div class="flex items-center justify-end text-xs text-neutral-600 dark:text-neutral-400" aria-live="polite">
            {paginatedLabel}
          </div>
        </div>
      </fieldset>
    </CardContent>
  </Card>

  <!-- Results -->
  {#if error}
    <Card>
      <CardContent>
        <div class="p-4 text-error-600 dark:text-error-400" role="alert">{error}</div>
      </CardContent>
    </Card>
  {:else if loading}
    <Card>
      <CardContent>
        <div class="p-8 text-center text-neutral-500" role="status" aria-live="polite">
          <span class="sr-only">Loading machines</span>
          Loading machines...
        </div>
      </CardContent>
    </Card>
  {:else if machines.length === 0}
    <Card>
      <CardContent>
        <div class="p-8 text-center">
          <div class="text-neutral-500 mb-4">No machines match your filters.</div>
          <div class="flex gap-2 justify-center">
            <a href="/admin/machines/new">
              <Button variant="primary" size="sm">Create New Machine</Button>
            </a>
            <a href="/admin/machines/register">
              <Button variant="outline" size="sm">Register Existing</Button>
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  {:else}
    <div class="space-y-4" role="list" aria-label="Machines list">
      {#each machines as machine (machine.id)}
        <Card glow={machine.is_active}>
          <CardContent class="p-6">
            <div class="grid lg:grid-cols-12 gap-6" role="listitem">
              <!-- Machine Info -->
              <div class="lg:col-span-5 space-y-3">
                <div class="flex items-start gap-4">
                  <div class="text-primary-600 dark:text-primary-400" aria-hidden="true">
                    <SlotMachineIcon size={40} />
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 class="text-xl font-black text-neutral-900 dark:text-neutral-100 uppercase">
                        {machine.display_name}
                      </h3>
                      <MachineStatusBadge status={machine.status} />
                    </div>
                    <p class="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
                      {machine.name}
                    </p>
                    {#if machine.description}
                      <p class="text-neutral-600 dark:text-neutral-400 text-sm mt-2">
                        {machine.description}
                      </p>
                    {/if}
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <MachineTypeBadge type={machine.machine_type} />
                  <span class="px-2 py-1 text-xs rounded border font-medium bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/30 uppercase">
                    {machine.chain}
                  </span>
                  {#if machine.theme}
                    <span class="px-2 py-1 text-xs rounded border font-medium bg-primary-500/10 text-primary-600 dark:text-primary-400 border-primary-500/30 capitalize">
                      {machine.theme}
                    </span>
                  {/if}
                </div>

                <!-- Deployment progress indicator for in-progress deployments -->
                {#if machine.status === 'deploying' || machine.status === 'bootstrapping'}
                  <div class="flex items-center gap-2 text-sm text-warning-600 dark:text-warning-400 mt-2">
                    <span class="w-2 h-2 bg-warning-500 dark:bg-warning-400 rounded-full animate-pulse"></span>
                    <span>Deployment in progress - click Resume to continue</span>
                  </div>
                {/if}

                <!-- Deployment error for failed machines -->
                {#if machine.status === 'failed' && machine.deployment_error}
                  <div class="text-sm text-error-600 dark:text-error-400 mt-2 truncate" title={machine.deployment_error}>
                    Error: {machine.deployment_error}
                  </div>
                {/if}
              </div>

              <!-- Contract Info -->
              <div class="lg:col-span-4">
                <dl class="space-y-2 text-sm">
                  {#if machine.game_contract_id}
                    <div class="flex justify-between py-1 border-b border-neutral-200 dark:border-neutral-700">
                      <dt class="text-neutral-500 dark:text-neutral-400">Game Contract:</dt>
                      <dd class="text-neutral-700 dark:text-neutral-300 font-mono">{machine.game_contract_id}</dd>
                    </div>
                  {/if}
                  {#if machine.treasury_contract_id}
                    <div class="flex justify-between py-1 border-b border-neutral-200 dark:border-neutral-700">
                      <dt class="text-neutral-500 dark:text-neutral-400">Treasury Contract:</dt>
                      <dd class="text-neutral-700 dark:text-neutral-300 font-mono">{machine.treasury_contract_id}</dd>
                    </div>
                  {/if}
                  <div class="flex justify-between py-1 border-b border-neutral-200 dark:border-neutral-700">
                    <dt class="text-neutral-500 dark:text-neutral-400">Bet Range:</dt>
                    <dd class="text-neutral-700 dark:text-neutral-300">
                      {formatMicroVoi(machine.min_bet)} - {formatMicroVoi(machine.max_bet)} VOI
                    </dd>
                  </div>
                  {#if machine.house_edge}
                    <div class="flex justify-between py-1 border-b border-neutral-200 dark:border-neutral-700">
                      <dt class="text-neutral-500 dark:text-neutral-400">House Edge:</dt>
                      <dd class="text-neutral-700 dark:text-neutral-300">{machine.house_edge}%</dd>
                    </div>
                  {/if}
                  <div class="flex justify-between py-1">
                    <dt class="text-neutral-500 dark:text-neutral-400">Platform Fee:</dt>
                    <dd class="text-neutral-700 dark:text-neutral-300">{machine.platform_fee_percent}%</dd>
                  </div>
                </dl>
              </div>

              <!-- Actions -->
              <div class="lg:col-span-3 flex flex-col gap-2">
                <a href="/admin/machines/{machine.id}">
                  <Button variant="outline" size="sm" class="w-full">
                    View Details
                  </Button>
                </a>
                {#if machine.status === 'draft'}
                  <a href="/admin/machines/{machine.id}">
                    <Button variant="primary" size="sm" class="w-full">
                      Edit Draft
                    </Button>
                  </a>
                  <a href="/admin/machines/{machine.id}/deploy">
                    <Button variant="outline" size="sm" class="w-full">
                      Deploy
                    </Button>
                  </a>
                {:else if machine.status === 'deploying' || machine.status === 'bootstrapping'}
                  <a href="/admin/machines/{machine.id}/deploy">
                    <Button variant="primary" size="sm" class="w-full">
                      <span class="flex items-center gap-2">
                        <span class="w-2 h-2 bg-warning-400 rounded-full animate-pulse"></span>
                        Resume Deployment
                      </span>
                    </Button>
                  </a>
                {:else if machine.status === 'failed'}
                  <a href="/admin/machines/{machine.id}/deploy">
                    <Button variant="outline" size="sm" class="w-full border-error-500/50 text-error-400 hover:bg-error-500/10">
                      Retry Deployment
                    </Button>
                  </a>
                {:else if machine.status === 'active' || machine.status === 'paused'}
                  <Button
                    variant={machine.is_active ? 'outline' : 'primary'}
                    size="sm"
                    onclick={() => handleToggleStatus(machine)}
                    class="w-full"
                    aria-label="{machine.is_active ? 'Pause' : 'Activate'} {machine.display_name}"
                  >
                    {machine.is_active ? 'Pause' : 'Activate'}
                  </Button>
                {/if}
                <div class="text-xs text-neutral-500 dark:text-neutral-400 text-center mt-auto">
                  v{machine.version} · Created {new Date(machine.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      {/each}
    </div>
  {/if}

  <!-- Pagination controls -->
  {#if pagination.total_pages > 1}
    <nav aria-label="Machines pagination" class="flex items-center justify-between">
      <span class="text-sm text-neutral-600 dark:text-neutral-400" aria-live="polite">{paginatedLabel}</span>
      <div class="flex gap-2" role="group" aria-label="Pagination controls">
        <button
          onclick={() => {
            page = Math.max(page - 1, 1);
            fetchMachines();
          }}
          disabled={page === 1}
          aria-label="Go to previous page"
          class="px-3 py-2 text-sm rounded-lg border {page === 1
            ? 'border-neutral-300 dark:border-neutral-700 text-neutral-400 dark:text-neutral-500 cursor-not-allowed'
            : 'border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950'}"
        >
          Previous
        </button>
        <button
          onclick={() => {
            page = Math.min(page + 1, pagination.total_pages);
            fetchMachines();
          }}
          disabled={page >= pagination.total_pages}
          aria-label="Go to next page"
          class="px-3 py-2 text-sm rounded-lg border {page >= pagination.total_pages
            ? 'border-neutral-300 dark:border-neutral-700 text-neutral-400 dark:text-neutral-500 cursor-not-allowed'
            : 'border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950'}"
        >
          Next
        </button>
      </div>
    </nav>
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
