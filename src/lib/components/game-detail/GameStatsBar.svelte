<script lang="ts">
  interface Props {
    totalBet?: string;
    players?: number;
    winRate?: string;
    token?: string;
  }

  let { totalBet = '0', players = 0, winRate = '0%', token = 'VOI' }: Props = $props();

  const stats = $derived([
    { label: 'Total Bet', value: totalBet },
    { label: 'Players', value: String(players) },
    { label: 'Win Rate', value: winRate },
    { label: 'Token', value: token, uppercase: true },
  ]);
</script>

<div class="w-full border border-white/15 rounded-2xl p-4 flex gap-1">
  {#each stats as stat, index (stat.label)}
    <div class="flex-1 flex flex-col gap-2 items-center justify-center text-center">
      <p class="text-sm text-white/70 capitalize">{stat.label}</p>
      <p class="text-base font-medium text-white {stat.uppercase ? 'uppercase' : ''}">
        {stat.value}
      </p>
    </div>
    {#if index < stats.length - 1}
      <div class="w-px self-stretch bg-white/15"></div>
    {/if}
  {/each}
</div>
