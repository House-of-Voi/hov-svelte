<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import { TrendingUpIcon, UsersIcon, CoinsIcon, ChartIcon } from '$lib/components/icons';
  import ChainBadge from '$lib/components/ui/ChainBadge.svelte';
  import type { AnalyticsOverview } from '$lib/types/admin';
  import { formatNumberCompact } from '$lib/utils/format';

  interface ApiResult {
    success: boolean;
    data?: AnalyticsOverview;
    error?: string;
  }

  const AUTO_REFRESH_INTERVAL_MS = 60_000;

  function truncateAddress(address: string | null) {
    if (!address) return '—';
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }

  let analytics = $state<AnalyticsOverview | null>(null);
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);
  let interval: ReturnType<typeof setInterval>;

  const maxDailyWagered = $derived(() => {
    if (!analytics) return 0;
    return Math.max(
      0,
      ...analytics.daily.map((day) => Number.parseFloat(day.total_wagered))
    );
  });

  onMount(() => {
    fetchAnalytics();
    interval = setInterval(() => fetchAnalytics(true), AUTO_REFRESH_INTERVAL_MS);
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });

  async function fetchAnalytics(background = false) {
    try {
      if (background) {
        refreshing = true;
      } else {
        loading = true;
        error = null;
      }

      const response = await fetch('/api/admin/analytics', {
        cache: 'no-store',
      });
      const body: ApiResult = await response.json();

      if (body.success && body.data) {
        analytics = body.data;
      } else {
        error = body.error || 'Failed to load analytics';
      }
    } catch (err) {
      console.error('Error loading analytics:', err);
      error = 'Failed to load analytics';
    } finally {
      if (background) {
        refreshing = false;
      } else {
        loading = false;
      }
    }
  }
</script>

