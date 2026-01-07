<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import StatCard from '$lib/components/ui/StatCard.svelte';
  import { CoinsIcon, UsersIcon, TrendingUpIcon, ChartIcon, SlotMachineIcon, BoltIcon } from '$lib/components/icons';
  import ChainBadge from '$lib/components/ui/ChainBadge.svelte';
  import GrandTotalCard from './GrandTotalCard.svelte';
  import TreasuryTable from './TreasuryTable.svelte';
  import type { DashboardStats } from '$lib/types/admin';
  import { formatNumberCompact } from '$lib/utils/format';

  let stats = $state<DashboardStats | null>(null);
  let loading = $state(true);
  let syncing = $state(false);
  let error = $state<string | null>(null);
  let syncError = $state<string | null>(null);
  let lastSyncTime = $state<Date | null>(null);
  let interval: ReturnType<typeof setInterval>;

  onMount(() => {
    fetchDashboardStats();
    // Auto-refresh every 30 seconds
    interval = setInterval(fetchDashboardStats, 30000);
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });

  async function fetchDashboardStats() {
    try {
      const response = await fetch('/api/admin/dashboard');
      const data = await response.json();

      if (data.success) {
        stats = data.data;
        error = null;
      } else {
        error = data.error || 'Failed to fetch dashboard stats';
      }
    } catch (err) {
      console.error('Error fetching dashboard:', err);
      error = 'Failed to load dashboard';
    } finally {
      loading = false;
    }
  }

  async function syncTreasury() {
    syncing = true;
    syncError = null;

    try {
      const response = await fetch('/api/admin/treasury/sync', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        lastSyncTime = new Date();
        // Refresh dashboard stats after sync
        await fetchDashboardStats();
      } else {
        syncError = data.error || 'Failed to sync treasury';
      }
    } catch (err) {
      console.error('Error syncing treasury:', err);
      syncError = 'Failed to sync treasury';
    } finally {
      syncing = false;
    }
  }
</script>

