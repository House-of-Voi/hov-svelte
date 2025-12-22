<script lang="ts">
  interface Props {
    spins?: number;
    winRate?: number;
    streak?: number;
    loading?: boolean;
  }

  let { spins = 0, winRate = 0, streak = 0, loading = false }: Props = $props();

  // Format large numbers with commas
  function formatNumber(num: number): string {
    return num.toLocaleString();
  }

  // Format streak as days
  function formatStreak(days: number): string {
    return `${days}d`;
  }

  const stats = $derived([
    { label: 'SPINS', value: formatNumber(spins) },
    { label: 'WIN RATE', value: `${winRate.toFixed(1)}%` },
    { label: 'CURRENT STREAK', value: formatStreak(streak) },
  ]);
</script>

<div class="w-full border border-white/15 rounded-2xl p-4 flex gap-4">
  {#each stats as stat, index (stat.label)}
    <div class="flex-1 flex flex-col gap-2 items-center justify-center text-center">
      <p class="text-sm text-white/70 capitalize">{stat.label}</p>
      {#if loading}
        <div class="h-7 w-16 bg-white/10 rounded animate-pulse"></div>
      {:else}
        <p class="text-2xl font-bold text-white">{stat.value}</p>
      {/if}
    </div>
    {#if index < stats.length - 1}
      <div class="w-px self-stretch bg-white/15"></div>
    {/if}
  {/each}
</div>
