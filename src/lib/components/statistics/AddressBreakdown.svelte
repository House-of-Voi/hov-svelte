<script lang="ts">
  import { fetchMyProfileBreakdown } from '$lib/api/statistics';
  import PlayerStatsCard from './PlayerStatsCard.svelte';

  interface AddressBreakdownProps {
    contractId?: number;
  }

  let { contractId }: AddressBreakdownProps = $props();

  let isLoading = $state(true);
  let isError = $state(false);
  let data = $state<Awaited<ReturnType<typeof fetchMyProfileBreakdown>> | null>(null);

  async function loadData() {
    isLoading = true;
    isError = false;
    try {
      data = await fetchMyProfileBreakdown(contractId);
    } catch (error) {
      console.error('Failed to load profile breakdown:', error);
      isError = true;
    } finally {
      isLoading = false;
    }
  }

  // Load data on mount
  $effect(() => {
    loadData();
  });
</script>

{#if isLoading}
  <div class="space-y-4">
    <div class="h-6 bg-gold-900/20 rounded w-48 animate-pulse"></div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each Array(2) as _, i}
        <div
          class="bg-gradient-to-br from-neutral-900/50 to-neutral-950 border border-gold-900/20 rounded-xl p-6 animate-pulse"
        >
          <div class="space-y-3">
            {#each Array(4) as _, j}
              <div class="h-3 bg-gold-900/20 rounded w-full"></div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
{:else if isError || !data}
  <div class="bg-red-950/20 border border-red-900/30 rounded-xl p-6">
    <p class="text-red-400">Failed to load address breakdown</p>
  </div>
{:else if data.length === 0}
  <div class="bg-neutral-900/50 border border-gold-900/20 rounded-xl p-6">
    <p class="text-neutral-400">No linked addresses</p>
  </div>
{:else}
  <div class="space-y-6">
    <div>
      <h3 class="text-xl font-bold text-gold-400">Your Addresses</h3>
      <p class="text-neutral-500 text-sm mt-1">
        Statistics for each of your {data.length} linked {data.length === 1 ? 'address' : 'addresses'}
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each data as entry}
        <div class="space-y-2">
          <div class="flex items-center gap-2 px-2">
            <span class="text-xs font-semibold text-neutral-500 uppercase">
              {entry.chain}
            </span>
            <span class="text-xs text-neutral-600">
              {entry.address.slice(0, 12)}...{entry.address.slice(-6)}
            </span>
          </div>
          <PlayerStatsCard
            stats={entry.stats}
            address={entry.address}
            showAddress={false}
          />
        </div>
      {/each}
    </div>
  </div>
{/if}