{#if loading}
  <div class="text-center py-12">
    <div class="text-neutral-700 dark:text-neutral-300">Loading dashboard...</div>
  </div>
{:else if error || !stats}
  <Card>
    <CardContent>
      <div class="text-error-600 dark:text-error-400 p-4">{error || 'Failed to load dashboard'}</div>
    </CardContent>
  </Card>
{:else}
  <div class="space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl md:text-4xl font-semibold text-neutral-950 dark:text-white">Platform Dashboard</h1>
        <p class="text-neutral-700 dark:text-neutral-300 mt-2">
          Operations and analytics overview
        </p>
        {#if lastSyncTime}
          <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Last treasury sync: {lastSyncTime.toLocaleTimeString()}
          </p>
        {/if}
      </div>
      <div class="flex gap-2">
        <button
          onclick={syncTreasury}
          disabled={syncing}
          class={`px-4 py-2 text-sm border-2 rounded-lg font-medium transition-colors ${
            syncing
              ? 'border-neutral-300 dark:border-neutral-700 text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
              : 'border-success-300 dark:border-success-700 text-success-600 dark:text-success-400 hover:bg-success-50 dark:hover:bg-success-950'
          }`}
        >
          {syncing ? 'Refreshing...' : 'Refresh'}
        </button>
        <a href="/admin/machines">
          <button class="px-4 py-2 text-sm border-2 border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors font-medium">
            Manage Machines
          </button>
        </a>
        <a href="/admin/analytics">
          <button class="px-4 py-2 text-sm border-2 border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors font-medium">
            Analytics
          </button>
        </a>
      </div>
    </div>

    <!-- Sync Error Message -->
    {#if syncError}
      <Card>
        <CardContent>
          <div class="text-error-600 dark:text-error-400 p-4">{syncError}</div>
        </CardContent>
      </Card>
    {/if}

    <!-- Grand Total Treasury -->
    <GrandTotalCard grandTotal={stats.grand_total} />

    <!-- Individual Machine Treasuries -->
    <TreasuryTable treasuries={stats.treasuries} />

    <!-- Today's Performance -->
    <div>
      <h2 class="text-xl font-semibold text-neutral-950 dark:text-white mb-4">Today's Activity</h2>
      <div class="grid md:grid-cols-5 gap-6">
        <StatCard
          title="Total Volume"
          value={formatNumberCompact(parseFloat(stats.today.total_wagered))}
          subtitle="Across all games"
        >
          {#snippet icon()}
            <CoinsIcon size={24} />
          {/snippet}
        </StatCard>
        <StatCard
          title="Total Rewards"
          value={formatNumberCompact(parseFloat(stats.today.total_payout))}
          subtitle="Player earnings"
        >
          {#snippet icon()}
            <TrendingUpIcon size={24} />
          {/snippet}
        </StatCard>
        <StatCard
          title="Platform Revenue"
          value={formatNumberCompact(parseFloat(stats.today.house_profit))}
          subtitle={`${(
            (parseFloat(stats.today.house_profit) / parseFloat(stats.today.total_wagered || '1')) *
            100
          ).toFixed(1)}% margin`}
        >
          {#snippet icon()}
            <ChartIcon size={24} />
          {/snippet}
        </StatCard>
        <StatCard
          title="Active Users"
          value={stats.today.active_users}
          subtitle="Unique players"
        >
          {#snippet icon()}
            <UsersIcon size={24} />
          {/snippet}
        </StatCard>
        <StatCard
          title="Total Sessions"
          value={stats.today.total_rounds}
          subtitle="Games played"
        >
          {#snippet icon()}
            <SlotMachineIcon size={32} />
          {/snippet}
        </StatCard>
      </div>
    </div>

    <!-- Live Activity -->
    <div class="grid lg:grid-cols-2 gap-6">
      <!-- Live Game Feed -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold text-warning-500 dark:text-warning-400 uppercase flex items-center gap-2">
              <BoltIcon size={24} />
              Live Game Feed
            </h3>
            <div class="flex items-center gap-2">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span class="text-xs text-success-600 dark:text-success-400 font-bold uppercase">Live</span>
            </div>
          </div>
        </CardHeader>
        <CardContent class="space-y-3">
          {#if stats.live_feed.length === 0}
            <div class="text-center py-8 text-neutral-500">No recent activity</div>
          {:else}
            {#each stats.live_feed.slice(0, 10) as game (game.id)}
              {@const profit = parseFloat(game.profit_amount)}
              <div
                class="p-4 rounded-lg border border-warning-200 dark:border-warning-900/20 hover:bg-warning-50 dark:hover:bg-warning-500/5 transition-colors"
              >
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-3">
                    <code class="text-xs font-mono text-neutral-400">
                      {game.player_address.slice(0, 6)}...{game.player_address.slice(-4)}
                    </code>
                    <ChainBadge chain={game.chain} />
                  </div>
                  <div class="text-xs text-neutral-500">
                    {new Date(game.created_at).toLocaleTimeString()}
                  </div>
                </div>
                <div class="flex items-center justify-between">
                  <div class="text-sm">
                    <span class="text-neutral-400">{game.game_name}</span>
                    <span class="text-neutral-600 mx-2">•</span>
                    <span class="text-neutral-300 font-semibold">
                      {parseFloat(game.bet_amount).toFixed(2)}
                    </span>
                  </div>
                  <div class={`font-bold ${profit > 0 ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'}`}>
                    {profit > 0 ? '+' : ''}
                    {profit.toFixed(2)}
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </CardContent>
      </Card>

      <!-- Weekly Summary -->
      <Card>
        <CardHeader>
          <h2 class="text-2xl font-bold text-warning-500 dark:text-warning-400 uppercase">7-Day Summary</h2>
        </CardHeader>
        <CardContent>
          <div class="space-y-6">
            <div class="text-center p-6">
              <div class="text-sm text-neutral-500 uppercase tracking-wider font-bold mb-2">
                Wagered
              </div>
              <div class="text-3xl font-black text-warning-500 dark:text-warning-400">
                {formatNumberCompact(parseFloat(stats.weekly_summary.total_wagered))}
              </div>
            </div>
            <div class="text-center p-6">
              <div class="text-sm text-neutral-500 uppercase tracking-wider font-bold mb-2">
                Paid Out
              </div>
              <div class="text-3xl font-black text-warning-500 dark:text-warning-400">
                {formatNumberCompact(parseFloat(stats.weekly_summary.total_payout))}
              </div>
            </div>
            <div class="text-center p-6">
              <div class="text-sm text-neutral-500 uppercase tracking-wider font-bold mb-2">
                House Profit
              </div>
              <div class="text-3xl font-black text-success-600 dark:text-success-400">
                {formatNumberCompact(parseFloat(stats.weekly_summary.house_profit))}
              </div>
              <div class="text-sm text-neutral-500 mt-1">
                {(
                  (parseFloat(stats.weekly_summary.house_profit) /
                    parseFloat(stats.weekly_summary.total_wagered || '1')) *
                  100
                ).toFixed(2)}
                % margin
              </div>
            </div>
            <div class="text-center p-6">
              <div class="text-sm text-neutral-500 uppercase tracking-wider font-bold mb-2">
                Avg Daily Users
              </div>
              <div class="text-3xl font-black text-warning-500 dark:text-warning-400">
                {stats.weekly_summary.avg_daily_users}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Mimir Platform Statistics (All-Time) -->
    {#if stats.mimir_stats}
      <div>
        <h2 class="text-2xl font-bold text-warning-500 dark:text-warning-400 uppercase mb-4">
          Platform Statistics (All-Time)
        </h2>
        <div class="grid md:grid-cols-4 gap-6">
          <StatCard
            title="Total Spins"
            value={stats.mimir_stats.total_spins.toLocaleString()}
            subtitle="All-time plays"
          >
            {#snippet icon()}
              <SlotMachineIcon size={32} />
            {/snippet}
          </StatCard>
          <StatCard
            title="Total Wagered"
            value={formatNumberCompact(parseInt(stats.mimir_stats.total_bet) / 1e6)}
            subtitle="VOI"
          >
            {#snippet icon()}
              <CoinsIcon size={32} />
            {/snippet}
          </StatCard>
          <StatCard
            title="Total Won"
            value={formatNumberCompact(parseInt(stats.mimir_stats.total_won) / 1e6)}
            subtitle="VOI paid out"
          >
            {#snippet icon()}
              <TrendingUpIcon size={32} />
            {/snippet}
          </StatCard>
          <StatCard
            title="RTP"
            value={`${stats.mimir_stats.rtp.toFixed(2)}%`}
            subtitle={`House Edge: ${stats.mimir_stats.house_edge.toFixed(2)}%`}
          >
            {#snippet icon()}
              <ChartIcon size={32} />
            {/snippet}
          </StatCard>
          <StatCard
            title="Win Rate"
            value={`${stats.mimir_stats.win_rate.toFixed(2)}%`}
            subtitle="Winning spins"
          >
            {#snippet icon()}
              <TrendingUpIcon size={32} />
            {/snippet}
          </StatCard>
          <StatCard
            title="Unique Players"
            value={stats.mimir_stats.unique_players.toLocaleString()}
            subtitle="Total addresses"
          >
            {#snippet icon()}
              <UsersIcon size={32} />
            {/snippet}
          </StatCard>
          <StatCard
            title="Largest Win"
            value={formatNumberCompact(parseInt(stats.mimir_stats.largest_win) / 1e6)}
            subtitle="VOI"
          >
            {#snippet icon()}
              <ChartIcon size={32} />
            {/snippet}
          </StatCard>
          <StatCard
            title="Net Result"
            value={formatNumberCompact(parseInt(stats.mimir_stats.net_result) / 1e6)}
            subtitle={parseInt(stats.mimir_stats.net_result) >= 0 ? 'House Profit' : 'House Loss'}
          >
            {#snippet icon()}
              <ChartIcon size={32} />
            {/snippet}
          </StatCard>
        </div>
      </div>
    {/if}
  </div>
{/if}
