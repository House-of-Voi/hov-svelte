<script lang="ts">
  export interface GameStats {
    rtpTarget: number;
    houseEdge: number;
    minBet: number;
    maxBet: number;
    maxPaylines: number;
    launchedAt?: string | null;
  }

  interface Props {
    stats: GameStats;
    token?: string;
  }

  let { stats, token = 'VOI' }: Props = $props();

  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  function formatNumber(value: number, decimals: number = 0): string {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  const statsDisplay = $derived([
    { label: 'RTP Target', value: `${(stats.rtpTarget * 100).toFixed(1)}%` },
    { label: 'House Edge', value: `${(stats.houseEdge * 100).toFixed(1)}%` },
    { label: 'Min Bet', value: `${formatNumber(stats.minBet)} ${token}` },
    { label: 'Max Bet', value: `${formatNumber(stats.maxBet)} ${token}` },
    { label: 'Max Paylines', value: String(stats.maxPaylines) },
    { label: 'Launched', value: formatDate(stats.launchedAt) },
  ]);
</script>

<div class="w-full border border-white/15 rounded-2xl p-4 flex flex-col gap-2">
  {#each statsDisplay as stat, index (stat.label)}
    <div class="flex items-center justify-between py-3 {index < statsDisplay.length - 1 ? 'border-b border-white/15' : ''}">
      <span class="text-sm text-white/70">{stat.label}</span>
      <span class="text-base font-medium text-white">{stat.value}</span>
    </div>
  {/each}
</div>
