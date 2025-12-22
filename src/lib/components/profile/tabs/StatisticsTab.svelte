<script lang="ts">
  import type { StatsPeriod, ExtendedPlayerStats } from '$lib/types/profile';
  import StatsPeriodSelector from '../stats/StatsPeriodSelector.svelte';
  import BiggestWinsCard from '../stats/BiggestWinsCard.svelte';
  import StatsOverviewCard from '../stats/StatsOverviewCard.svelte';
  import DetailedAnalyticsCard from '../stats/DetailedAnalyticsCard.svelte';

  interface Props {
    voiAddress?: string;
  }

  let { voiAddress }: Props = $props();

  let period = $state<StatsPeriod>('all');
  let selectedDate = $state(new Date());
  let loading = $state(true);
  let stats = $state<ExtendedPlayerStats | null>(null);

  // Fetch stats from API
  async function fetchStats() {
    loading = true;
    try {
      let url = '/api/statistics/profile/extended?period=' + period;
      if (period === 'daily') {
        url += '&date=' + selectedDate.toISOString().split('T')[0];
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          stats = data.data;
        }
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      loading = false;
    }
  }

  function handlePeriodChange(newPeriod: StatsPeriod) {
    period = newPeriod;
    fetchStats();
  }

  function handleDateChange(newDate: Date) {
    selectedDate = newDate;
    fetchStats();
  }

  // Initial load
  $effect(() => {
    fetchStats();
  });

  // Derived values for display
  const biggestWins = $derived(stats?.biggestWins || []);
  const totalSpins = $derived(stats?.totalSpins || 0);
  const totalWagered = $derived(stats?.totalBet || '0');
  const totalWon = $derived(stats?.totalWon || '0');
  const winRate = $derived(stats?.winRate || 0);
  const rtp = $derived(stats?.rtp || 0);
  const biggestWin = $derived(stats?.largestWin || '0');
  const avgBetSize = $derived(stats?.avgBet || '0');
  const longestWinStreak = $derived(stats?.longestWinStreak || 0);
  const longestLosingStreak = $derived(stats?.longestLosingStreak || 0);
  const daysActive = $derived(stats?.daysActive || 0);
  const favoriteBet = $derived(stats?.mostCommonBet || '0');
  const totalPaylines = $derived(stats?.totalPaylines || 0);
</script>

<div class="flex flex-col gap-4 w-full">
  <!-- Header -->
  <p class="text-2xl font-bold text-white capitalize">Statistics</p>

  <!-- Period Selector -->
  <StatsPeriodSelector
    {period}
    {selectedDate}
    onPeriodChange={handlePeriodChange}
    onDateChange={handleDateChange}
  />

  <!-- Stats Content -->
  <div class="border border-white/15 rounded-2xl p-4 flex flex-col gap-4 w-full">
    <!-- Biggest Wins -->
    <BiggestWinsCard wins={biggestWins} {loading} />

    <!-- Stats Overview -->
    <StatsOverviewCard
      {totalSpins}
      {totalWagered}
      {totalWon}
      {winRate}
      {rtp}
      {biggestWin}
      {avgBetSize}
      {loading}
    />

    <!-- Detailed Analytics -->
    <DetailedAnalyticsCard
      {longestWinStreak}
      {longestLosingStreak}
      daysSinceFirstBet={daysActive}
      {favoriteBet}
      {totalPaylines}
      longestDayStreak={daysActive}
      {loading}
    />
  </div>
</div>
