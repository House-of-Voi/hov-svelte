<script lang="ts">
  import { goto } from '$app/navigation';
  import { fetchMyProfileStats } from '$lib/api/statistics';
  import AddressBreakdown from '$lib/components/statistics/AddressBreakdown.svelte';
  import SpinHistory from '$lib/components/statistics/SpinHistory.svelte';
  import { formatVoi, formatPercent } from '$lib/utils/format';

  const ALPHA_SLOTS_CONTRACT_ID = 40879920;

  let selectedAddress = $state<string | null>(null);
  let isLoading = $state(true);
  let isError = $state(false);
  let errorMessage = $state<string | null>(null);
  let data = $state<Awaited<ReturnType<typeof fetchMyProfileStats>> | null>(null);

  async function loadData() {
    isLoading = true;
    isError = false;
    errorMessage = null;
    try {
      data = await fetchMyProfileStats(ALPHA_SLOTS_CONTRACT_ID);
    } catch (error) {
      console.error('Failed to load profile stats:', error);
      isError = true;
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message === 'Not authenticated') {
          // Redirect to auth page
          goto('/auth');
        }
      }
    } finally {
      isLoading = false;
    }
  }

  // Load data on mount
  $effect(() => {
    loadData();
  });
</script>

<svelte:head>
  <title>My Statistics | House of Voi</title>
  <meta name="description" content="View your personal gaming statistics" />
</svelte:head>

<div class="space-y-12">
  <!-- Header -->
  <div class="space-y-4">
    <h1 class="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gold-400 via-gold-300 to-gold-500 neon-text">
      My Statistics
    </h1>
    <p class="text-neutral-400 text-lg">
      Track your gaming performance across all your linked addresses
    </p>
  </div>

  <!-- Error State -->
  {#if isError}
    <div class="bg-red-950/20 border border-red-900/30 rounded-xl p-6">
      <p class="text-red-400 font-semibold">
        {errorMessage === 'Not authenticated'
          ? 'Please log in to view your statistics'
          : 'Failed to load your statistics'}
      </p>
    </div>
  {:else if isLoading}
    <!-- Loading State -->
    <div class="space-y-4">
      <div class="h-32 bg-gradient-to-br from-neutral-900/50 to-neutral-950 border border-gold-900/20 rounded-xl p-6 animate-pulse"></div>
    </div>
  {:else if data}
    <!-- Aggregate Stats Card -->
    <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-gradient-to-br from-neutral-900/50 to-neutral-950 border border-gold-900/20 rounded-xl p-6">
        <p class="text-neutral-500 text-xs font-medium mb-2">Total Spins</p>
        <p class="text-2xl font-bold text-gold-400">{data.total_spins}</p>
      </div>
      <div class="bg-gradient-to-br from-neutral-900/50 to-neutral-950 border border-gold-900/20 rounded-xl p-6">
        <p class="text-neutral-500 text-xs font-medium mb-2">Win Rate</p>
        <p class="text-2xl font-bold text-gold-400">
          {formatPercent(data.win_rate, 2)}
        </p>
      </div>
      <div class="bg-gradient-to-br from-neutral-900/50 to-neutral-950 border border-gold-900/20 rounded-xl p-6">
        <p class="text-neutral-500 text-xs font-medium mb-2">RTP</p>
        <p class="text-2xl font-bold text-gold-400">
          {formatPercent(data.rtp, 2)}
        </p>
      </div>
      <div class="bg-gradient-to-br from-neutral-900/50 to-neutral-950 border border-gold-900/20 rounded-xl p-6">
        <p class="text-neutral-500 text-xs font-medium mb-2">
          Net Result
        </p>
        <p
          class="text-2xl font-bold {BigInt(data.net_result) >= 0n
            ? 'text-emerald-400'
            : 'text-red-400'}"
        >
          {BigInt(data.net_result) >= 0n ? '+' : ''}
          {formatVoi(data.net_result, 2)} VOI
        </p>
      </div>
    </section>

    <!-- Detailed Stats -->
    <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-gradient-to-br from-neutral-900/50 to-neutral-950 border border-gold-900/20 rounded-xl p-6">
        <h3 class="text-lg font-bold text-gold-400 mb-4">Summary</h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-neutral-500">Winning Spins</span>
            <span class="text-emerald-400 font-semibold">
              {data.winning_spins}
            </span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-neutral-500">Losing Spins</span>
            <span class="text-red-400 font-semibold">
              {data.losing_spins}
            </span>
          </div>
          <div class="flex justify-between items-center border-t border-gold-900/20 pt-3">
            <span class="text-neutral-500">Total Wagered</span>
            <span class="text-blue-400 font-semibold">
              {formatVoi(data.total_bet, 2)} VOI
            </span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-neutral-500">Total Won</span>
            <span class="text-emerald-400 font-semibold">
              {formatVoi(data.total_won, 2)} VOI
            </span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-neutral-500">Largest Win</span>
            <span class="text-gold-400 font-semibold">
              {formatVoi(data.largest_win, 2)} VOI
            </span>
          </div>
        </div>
      </div>

      <div class="bg-gradient-to-br from-neutral-900/50 to-neutral-950 border border-gold-900/20 rounded-xl p-6">
        <h3 class="text-lg font-bold text-gold-400 mb-4">Key Metrics</h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-neutral-500">RTP (Return to Player)</span>
            <span
              class="font-semibold {data.rtp >= 96.5 ? 'text-emerald-400' : 'text-orange-400'}"
            >
              {formatPercent(data.rtp, 2)}
            </span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-neutral-500">Win Rate</span>
            <span class="text-gold-400 font-semibold">
              {formatPercent(data.win_rate, 2)}
            </span>
          </div>
          <div class="flex justify-between items-center border-t border-gold-900/20 pt-3">
            <span class="text-neutral-500">Linked Addresses</span>
            <span class="text-neutral-300 font-semibold">
              {data.addresses.length}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- Address Breakdown -->
    <section>
      <AddressBreakdown contractId={ALPHA_SLOTS_CONTRACT_ID} />
    </section>

    <!-- Spin History -->
    {#if selectedAddress}
      <section>
        <SpinHistory
          address={selectedAddress}
          contractId={ALPHA_SLOTS_CONTRACT_ID}
        />
      </section>
    {/if}
  {/if}
</div>
