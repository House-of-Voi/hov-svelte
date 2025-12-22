<script lang="ts">
  import type { BiggestWin } from '$lib/types/profile';

  interface Props {
    wins: BiggestWin[];
    loading?: boolean;
  }

  let { wins, loading = false }: Props = $props();

  // Format date for display (e.g., "Oct 7, 2025")
  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // Format amount from microVOI to VOI
  function formatAmount(amount: string): string {
    const num = parseFloat(amount);
    if (isNaN(num)) return '0';
    const inVoi = num / 1_000_000;
    return inVoi.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  // Format bet info
  function formatBetInfo(betAmount: string, lines: number): string {
    const bet = parseFloat(betAmount) / 1_000_000;
    if (isNaN(bet) || lines === 0) return 'Bet info unavailable';
    const perLine = Math.round(bet / lines);
    return `Bet: ${perLine} x ${lines} lines`;
  }
</script>

<div class="border border-white/15 rounded-2xl p-4 flex flex-col gap-4 w-full">
  <p class="text-base font-bold text-white uppercase w-full">BIGGEST WINS</p>

  <div class="border border-white/15 rounded-lg p-4 flex flex-col gap-4 w-full">
    {#if loading}
      <!-- Loading skeleton -->
      {#each [1, 2, 3] as i}
        <div class="flex flex-col gap-2 items-center text-center w-full animate-pulse">
          <div class="h-4 w-24 bg-white/10 rounded"></div>
          <div class="h-7 w-32 bg-white/10 rounded"></div>
          <div class="h-4 w-28 bg-white/10 rounded"></div>
        </div>
        {#if i < 3}
          <div class="h-px w-full bg-white/15"></div>
        {/if}
      {/each}
    {:else if wins.length === 0}
      <div class="flex flex-col gap-2 items-center text-center py-4">
        <p class="text-sm text-white/70">No wins yet</p>
        <p class="text-xs text-white/50">Keep playing to see your biggest wins here!</p>
      </div>
    {:else}
      {#each wins as win, index (index)}
        <div class="flex flex-col gap-2 items-center text-center w-full capitalize leading-normal">
          <p class="text-sm text-white/70 w-full">{formatDate(win.date)}</p>
          <p class="text-2xl font-bold text-white w-full">{formatAmount(win.amount)} VOI</p>
          <p class="text-sm text-white/70 w-full">{formatBetInfo(win.betAmount, win.lines)}</p>
        </div>
        {#if index < wins.length - 1}
          <div class="h-px w-full bg-white/15"></div>
        {/if}
      {/each}
    {/if}
  </div>
</div>
