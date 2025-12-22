<script lang="ts">
  import type { ReferralDashboardData, ReferralWithStats } from '$lib/referrals/credits';
  import type { ReferralStats } from '$lib/referrals/validation';
  import ReferralLinkCard from '../referrals/ReferralLinkCard.svelte';
  import ReferralSummaryCard from '../referrals/ReferralSummaryCard.svelte';
  import ReferralPlayerCard from '../referrals/ReferralPlayerCard.svelte';

  interface Props {
    voiAddress?: string;
  }

  let { voiAddress }: Props = $props();

  let loading = $state(true);
  let dashboardData = $state<ReferralDashboardData | null>(null);
  let referralInfo = $state<ReferralStats | null>(null);
  let searchQuery = $state('');
  let displayCount = $state(10);
  let isRefreshing = $state(false);

  // Get the user's referral code (first available unused code)
  const referralCode = $derived(() => {
    if (!referralInfo?.codes) return null;
    // Find first unused, non-deactivated code
    const availableCode = referralInfo.codes.find(
      (c) => !c.referredProfileId && !c.deactivatedAt
    );
    return availableCode?.code || null;
  });

  // Check if user can generate more codes
  const canGenerateCode = $derived(() => {
    if (!referralInfo) return false;
    return referralInfo.codesAvailable > 0;
  });

  // Filter referrals by search query
  const filteredReferrals = $derived(() => {
    if (!dashboardData?.referrals) return [];
    if (!searchQuery.trim()) return dashboardData.referrals;

    const query = searchQuery.toLowerCase();
    return dashboardData.referrals.filter((r) =>
      r.referredUsername?.toLowerCase().includes(query)
    );
  });

  // Get referrals to display (limited by displayCount)
  const displayedReferrals = $derived(() => {
    return filteredReferrals().slice(0, displayCount);
  });

  // Check if there are more referrals to load
  const hasMore = $derived(() => {
    return filteredReferrals().length > displayCount;
  });

  // Fetch dashboard data
  async function fetchDashboardData() {
    try {
      const response = await fetch('/api/referrals/dashboard');
      const data = await response.json();

      if (data.ok) {
        dashboardData = {
          codesGenerated: data.codesGenerated,
          codesAvailable: data.codesAvailable,
          maxReferrals: data.maxReferrals,
          activeReferrals: data.activeReferrals,
          queuedReferrals: data.queuedReferrals,
          totalReferrals: data.totalReferrals,
          referrals: data.referrals || [],
          aggregateStats: data.aggregateStats,
        };
      }
    } catch (err) {
      console.error('Failed to fetch referral dashboard:', err);
    }
  }

  // Fetch referral info (for the code)
  async function fetchReferralInfo() {
    try {
      const response = await fetch('/api/referrals/info');
      const data = await response.json();

      if (data.ok) {
        referralInfo = {
          codesGenerated: data.codesGenerated,
          codesAvailable: data.codesAvailable,
          maxReferrals: data.maxReferrals,
          activeReferrals: data.activeReferrals,
          queuedReferrals: data.queuedReferrals,
          totalReferrals: data.totalReferrals,
          codes: data.codes || [],
        };
      }
    } catch (err) {
      console.error('Failed to fetch referral info:', err);
    }
  }

  // Initial load
  async function loadData() {
    loading = true;
    await Promise.all([fetchDashboardData(), fetchReferralInfo()]);
    loading = false;
  }

  // Refresh data
  async function handleRefresh() {
    isRefreshing = true;
    await Promise.all([fetchDashboardData(), fetchReferralInfo()]);
    isRefreshing = false;
  }

  // Load more referrals
  function handleLoadMore() {
    displayCount += 10;
  }

  // View referral profile (placeholder for now)
  function handleViewProfile(referral: ReferralWithStats) {
    // Could navigate to player profile or open a modal
    console.log('View profile:', referral.referredProfileId);
  }

  // Initial load on mount
  $effect(() => {
    loadData();
  });
</script>

