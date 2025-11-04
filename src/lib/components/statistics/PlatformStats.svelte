<script lang="ts">
  import { fetchPlatformStats } from '$lib/api/statistics';
  import { formatNumberCompact } from '$lib/utils/format';

  interface PlatformStatsProps {
    contractId: number;
    machineDisplayName?: string;
  }

  type Timeframe = 'daily' | 'all-time';

  let {
    contractId,
    machineDisplayName = 'Alpha Slots',
  }: PlatformStatsProps = $props();

  let timeframe = $state<Timeframe>('all-time');
  let selectedDate = $state<Date>(new Date());
  let isLoading = $state(true);
  let isError = $state(false);
  let data = $state<Awaited<ReturnType<typeof fetchPlatformStats>> | null>(null);

  const formatDateForInput = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  async function loadData() {
    isLoading = true;
    isError = false;
    try {
      data = await fetchPlatformStats({
        contractId,
        timeframe,
        date: timeframe === 'daily' ? selectedDate : undefined,
      });
    } catch (error) {
      console.error('Failed to load platform stats:', error);
      isError = true;
    } finally {
      isLoading = false;
    }
  }

  // Load data on mount and when dependencies change
  $effect(() => {
    loadData();
  });

  const stats = $derived(data && data.length > 0 ? data[0] : null);

  const statCards = $derived(stats ? [
    {
      label: 'Total Spins',
      value: formatNumberCompact(stats.total_bets ?? 0),
      change: null,
    },
    {
      label: 'Unique Players',
      value: formatNumberCompact(stats.unique_players ?? 0),
      change: null,
    },
    {
      label: 'Total Wagered',
      value: `${formatNumberCompact((stats.total_amount_bet ?? 0) / 1_000_000)} VOI`,
      subtext: `${((stats.total_amount_bet ?? 0) / 1_000_000).toLocaleString()} microVOI`,
    },
    {
      label: 'Total Paid Out',
      value: `${formatNumberCompact((stats.total_amount_paid ?? 0) / 1_000_000)} VOI`,
      subtext: `${((stats.total_amount_paid ?? 0) / 1_000_000).toLocaleString()} microVOI`,
    },
    {
      label: 'House Profit',
      value: `${formatNumberCompact((stats.net_platform_result ?? 0) / 1_000_000)} VOI`,
      subtext: `${((stats.net_platform_result ?? 0) / 1_000_000).toLocaleString()} microVOI`,
    },
    {
      label: 'Actual RTP',
      value: `${(stats.rtp ?? 0).toFixed(2)}%`,
      change: (stats.rtp ?? 0) >= 96.5 ? 'positive' : 'negative',
    },
    {
      label: 'Win Rate',
      value: `${(stats.win_percentage ?? 0).toFixed(2)}%`,
      change: null,
    },
    {
      label: 'Largest Win',
      value: `${formatNumberCompact((stats.largest_single_win ?? 0) / 1_000_000)} VOI`,
      subtext: `${((stats.largest_single_win ?? 0) / 1_000_000).toLocaleString()} microVOI`,
    },
  ] : []);
</script>

{#if isLoading}
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {#each Array(4) as _, i}
      <div
        class="card p-6 animate-pulse"
      >
        <div class="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-24 mb-4"></div>
        <div class="h-8 bg-neutral-200 dark:bg-neutral-700 rounded w-32"></div>
      </div>
    {/each}
  </div>
{:else if isError || !data || data.length === 0}
  <div class="bg-error-50 dark:bg-error-950/20 border border-error-200 dark:border-error-800 rounded-xl p-6">
    <p class="text-error-600 dark:text-error-400">Failed to load platform statistics</p>
  </div>
{:else if stats}
  <div class="space-y-6">
    <div class="card-elevated p-6">
      <div class="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between mb-4">
        <div>
          <h2 class="text-2xl font-semibold text-neutral-950 dark:text-white mb-1">
            {machineDisplayName}
          </h2>
          <p class="text-neutral-700 dark:text-neutral-300 text-sm">
            Contract ID: {contractId}
          </p>
        </div>

        <div class="flex flex-col sm:flex-row gap-3">
          <div class="flex gap-2">
            {#each ['daily', 'all-time'] as tf}
              <button
                onclick={() => timeframe = tf as Timeframe}
                class="px-4 py-2 rounded-lg text-sm font-semibold transition-all {timeframe === tf
                  ? 'bg-primary-500 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'}"
              >
                {tf === 'daily' ? 'Daily' : 'All Time'}
              </button>
            {/each}
          </div>

          {#if timeframe === 'daily'}
            <input
              type="date"
              value={formatDateForInput(selectedDate)}
              onchange={(e) => selectedDate = new Date(e.currentTarget.value)}
              max={formatDateForInput(new Date())}
              class="px-4 py-2 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-sm font-semibold border-2 border-neutral-300 dark:border-neutral-700 hover:border-primary-400 dark:hover:border-primary-600 transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          {/if}
        </div>
      </div>

      <p class="text-neutral-600 dark:text-neutral-400 text-sm">
        {timeframe === 'daily'
          ? `Showing statistics ${isToday(selectedDate) ? 'for today' : `for ${selectedDate.toLocaleDateString()}`}`
          : 'Showing all-time statistics'}
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {#each statCards as stat}
        <div
          class="card p-6 hover:shadow-md transition-all"
        >
          <p class="text-neutral-700 dark:text-neutral-300 text-sm font-medium mb-2">
            {stat.label}
          </p>
          <p class="text-2xl font-semibold text-neutral-950 dark:text-white mb-1">
            {stat.value}
          </p>
        </div>
      {/each}
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="card p-6">
        <h3 class="text-lg font-semibold text-neutral-950 dark:text-white mb-4">Activity</h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-neutral-700 dark:text-neutral-300 text-sm">Winning Spins</span>
            <span class="text-success-600 dark:text-success-400 font-semibold">
              {formatNumberCompact(stats.total_winning_spins)}
            </span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-neutral-700 dark:text-neutral-300 text-sm">Losing Spins</span>
            <span class="text-warning-600 dark:text-warning-400 font-semibold">
              {formatNumberCompact(stats.total_bets - stats.total_winning_spins)}
            </span>
          </div>
        </div>
      </div>

      <div class="card p-6">
        <h3 class="text-lg font-semibold text-neutral-950 dark:text-white mb-4">Betting Stats</h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-neutral-700 dark:text-neutral-300 text-sm">Avg Bet Size</span>
            <span class="text-neutral-900 dark:text-neutral-100 font-semibold">
              {(stats.average_bet_size / 1_000_000).toFixed(2)} VOI
            </span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-neutral-700 dark:text-neutral-300 text-sm">Largest Bet</span>
            <span class="text-neutral-900 dark:text-neutral-100 font-semibold">
              {(stats.largest_single_bet / 1_000_000).toFixed(2)} VOI
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
