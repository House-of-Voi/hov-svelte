<script lang="ts">
  import type { MimirPlayerStats } from '$lib/types/database';
  import { formatNumberCompact, formatVoi } from '$lib/utils/format';

  interface PlayerStatsCardProps {
    stats: MimirPlayerStats | null;
    address: string;
    isLoading?: boolean;
    showAddress?: boolean;
  }

  let {
    stats,
    address,
    isLoading = false,
    showAddress = true,
  }: PlayerStatsCardProps = $props();

  const rtp = $derived(stats ? parseFloat(stats.rtp.toString()) : 0);
  const winRate = $derived(stats ? parseFloat(stats.win_rate.toString()) : 0);
</script>

{#if isLoading}
  <div class="bg-gradient-to-br from-neutral-100 dark:from-neutral-900/50 to-neutral-200 dark:to-neutral-950 border border-warning-200 dark:border-warning-900/20 rounded-xl p-6 animate-pulse">
    <div class="h-4 bg-warning-200 dark:bg-warning-900/20 rounded w-32 mb-4"></div>
    <div class="space-y-3">
      {#each Array(4) as _, i}
        <div class="h-3 bg-warning-200 dark:bg-warning-900/20 rounded w-full"></div>
      {/each}
    </div>
  </div>
{:else if !stats}
  <div class="bg-gradient-to-br from-neutral-100 dark:from-neutral-900/50 to-neutral-200 dark:to-neutral-950 border border-warning-200 dark:border-warning-900/20 rounded-xl p-6">
    <p class="text-neutral-600 dark:text-neutral-400 text-sm">
      No statistics available for {showAddress ? address : 'this address'}
    </p>
  </div>
{:else}
  <div class="bg-gradient-to-br from-neutral-100 dark:from-neutral-900/50 to-neutral-200 dark:to-neutral-950 border border-warning-200 dark:border-warning-900/20 rounded-xl p-6 hover:border-warning-300 dark:hover:border-warning-900/40 transition-all">
    {#if showAddress}
      <p class="text-neutral-600 dark:text-neutral-500 text-xs font-mono mb-4 truncate">
        {address}
      </p>
    {/if}

    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-neutral-600 dark:text-neutral-500 text-xs mb-1">Total Spins</p>
          <p class="text-xl font-bold text-warning-500 dark:text-warning-400">
            {formatNumberCompact(stats.total_spins)}
          </p>
        </div>
        <div>
          <p class="text-neutral-600 dark:text-neutral-500 text-xs mb-1">Win Rate</p>
          <p class="text-xl font-bold text-warning-500 dark:text-warning-400">
            {winRate.toFixed(2)}%
          </p>
        </div>
      </div>

      <div class="border-t border-warning-200 dark:border-warning-900/20 pt-4">
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p class="text-neutral-600 text-xs mb-1">Total Wagered</p>
            <p class="text-emerald-400 font-semibold">
              {formatVoi(stats.total_bet, 2)} VOI
            </p>
          </div>
          <div>
            <p class="text-neutral-600 text-xs mb-1">Total Won</p>
            <p class="text-blue-400 font-semibold">
              {formatVoi(stats.total_won, 2)} VOI
            </p>
          </div>
        </div>
      </div>

      <div class="border-t border-warning-200 dark:border-warning-900/20 pt-4">
        <div class="flex justify-between items-center">
          <p class="text-neutral-600 dark:text-neutral-500 text-xs">Net Result</p>
          <p
            class="font-bold {BigInt(stats.net_result) >= 0n
              ? 'text-emerald-400'
              : 'text-red-400'}"
          >
            {BigInt(stats.net_result) >= 0n ? '+' : ''}
            {formatVoi(stats.net_result, 2)} VOI
          </p>
        </div>
      </div>

      <div class="border-t border-gold-900/20 pt-4 grid grid-cols-2 gap-4 text-xs">
        <div>
          <p class="text-neutral-600 dark:text-neutral-500 mb-1">RTP</p>
          <p
            class="font-semibold {rtp >= 96.5 ? 'text-emerald-400' : 'text-orange-400'}"
          >
            {rtp.toFixed(2)}%
          </p>
        </div>
        <div>
          <p class="text-neutral-600 dark:text-neutral-500 mb-1">Largest Win</p>
          <p class="text-warning-500 dark:text-warning-400 font-semibold">
            {formatVoi(stats.largest_win, 2)} VOI
          </p>
        </div>
      </div>

      <div class="border-t border-gold-900/20 pt-4 grid grid-cols-2 gap-4 text-xs">
        <div>
          <p class="text-neutral-600 dark:text-neutral-500 mb-1">Winning Spins</p>
          <p class="text-emerald-400 font-semibold">
            {formatNumberCompact(stats.winning_spins)}
          </p>
        </div>
        <div>
          <p class="text-neutral-600 mb-1">Losing Spins</p>
          <p class="text-red-400 font-semibold">
            {formatNumberCompact(stats.losing_spins)}
          </p>
        </div>
      </div>
    </div>
  </div>
{/if}