{#if loading}
  <div class="text-center py-12 text-neutral-600 dark:text-neutral-400">
    Loading analytics…
  </div>
{:else if error || !analytics}
  <Card>
    <CardContent>
      <div class="p-6 text-error-600 dark:text-error-400">{error || 'Unable to load analytics'}</div>
      <button
        onclick={() => fetchAnalytics(false)}
        class="mt-4 px-4 py-2 bg-warning-500 text-white rounded-lg font-semibold hover:bg-warning-400 transition-colors"
      >
        Retry
      </button>
    </CardContent>
  </Card>
{:else}
  <div class="space-y-8 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-4xl font-black text-warning-500 dark:text-warning-400 neon-text uppercase">Analytics</h1>
        <p class="text-neutral-600 dark:text-neutral-400 mt-2">
          Detailed performance metrics and insights
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          onclick={() => fetchAnalytics(true)}
          disabled={refreshing}
          class={`px-4 py-2 text-sm border-2 rounded-lg font-medium transition-colors ${
            refreshing
              ? 'border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-500 cursor-not-allowed'
              : 'border-warning-500/30 text-warning-600 dark:text-warning-400 hover:bg-warning-500/10'
          }`}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <a href="/admin">
          <button class="px-4 py-2 text-sm border-2 border-warning-500/30 text-warning-600 dark:text-warning-400 rounded-lg hover:bg-warning-500/10 transition-colors font-bold uppercase tracking-wide">
            ← Dashboard
          </button>
        </a>
      </div>
    </div>

    <!-- Summary Stats -->
    <div class="grid md:grid-cols-4 gap-6">
      <Card glow>
        <CardContent class="p-6">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm text-neutral-600 dark:text-neutral-500 uppercase tracking-wider font-bold">
              7-Day Volume
            </div>
            <TrendingUpIcon size={24} class="text-warning-500 dark:text-warning-400" />
          </div>
          <div class="text-3xl font-black text-warning-500 dark:text-warning-400">
            {formatNumberCompact(Number(analytics.summary.total_volume))} VOI
          </div>
          <div class="text-xs text-success-600 dark:text-success-400 mt-2">
            House edge {analytics.summary.house_edge.toFixed(2)}%
          </div>
        </CardContent>
      </Card>

      <Card glow>
        <CardContent class="p-6">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm text-neutral-600 dark:text-neutral-500 uppercase tracking-wider font-bold">
              7-Day Profit
            </div>
            <CoinsIcon size={24} class="text-warning-500 dark:text-warning-400" />
          </div>
          <div class="text-3xl font-black text-success-600 dark:text-success-400">
            {formatNumberCompact(Number(analytics.summary.total_profit))} VOI
          </div>
          <div class="text-xs text-neutral-600 dark:text-neutral-500 mt-2">
            Across {analytics.summary.total_rounds.toLocaleString()} rounds
          </div>
        </CardContent>
      </Card>

      <Card glow>
        <CardContent class="p-6">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm text-neutral-600 dark:text-neutral-500 uppercase tracking-wider font-bold">
              Avg Daily Users
            </div>
            <UsersIcon size={24} class="text-warning-500 dark:text-warning-400" />
          </div>
          <div class="text-3xl font-black text-warning-500 dark:text-warning-400">
            {analytics.summary.avg_daily_users.toLocaleString()}
          </div>
          <div class="text-xs text-neutral-600 dark:text-neutral-500 mt-2">
            Last 7 days
          </div>
        </CardContent>
      </Card>

      <Card glow>
        <CardContent class="p-6">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm text-neutral-600 dark:text-neutral-500 uppercase tracking-wider font-bold">
              Total Rounds
            </div>
            <ChartIcon size={24} class="text-warning-500 dark:text-warning-400" />
          </div>
          <div class="text-3xl font-black text-warning-500 dark:text-warning-400">
            {analytics.summary.total_rounds.toLocaleString()}
          </div>
          <div class="text-xs text-neutral-600 dark:text-neutral-500 mt-2">
            30-day trend available below
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Daily Performance -->
    <Card>
      <CardHeader>
        <h2 class="text-2xl font-bold text-warning-500 dark:text-warning-400 uppercase">Daily Performance (7 Days)</h2>
      </CardHeader>
      <CardContent>
        <div class="space-y-3">
          {#each analytics.daily as day (day.date)}
            {@const wagered = Number.parseFloat(day.total_wagered)}
            {@const profit = Number.parseFloat(day.house_profit)}
            {@const barWidth = maxDailyWagered() > 0 ? (wagered / maxDailyWagered()) * 100 : 0}
            <div class="space-y-2">
              <div class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-4 w-48">
                  <span class="text-neutral-600 dark:text-neutral-400 font-mono text-xs">
                    {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span class="text-neutral-600 dark:text-neutral-500">{day.active_users} users</span>
                </div>
                <div class="flex-1 mx-4">
                  <div class="h-8 bg-neutral-100 dark:bg-neutral-900 rounded-lg overflow-hidden border border-warning-200 dark:border-warning-900/20">
                    <div
                      class="h-full bg-gradient-to-r from-warning-500 to-warning-600 flex items-center px-3 transition-all"
                      style="width: {barWidth}%"
                    >
                      <span class="text-xs font-bold text-white whitespace-nowrap">
                        {formatNumberCompact(wagered)} VOI
                      </span>
                    </div>
                  </div>
                </div>
                <div class="text-right w-32">
                  <div class={`font-bold ${profit >= 0 ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'}`}>
                    {profit >= 0 ? '+' : ''}
                    {formatNumberCompact(profit)} VOI
                  </div>
                  <div class="text-xs text-neutral-600 dark:text-neutral-500">
                    {wagered > 0 ? ((profit / wagered) * 100).toFixed(1) : '0.0'}% edge
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </CardContent>
    </Card>

    <!-- Game Performance & Chain Distribution -->
    <div class="grid lg:grid-cols-2 gap-6">
      <!-- Top Games -->
      <Card>
        <CardHeader>
          <h3 class="text-xl font-bold text-warning-500 dark:text-warning-400 uppercase">Game Performance</h3>
        </CardHeader>
        <CardContent class="space-y-4">
          {#if analytics.top_games.length === 0}
            <div class="text-neutral-600 dark:text-neutral-500 text-sm">No gameplay recorded in the last 30 days.</div>
          {:else}
            {#each analytics.top_games as game (game.game_id)}
              {@const wagered = Number.parseFloat(game.total_wagered)}
              {@const profit = Number.parseFloat(game.house_profit)}
              <div class="p-4 rounded-lg border border-warning-200 dark:border-warning-900/20">
                <div class="flex items-center justify-between mb-2">
                  <div class="font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-3">
                    <span class="uppercase text-xs tracking-widest text-warning-600 dark:text-warning-500">{game.game_type}</span>
                    <span>{game.game_name}</span>
                  </div>
                  <div class={`text-lg font-bold ${profit >= 0 ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'}`}>
                    {formatNumberCompact(profit)} VOI
                  </div>
                </div>
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  <div>
                    <div class="text-neutral-600 dark:text-neutral-500 uppercase">Wagered</div>
                    <div class="text-neutral-700 dark:text-neutral-300 font-semibold">{formatNumberCompact(wagered)} VOI</div>
                  </div>
                  <div>
                    <div class="text-neutral-600 dark:text-neutral-500 uppercase">Payout</div>
                    <div class="text-neutral-700 dark:text-neutral-300 font-semibold">
                      {formatNumberCompact(Number(game.total_payout))} VOI
                    </div>
                  </div>
                  <div>
                    <div class="text-neutral-600 dark:text-neutral-500 uppercase">Rounds</div>
                    <div class="text-neutral-700 dark:text-neutral-300 font-semibold">
                      {game.total_rounds.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div class="text-neutral-600 dark:text-neutral-500 uppercase">Players</div>
                    <div class="text-neutral-700 dark:text-neutral-300 font-semibold">
                      {game.unique_players.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </CardContent>
      </Card>

      <!-- Chain Distribution -->
      <Card>
        <CardHeader>
          <h3 class="text-xl font-bold text-warning-500 dark:text-warning-400 uppercase">Chain Distribution</h3>
        </CardHeader>
        <CardContent class="space-y-4">
          {#if analytics.chain_distribution.length === 0}
            <div class="text-neutral-600 dark:text-neutral-500 text-sm">No activity recorded in the selected window.</div>
          {:else}
            {#each analytics.chain_distribution as item (item.chain)}
              <div class="p-4 rounded-lg border border-warning-200 dark:border-warning-900/20">
                <div class="flex items-center justify-between mb-3">
                  <ChainBadge chain={item.chain === 'unknown' ? undefined : item.chain} />
                  <div class="text-sm text-neutral-600 dark:text-neutral-500 uppercase">
                    {item.percentage_of_volume.toFixed(1)}% of volume
                  </div>
                </div>
                <div class="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div class="text-neutral-600 dark:text-neutral-500 uppercase">Wagered</div>
                    <div class="text-neutral-700 dark:text-neutral-300 font-semibold">{formatNumberCompact(Number(item.total_wagered))} VOI</div>
                  </div>
                  <div>
                    <div class="text-neutral-600 dark:text-neutral-500 uppercase">Payout</div>
                    <div class="text-neutral-700 dark:text-neutral-300 font-semibold">{formatNumberCompact(Number(item.total_payout))} VOI</div>
                  </div>
                  <div>
                    <div class="text-neutral-600 dark:text-neutral-500 uppercase">Profit</div>
                    <div class={`font-semibold ${Number(item.house_profit) >= 0 ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'}`}>
                      {formatNumberCompact(Number(item.house_profit))} VOI
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </CardContent>
      </Card>
    </div>

    <!-- Top Players -->
    <Card>
      <CardHeader>
        <h3 class="text-xl font-bold text-warning-500 dark:text-warning-400 uppercase">Top Players (All Time)</h3>
      </CardHeader>
      <CardContent>
        {#if analytics.top_players.length === 0}
          <div class="text-neutral-600 dark:text-neutral-500 text-sm">No player activity recorded.</div>
        {:else}
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="text-left text-neutral-600 dark:text-neutral-500 uppercase tracking-wider text-xs border-b border-warning-200 dark:border-warning-900/20">
                  <th class="py-3 pr-4 font-semibold">Player</th>
                  <th class="py-3 pr-4 font-semibold">Email</th>
                  <th class="py-3 pr-4 font-semibold">Address</th>
                  <th class="py-3 pr-4 font-semibold text-right">Wagered (VOI)</th>
                  <th class="py-3 pr-4 font-semibold text-right">Payout (VOI)</th>
                  <th class="py-3 pr-4 font-semibold text-right">Net (VOI)</th>
                  <th class="py-3 pr-4 font-semibold text-right">Wins</th>
                  <th class="py-3 pr-4 font-semibold text-right">Losses</th>
                  <th class="py-3 font-semibold">Last Active</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-warning-200/20 dark:divide-warning-900/10">
                {#each analytics.top_players as player, index}
                  {@const net = Number.parseFloat(player.net_profit)}
                  {@const rowKey = player.profile_id ?? `${player.primary_address ?? player.primary_email ?? 'player'}-${index}`}
                  <tr class="text-neutral-800 dark:text-neutral-200">
                    <td class="py-3 pr-4">
                      {player.display_name || 'Anonymous'}
                    </td>
                    <td class="py-3 pr-4 text-neutral-600 dark:text-neutral-400">
                      {player.primary_email || '—'}
                    </td>
                    <td class="py-3 pr-4 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                      {truncateAddress(player.primary_address)}
                    </td>
                    <td class="py-3 pr-4 text-right">
                      {formatNumberCompact(Number(player.total_wagered))} VOI
                    </td>
                    <td class="py-3 pr-4 text-right">
                      {formatNumberCompact(Number(player.total_payout))} VOI
                    </td>
                    <td class={`py-3 pr-4 text-right font-semibold ${net >= 0 ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'}`}>
                      {net >= 0 ? '+' : ''}
                      {formatNumberCompact(net)} VOI
                    </td>
                    <td class="py-3 pr-4 text-right">
                      {player.wins}
                    </td>
                    <td class="py-3 pr-4 text-right">
                      {player.losses}
                    </td>
                    <td class="py-3 text-neutral-600 dark:text-neutral-400">
                      {player.last_play_at
                        ? new Date(player.last_play_at).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </CardContent>
    </Card>
  </div>
{/if}