<div class="flex flex-col gap-4 w-full">
  <!-- Referrals Link Section -->
  <p class="text-2xl font-bold text-white capitalize">Referrals Link</p>
  <ReferralLinkCard
    code={referralCode()}
    {loading}
    canGenerateCode={canGenerateCode()}
    onCodeGenerated={handleRefresh}
  />

  <!-- Your Referrals Section -->
  <div class="flex flex-col gap-4 w-full">
    <!-- Header with refresh button -->
    <div class="flex gap-4 items-center w-full">
      <p class="flex-1 text-2xl font-bold text-white capitalize">Your Referrals</p>
      <button
        type="button"
        onclick={handleRefresh}
        disabled={isRefreshing}
        class="size-8 rounded-full bg-[#333] border-2 border-[#808080] flex items-center justify-center shrink-0 hover:bg-[#404040] transition-colors disabled:opacity-50"
        aria-label="Refresh referrals"
      >
        <svg
          class="size-6 text-white {isRefreshing ? 'animate-spin' : ''}"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="M21 12a9 9 0 11-2.64-6.36M21 3v6h-6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <!-- Search input -->
    <div class="flex gap-2 items-center h-8 px-4 bg-[#333] border-2 border-[#808080] rounded-full w-full">
      <svg class="size-6 text-white shrink-0" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" />
        <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search"
        class="flex-1 bg-transparent text-sm text-white placeholder-white/50 outline-none"
      />
    </div>

    <!-- Summary Stats Card -->
    <ReferralSummaryCard
      totalReferrals={dashboardData?.totalReferrals || 0}
      totalEarned={dashboardData?.aggregateStats?.totalCreditsEarned || 0}
      {loading}
    />

    <!-- Referrals List -->
    <div class="flex flex-col gap-2 w-full">
      {#if loading}
        <!-- Loading skeleton -->
        {#each [1, 2, 3] as _}
          <div class="border border-white/15 rounded-2xl p-4 flex flex-col gap-4 w-full animate-pulse">
            <div class="flex gap-2 items-center w-full">
              <div class="size-12 rounded-full bg-white/10"></div>
              <div class="flex-1 flex flex-col gap-1">
                <div class="h-4 w-20 bg-white/10 rounded"></div>
                <div class="h-5 w-32 bg-white/10 rounded"></div>
              </div>
              <div class="size-8 rounded-full bg-white/10"></div>
            </div>
            <div class="flex gap-4 items-start w-full">
              <div class="flex-1 flex flex-col gap-1">
                <div class="h-4 w-16 bg-white/10 rounded"></div>
                <div class="h-4 w-20 bg-white/10 rounded"></div>
              </div>
              <div class="flex-1 flex flex-col gap-1">
                <div class="h-4 w-14 bg-white/10 rounded"></div>
                <div class="h-4 w-16 bg-white/10 rounded"></div>
              </div>
              <div class="flex-1 flex flex-col gap-1 items-end">
                <div class="h-4 w-12 bg-white/10 rounded"></div>
                <div class="h-4 w-10 bg-white/10 rounded"></div>
              </div>
            </div>
          </div>
        {/each}
      {:else if displayedReferrals().length === 0}
        <!-- Empty state -->
        <div class="border border-white/15 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 w-full">
          <div class="size-16 rounded-full bg-white/10 flex items-center justify-center">
            <svg class="size-8 text-white/50" viewBox="0 0 24 24" fill="none">
              <path
                d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <div class="text-center">
            <p class="text-lg font-bold text-white mb-1">No referrals yet</p>
            <p class="text-sm text-white/70 max-w-xs">
              {searchQuery
                ? 'No referrals match your search.'
                : 'Share your referral link with friends to earn 2% of their wagering!'}
            </p>
          </div>
        </div>
      {:else}
        {#each displayedReferrals() as referral (referral.referredProfileId)}
          <ReferralPlayerCard
            {referral}
            onViewProfile={() => handleViewProfile(referral)}
          />
        {/each}
      {/if}
    </div>

    <!-- Load More Button -->
    {#if !loading && hasMore()}
      <button
        type="button"
        onclick={handleLoadMore}
        class="h-10 w-full bg-[#333] border-2 border-[#808080] rounded-full flex items-center justify-center hover:bg-[#404040] transition-colors"
      >
        <span class="text-base font-bold text-white uppercase">Load More</span>
      </button>
    {/if}
  </div>
</div>
