<script lang="ts">
  import { onMount } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import SlotMachineIcon from '$lib/components/icons/SlotMachineIcon.svelte';
  import { notificationStore } from '$lib/stores/notificationStore.svelte';
  import type { SlotMachineConfigListItem, PaginatedResponse } from '$lib/types/admin';

  interface ApiResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
  }

  type SlotConfigsResponse = PaginatedResponse<SlotMachineConfigListItem>;

  const PAGE_SIZE = 20;

  let games = $state<SlotMachineConfigListItem[]>([]);
  let page = $state(1);
  let pagination = $state({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    total_pages: 0,
  });
  let chainFilter = $state<'all' | 'base' | 'voi' | 'solana'>('all');
  let statusFilter = $state<'all' | 'active' | 'inactive'>('all');
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);
  let editingGame = $state<SlotMachineConfigListItem | null>(null);

  const toPercent = (value: string | number) => {
    const numeric = typeof value === 'string' ? parseFloat(value) : value;
    if (Number.isNaN(numeric)) return '0.00';
    return numeric.toFixed(2);
  };

  const formatMicroVoi = (microVoi: number) => {
    return (microVoi / 1000000).toFixed(6);
  };

  const formatNumberCompact = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(2) + 'K';
    }
    return num.toFixed(2);
  };

  const fetchGames = async (background = false) => {
    try {
      if (background) {
        refreshing = true;
      } else {
        loading = true;
        error = null;
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: PAGE_SIZE.toString(),
      });

      if (chainFilter !== 'all') params.set('chain', chainFilter);
      if (statusFilter !== 'all') params.set('is_active', statusFilter === 'active' ? 'true' : 'false');

      const response = await fetch(`/api/admin/slot-configs?${params.toString()}`, {
        cache: 'no-store',
      });
      const body: ApiResult<SlotConfigsResponse> = await response.json();

      if (body.success && body.data) {
        games = body.data.data;
        pagination = body.data.pagination;
      } else {
        error = body.error || 'Failed to fetch slot machine configurations';
      }
    } catch (err) {
      console.error('Error fetching slot configs:', err);
      error = 'Failed to load slot machine data';
    } finally {
      if (background) {
        refreshing = false;
      } else {
        loading = false;
      }
    }
  };

  const handleToggleGameStatus = async (game: SlotMachineConfigListItem) => {
    notificationStore.info(
      `Status toggling for ${game.display_name} will be implemented in the next phase`
    );
  };

  const openEditModal = (game: SlotMachineConfigListItem) => {
    editingGame = game;
  };

  const closeEditModal = () => {
    editingGame = null;
  };

  const paginatedLabel = $derived(() => {
    if (pagination.total === 0) return 'No games';
    const start = (pagination.page - 1) * pagination.limit + 1;
    const end = Math.min(pagination.page * pagination.limit, pagination.total);
    return `Showing ${start}-${end} of ${pagination.total}`;
  });

  $effect(() => {
    fetchGames();
  });

  onMount(() => {
    fetchGames();
  });
</script>

