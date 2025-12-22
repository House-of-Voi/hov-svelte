<script lang="ts">
  interface Props {
    longestWinStreak: number;
    longestLosingStreak: number;
    daysSinceFirstBet: number;
    favoriteBet: string;
    totalPaylines: number;
    longestDayStreak: number;
    loading?: boolean;
  }

  let {
    longestWinStreak,
    longestLosingStreak,
    daysSinceFirstBet,
    favoriteBet,
    totalPaylines,
    longestDayStreak,
    loading = false,
  }: Props = $props();

  // Format VOI amount
  function formatVoi(amount: string): string {
    const num = parseFloat(amount);
    if (isNaN(num)) return '0 VOI';
    const inVoi = num / 1_000_000;
    return inVoi.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' VOI';
  }

  // Format number with commas
  function formatNumber(value: number): string {
    return value.toLocaleString();
  }

  // Format plural
  function pluralize(count: number, singular: string, plural?: string): string {
    const p = plural || singular + 's';
    return count === 1 ? `${count} ${singular}` : `${count} ${p}`;
  }
</script>

<div class="flex flex-col gap-4 w-full">
  <p class="text-base font-bold text-white capitalize w-full">Detailed Analytics</p>

  <div class="border border-white/15 rounded-lg p-4 flex flex-col gap-4 w-full">
    {#if loading}
      <!-- Loading skeleton -->
      {#each [1, 2, 3] as row}
        <div class="flex gap-4 items-start w-full">
          <div class="flex-1 flex flex-col gap-2 items-center text-center animate-pulse">
            <div class="h-4 w-16 bg-white/10 rounded"></div>
            <div class="h-7 w-20 bg-white/10 rounded"></div>
            <div class="h-4 w-24 bg-white/10 rounded"></div>
          </div>
          {#if row < 3}
            <div class="flex-1 flex flex-col gap-2 items-center text-center animate-pulse">
              <div class="h-4 w-16 bg-white/10 rounded"></div>
              <div class="h-7 w-16 bg-white/10 rounded"></div>
              <div class="h-4 w-20 bg-white/10 rounded"></div>
            </div>
          {/if}
        </div>
        {#if row < 3}
          <div class="h-px w-full bg-white/15"></div>
        {/if}
      {/each}
    {:else}
      <!-- Row 1: Streaks | Activity -->
      <div class="flex gap-4 items-start w-full">
        <div class="flex-1 flex flex-col gap-2 items-center text-center capitalize leading-normal">
          <p class="text-sm text-white/70 w-full">Streaks</p>
          <p class="text-2xl font-bold text-white w-full">{pluralize(longestWinStreak, 'win')}</p>
          <p class="text-sm text-white/70 w-full">Longest losing: {longestLosingStreak}</p>
        </div>
        <div class="flex-1 flex flex-col gap-2 items-center text-center capitalize leading-normal">
          <p class="text-sm text-white/70 w-full">Activity</p>
          <p class="text-2xl font-bold text-white w-full">{pluralize(daysSinceFirstBet, 'day')}</p>
          <p class="text-sm text-white/70 w-full">Since first bet</p>
        </div>
      </div>

      <div class="h-px w-full bg-white/15"></div>

      <!-- Row 2: Favorite Bet | Paylines -->
      <div class="flex gap-4 items-start w-full">
        <div class="flex-1 flex flex-col gap-2 items-center text-center capitalize leading-normal">
          <p class="text-sm text-white/70 w-full">Favorite Bet</p>
          <p class="text-2xl font-bold text-white w-full">{formatVoi(favoriteBet)}</p>
          <p class="text-sm text-white/70 w-full">Most common size</p>
        </div>
        <div class="flex-1 flex flex-col gap-2 items-center text-center capitalize leading-normal">
          <p class="text-sm text-white/70 w-full">Paylines</p>
          <p class="text-2xl font-bold text-white w-full">{formatNumber(totalPaylines)}</p>
          <p class="text-sm text-white/70 w-full">Total played</p>
        </div>
      </div>

      <div class="h-px w-full bg-white/15"></div>

      <!-- Row 3: Longest Streak (full width) -->
      <div class="flex items-start w-full">
        <div class="flex-1 flex flex-col gap-2 items-center text-center capitalize leading-normal">
          <p class="text-sm text-white/70 w-full">Longest Streak</p>
          <p class="text-2xl font-bold text-white w-full">{pluralize(longestDayStreak, 'day')}</p>
        </div>
      </div>
    {/if}
  </div>
</div>
