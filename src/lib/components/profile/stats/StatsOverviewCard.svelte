<script lang="ts">
  interface Props {
    totalSpins: number;
    totalWagered: string;
    totalWon: string;
    winRate: number;
    rtp: number;
    biggestWin: string;
    avgBetSize: string;
    loading?: boolean;
  }

  let {
    totalSpins,
    totalWagered,
    totalWon,
    winRate,
    rtp,
    biggestWin,
    avgBetSize,
    loading = false,
  }: Props = $props();

  // Format amount from microVOI to VOI
  function formatVoi(amount: string): string {
    const num = parseFloat(amount);
    if (isNaN(num)) return '0 VOI';
    const inVoi = num / 1_000_000;
    if (inVoi >= 1000) {
      return inVoi.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' VOI';
    }
    return inVoi.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' VOI';
  }

  // Format percentage
  function formatPercent(value: number): string {
    return value.toFixed(1) + '%';
  }

  // Format number with commas
  function formatNumber(value: number): string {
    return value.toLocaleString();
  }
</script>

<div class="border border-white/15 rounded-lg p-4 flex flex-col gap-4 w-full">
  {#if loading}
    <!-- Loading skeleton -->
    {#each [1, 2, 3, 4] as row}
      <div class="flex gap-4 items-start w-full">
        <div class="flex-1 flex flex-col gap-2 items-center text-center animate-pulse">
          <div class="h-4 w-20 bg-white/10 rounded"></div>
          <div class="h-7 w-16 bg-white/10 rounded"></div>
        </div>
        {#if row < 4}
          <div class="flex-1 flex flex-col gap-2 items-center text-center animate-pulse">
            <div class="h-4 w-20 bg-white/10 rounded"></div>
            <div class="h-7 w-24 bg-white/10 rounded"></div>
          </div>
        {/if}
      </div>
      {#if row < 4}
        <div class="h-px w-full bg-white/15"></div>
      {/if}
    {/each}
  {:else}
    <!-- Row 1: Total Spins | Total Wagered -->
    <div class="flex gap-4 items-start w-full">
      <div class="flex-1 flex flex-col gap-2 items-center text-center capitalize leading-normal">
        <p class="text-sm text-white/70 w-full">Total Spins</p>
        <p class="text-2xl font-bold text-white w-full">{formatNumber(totalSpins)}</p>
      </div>
      <div class="flex-1 flex flex-col gap-2 items-center text-center capitalize leading-normal">
        <p class="text-sm text-white/70 w-full">Total Wagered</p>
        <p class="text-2xl font-bold text-white w-full">{formatVoi(totalWagered)}</p>
      </div>
    </div>

    <div class="h-px w-full bg-white/15"></div>

    <!-- Row 2: Total Won | Win Rate -->
    <div class="flex gap-4 items-start w-full">
      <div class="flex-1 flex flex-col gap-2 items-center text-center capitalize leading-normal">
        <p class="text-sm text-white/70 w-full">Total Won</p>
        <p class="text-2xl font-bold text-white w-full">{formatVoi(totalWon)}</p>
      </div>
      <div class="flex-1 flex flex-col gap-2 items-center text-center capitalize leading-normal">
        <p class="text-sm text-white/70 w-full">Win Rate</p>
        <p class="text-2xl font-bold text-white w-full">{formatPercent(winRate)}</p>
      </div>
    </div>

    <div class="h-px w-full bg-white/15"></div>

    <!-- Row 3: RTP | Biggest Win -->
    <div class="flex gap-4 items-start w-full">
      <div class="flex-1 flex flex-col gap-2 items-center text-center capitalize leading-normal">
        <p class="text-sm text-white/70 w-full">RTP</p>
        <p class="text-2xl font-bold text-white w-full">{formatPercent(rtp)}</p>
      </div>
      <div class="flex-1 flex flex-col gap-2 items-center text-center capitalize leading-normal">
        <p class="text-sm text-white/70 w-full">Biggest Win</p>
        <p class="text-2xl font-bold text-white w-full">{formatVoi(biggestWin)}</p>
      </div>
    </div>

    <div class="h-px w-full bg-white/15"></div>

    <!-- Row 4: Avg Bet Size (full width) -->
    <div class="flex items-start w-full">
      <div class="flex-1 flex flex-col gap-2 items-center text-center capitalize leading-normal">
        <p class="text-sm text-white/70 w-full">Avg Bet Size</p>
        <p class="text-2xl font-bold text-white w-full">{formatVoi(avgBetSize)}</p>
      </div>
    </div>
  {/if}
</div>