<div class="space-y-8 max-w-7xl mx-auto">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-4xl font-semibold text-neutral-950 dark:text-white uppercase">Slot Machine Configurations</h1>
      <p class="text-neutral-700 dark:text-neutral-300 mt-2">
        Monitor and configure all slot machine games from the database
      </p>
    </div>
    <div class="flex gap-2">
      <button
        onclick={() => fetchGames(true)}
        disabled={refreshing}
        class={`px-4 py-2 text-sm border-2 rounded-lg font-medium transition-colors ${
          refreshing
            ? 'border-neutral-700 text-neutral-500 cursor-not-allowed'
            : 'border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950'
        }`}
      >
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
      <a href="/admin">
        <Button variant="ghost" size="sm">
          ← Back to Dashboard
        </Button>
      </a>
    </div>
  </div>

  <!-- Filters -->
  <Card>
    <CardContent>
      <div class="grid md:grid-cols-4 gap-4">
        <select
          bind:value={chainFilter}
          onchange={() => {
            page = 1;
            fetchGames();
          }}
          class="px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
        >
          <option value="all">All Chains</option>
          <option value="voi">VOI</option>
          <option value="base">Base</option>
          <option value="solana">Solana</option>
        </select>
        <select
          bind:value={statusFilter}
          onchange={() => {
            page = 1;
            fetchGames();
          }}
          class="px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div class="md:col-span-2 flex items-center justify-end text-xs text-neutral-600 dark:text-neutral-400">
          {paginatedLabel()}
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- Results -->
  {#if error}
    <Card>
      <CardContent>
        <div class="p-4 text-error-600 dark:text-error-400">{error}</div>
      </CardContent>
    </Card>
  {:else if loading}
    <Card>
      <CardContent>
        <div class="p-8 text-center text-neutral-500">Loading games…</div>
      </CardContent>
    </Card>
  {:else if games.length === 0}
    <Card>
      <CardContent>
        <div class="p-8 text-center text-neutral-500">No games match your filters.</div>
      </CardContent>
    </Card>
  {:else}
    <div class="space-y-6">
      {#each games as game (game.id)}
        {@const totalWagered = parseFloat(game.total_wagered || '0')}
        {@const totalPayout = parseFloat(game.total_payout || '0')}
        {@const profit = totalWagered - totalPayout}
        {@const actualEdge = totalWagered > 0 ? ((profit / totalWagered) * 100).toFixed(2) : '0.00'}

        <Card glow={game.is_active}>
          <CardContent class="p-8">
            <div class="grid lg:grid-cols-12 gap-6">
              <!-- Game Info -->
              <div class="lg:col-span-4 space-y-4">
                <div class="flex items-center gap-4">
                  <div class="text-primary-600 dark:text-primary-400">
                    <SlotMachineIcon size={48} />
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center gap-3">
                      <h3 class="text-2xl font-black text-neutral-900 dark:text-neutral-100 uppercase">
                        {game.display_name}
                      </h3>
                      {#if game.is_active}
                        <span class="px-2 py-1 bg-success-100 dark:bg-success-500/20 text-success-600 dark:text-success-400 text-xs rounded-full border border-success-300 dark:border-success-500/30 font-bold uppercase">
                          Active
                        </span>
                      {:else}
                        <span class="px-2 py-1 bg-neutral-700 text-neutral-400 text-xs rounded-full border border-neutral-600 font-bold uppercase">
                          Inactive
                        </span>
                      {/if}
                    </div>
                    <p class="text-neutral-400 text-sm mt-1">
                      {game.description || 'No description provided.'}
                    </p>
                    <p class="text-neutral-500 text-xs mt-1">
                      Contract ID: {game.contract_id} • Chain: {game.chain.toUpperCase()}
                    </p>
                  </div>
                </div>

                <!-- Configuration -->
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
                    <span class="text-neutral-500">House Edge:</span>
                    <span class="text-neutral-300 font-semibold">
                      {toPercent(game.house_edge)}%
                    </span>
                  </div>
                  <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
                    <span class="text-neutral-500">RTP Target:</span>
                    <span class="text-neutral-300 font-semibold">
                      {toPercent(game.rtp_target)}%
                    </span>
                  </div>
                  <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
                    <span class="text-neutral-500">Min/Max Bet:</span>
                    <span class="text-neutral-300 font-semibold">
                      {formatMicroVoi(game.min_bet)} - {formatMicroVoi(game.max_bet)} VOI
                    </span>
                  </div>
                  <div class="flex justify-between py-2">
                    <span class="text-neutral-500">Total Spins:</span>
                    <span class="text-neutral-300 font-semibold">
                      {(game.total_spins || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Statistics -->
              <div class="lg:col-span-5 grid grid-cols-2 gap-4">
                <div class="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
                  <div class="text-xs text-neutral-500 uppercase tracking-wider font-bold mb-2">
                    Total Wagered
                  </div>
                  <div class="text-2xl font-black text-primary-600 dark:text-primary-400">
                    {formatNumberCompact(totalWagered)} VOI
                  </div>
                </div>
                <div class="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
                  <div class="text-xs text-neutral-500 uppercase tracking-wider font-bold mb-2">
                    Total Payout
                  </div>
                  <div class="text-2xl font-black text-primary-600 dark:text-primary-400">
                    {formatNumberCompact(totalPayout)} VOI
                  </div>
                </div>
                <div class="p-4 rounded-lg border border-success-200 dark:border-success-900/20 bg-success-50 dark:bg-success-500/5">
                  <div class="text-xs text-neutral-600 dark:text-neutral-500 uppercase tracking-wider font-bold mb-2">
                    House Profit
                  </div>
                  <div class={`text-2xl font-black ${profit >= 0 ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'}`}>
                    {formatNumberCompact(profit)} VOI
                  </div>
                </div>
                <div class="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
                  <div class="text-xs text-neutral-500 uppercase tracking-wider font-bold mb-2">
                    Actual Edge
                  </div>
                  <div class="text-2xl font-black text-primary-600 dark:text-primary-400">
                    {actualEdge}%
                  </div>
                  <div class="text-xs text-neutral-500 mt-1">
                    Target: {toPercent(game.house_edge)}%
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="lg:col-span-3 flex flex-col gap-3">
                <Button
                  variant={game.is_active ? 'outline' : 'primary'}
                  size="md"
                  onclick={() => handleToggleGameStatus(game)}
                  class="w-full"
                >
                  {game.is_active ? 'Deactivate' : 'Activate'}
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onclick={() => openEditModal(game)}
                  class="w-full"
                >
                  View Configuration
                </Button>
                {#if game.theme}
                  <div class="px-3 py-2 bg-neutral-800/50 rounded-lg text-center">
                    <span class="text-xs text-neutral-400">Theme:</span>
                    <span class="text-sm text-primary-600 dark:text-primary-400 font-semibold ml-2 capitalize">{game.theme}</span>
                  </div>
                {/if}
              </div>
            </div>
          </CardContent>
        </Card>
      {/each}
    </div>
  {/if}

  <!-- Pagination controls -->
  {#if pagination.total_pages > 1}
    <div class="flex items-center justify-between">
      <span class="text-sm text-neutral-500">{paginatedLabel()}</span>
      <div class="flex gap-2">
        <button
          onclick={() => {
            page = Math.max(page - 1, 1);
            fetchGames();
          }}
          disabled={page === 1}
          class={`px-3 py-2 text-sm rounded-lg border ${
            page === 1
              ? 'border-neutral-700 text-neutral-500 cursor-not-allowed'
              : 'border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950'
          }`}
        >
          Previous
        </button>
        <button
          onclick={() => {
            page = Math.min(page + 1, pagination.total_pages);
            fetchGames();
          }}
          disabled={page >= pagination.total_pages}
          class={`px-3 py-2 text-sm rounded-lg border ${
            page >= pagination.total_pages
              ? 'border-neutral-700 text-neutral-500 cursor-not-allowed'
              : 'border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950'
          }`}
        >
          Next
        </button>
      </div>
    </div>
  {/if}
</div>

<!-- View Game Configuration Modal -->
{#if editingGame}
  <div class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <Card class="max-w-3xl w-full max-h-[90vh] overflow-y-auto">
      <CardHeader>
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-bold text-neutral-900 dark:text-neutral-100 uppercase">
            {editingGame.display_name} Configuration
          </h2>
          <button
            onclick={closeEditModal}
            class="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-2xl"
          >
            ×
          </button>
        </div>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="grid md:grid-cols-2 gap-4">
          <div class="p-4 bg-neutral-800/50 rounded-lg">
            <div class="text-xs text-neutral-500 uppercase mb-1">Internal Name</div>
            <div class="text-neutral-300 font-semibold">{editingGame.name}</div>
          </div>
          <div class="p-4 bg-neutral-800/50 rounded-lg">
            <div class="text-xs text-neutral-500 uppercase mb-1">Contract ID</div>
            <div class="text-neutral-300 font-semibold">{editingGame.contract_id}</div>
          </div>
          <div class="p-4 bg-neutral-800/50 rounded-lg">
            <div class="text-xs text-neutral-500 uppercase mb-1">Chain</div>
            <div class="text-neutral-300 font-semibold uppercase">{editingGame.chain}</div>
          </div>
          <div class="p-4 bg-neutral-800/50 rounded-lg">
            <div class="text-xs text-neutral-500 uppercase mb-1">Theme</div>
            <div class="text-neutral-300 font-semibold capitalize">{editingGame.theme || 'None'}</div>
          </div>
          <div class="p-4 bg-neutral-800/50 rounded-lg">
            <div class="text-xs text-neutral-500 uppercase mb-1">House Edge</div>
            <div class="text-neutral-300 font-semibold">{toPercent(editingGame.house_edge)}%</div>
          </div>
          <div class="p-4 bg-neutral-800/50 rounded-lg">
            <div class="text-xs text-neutral-500 uppercase mb-1">RTP Target</div>
            <div class="text-neutral-300 font-semibold">{toPercent(editingGame.rtp_target)}%</div>
          </div>
          <div class="p-4 bg-neutral-800/50 rounded-lg">
            <div class="text-xs text-neutral-500 uppercase mb-1">Min Bet</div>
            <div class="text-neutral-300 font-semibold">{formatMicroVoi(editingGame.min_bet)} VOI</div>
          </div>
          <div class="p-4 bg-neutral-800/50 rounded-lg">
            <div class="text-xs text-neutral-500 uppercase mb-1">Max Bet</div>
            <div class="text-neutral-300 font-semibold">{formatMicroVoi(editingGame.max_bet)} VOI</div>
          </div>
          <div class="p-4 bg-neutral-800/50 rounded-lg">
            <div class="text-xs text-neutral-500 uppercase mb-1">Max Paylines</div>
            <div class="text-neutral-300 font-semibold">{editingGame.max_paylines}</div>
          </div>
          <div class="p-4 bg-neutral-800/50 rounded-lg">
            <div class="text-xs text-neutral-500 uppercase mb-1">Version</div>
            <div class="text-neutral-300 font-semibold">v{editingGame.version}</div>
          </div>
        </div>

        {#if editingGame.description}
          <div class="p-4 bg-neutral-800/50 rounded-lg">
            <div class="text-xs text-neutral-500 uppercase mb-2">Description</div>
            <div class="text-neutral-300">{editingGame.description}</div>
          </div>
        {/if}

        <div class="p-4 bg-neutral-800/50 rounded-lg">
          <div class="text-xs text-neutral-500 uppercase mb-2">Reel Configuration</div>
          <pre class="text-xs text-neutral-400 overflow-x-auto max-h-48 overflow-y-auto">{JSON.stringify(editingGame.reel_config, null, 2)}</pre>
        </div>

        <div class="flex gap-3">
          <Button
            variant="ghost"
            size="md"
            onclick={closeEditModal}
            class="w-full"
          >
            Close
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
{/if}
