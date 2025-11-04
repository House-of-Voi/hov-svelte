<script lang="ts">
  import { fetchLeaderboard } from '$lib/api/statistics';
  import { formatNumberCompact, formatVoi, formatPercent } from '$lib/utils/format';
  import type { MimirLeaderboardEntry } from '$lib/types/database';

  interface LeaderboardProps {
    contractId?: number;
    limit?: number;
  }

  type Timeframe = 'daily' | 'all-time';
  type RankBy = 'won' | 'profit' | 'rtp' | 'volume';
  type LeaderboardEntry = MimirLeaderboardEntry & {
    display_name: string | null;
    profile_id: string | null;
    rank_position?: number;
    who?: string;
  };

  let {
    contractId,
    limit = 50,
  }: LeaderboardProps = $props();

  let timeframe = $state<Timeframe>('daily');
  let selectedDate = $state<Date>(new Date());
  let rankBy = $state<RankBy>('profit');
  let isLoading = $state(true);
  let isError = $state(false);
  let data = $state<LeaderboardEntry[] | null>(null);

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
      const result = await fetchLeaderboard({
        contractId,
        timeframe,
        date: timeframe === 'daily' ? selectedDate : undefined,
        rankBy,
        limit,
      });
      data = result as LeaderboardEntry[];
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
      isError = true;
    } finally {
      isLoading = false;
    }
  }

  // Load data on mount and when dependencies change
  $effect(() => {
    loadData();
  });
</script>

<div class="space-y-6">
  <div class="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
    <div>
      <h2 class="text-2xl font-semibold text-neutral-950 dark:text-white">Leaderboard</h2>
      <p class="text-neutral-700 dark:text-neutral-300 text-sm mt-1">
        {timeframe === 'daily'
          ? `Daily leaderboard ${isToday(selectedDate) ? 'for today' : `for ${selectedDate.toLocaleDateString()}`}`
          : `All-time top ${limit} players`}
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

      <select
        value={rankBy}
        onchange={(e) => rankBy = e.currentTarget.value as RankBy}
        class="px-4 py-2 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-sm font-semibold border-2 border-neutral-300 dark:border-neutral-700 hover:border-primary-400 dark:hover:border-primary-600 transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
      >
        <option value="profit">Rank by Profit</option>
        <option value="won">Rank by Winnings</option>
        <option value="volume">Rank by Volume</option>
        <option value="rtp">Rank by RTP</option>
      </select>
    </div>
  </div>

  {#if isLoading}
    <div class="space-y-3">
      {#each Array(5) as _, i}
        <div
          class="card p-4 animate-pulse"
        >
          <div class="flex justify-between items-center">
            <div class="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-24"></div>
            <div class="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-32"></div>
          </div>
        </div>
      {/each}
    </div>
  {:else if isError || !data || data.length === 0}
    <div class="bg-error-50 dark:bg-error-950/20 border border-error-200 dark:border-error-800 rounded-lg p-6 text-center">
      <p class="text-error-600 dark:text-error-400">Failed to load leaderboard</p>
    </div>
  {:else}
    <div class="overflow-x-auto card">
      <table class="w-full">
        <thead>
          <tr class="border-b border-neutral-200 dark:border-neutral-700 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase">
            <th class="px-4 py-3">Rank</th>
            <th class="px-4 py-3">Player</th>
            <th class="px-4 py-3 text-right">Spins</th>
            <th class="px-4 py-3 text-right">Volume</th>
            <th class="px-4 py-3 text-right">
              {rankBy === 'profit'
                ? 'Profit'
                : rankBy === 'won'
                  ? 'Won'
                  : rankBy === 'volume'
                    ? 'Total Bet'
                    : 'RTP'}
            </th>
            <th class="px-4 py-3 text-right">Win Rate</th>
          </tr>
        </thead>
        <tbody>
          {#each data as entry}
            {@const profit = BigInt(entry.net_result)}
            {@const isWinning = profit >= 0n}
            {@const identifier = entry.identifier || entry.who || 'unknown'}

            <tr
              class="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
            >
              <td class="px-4 py-3 font-bold text-primary-600 dark:text-primary-400">
                #{entry.rank || entry.rank_position}
              </td>
              <td class="px-4 py-3">
                <div>
                  <p class="text-neutral-900 dark:text-neutral-100 font-semibold text-sm">
                    {#if entry.display_name}
                      {entry.display_name}
                    {:else}
                      {identifier.slice(0, 6)}...{identifier.slice(-4)}
                    {/if}
                  </p>
                  {#if entry.display_name}
                    <p class="text-neutral-500 dark:text-neutral-400 text-xs font-mono truncate">
                      {identifier.slice(0, 12)}...{identifier.slice(-6)}
                    </p>
                  {/if}
                </div>
              </td>
              <td class="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300">
                {formatNumberCompact(entry.total_spins)}
              </td>
              <td class="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300">
                {formatVoi(entry.total_bet || '0', 0)} VOI
              </td>
              <td
                class="px-4 py-3 text-right font-semibold {isWinning
                  ? 'text-success-600 dark:text-success-400'
                  : 'text-error-600 dark:text-error-400'}"
              >
                {#if rankBy === 'rtp'}
                  {formatPercent(entry.rtp, 2)}
                {:else}
                  {isWinning ? '+' : ''}{formatVoi(entry.net_result || '0', 2)} VOI
                {/if}
              </td>
              <td class="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300">
                {formatPercent(entry.win_rate, 2)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
