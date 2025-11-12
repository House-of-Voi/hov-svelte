<script lang="ts">
  import { onMount } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ReferralStatsCard from './ReferralStatsCard.svelte';
  import ReferralRow from './ReferralRow.svelte';
  import ReferralDetailModal from './ReferralDetailModal.svelte';
  import type { ReferralDashboardData, ReferralWithStats } from '$lib/referrals/credits';
  import { notificationStore } from '$lib/stores/notificationStore.svelte';

  interface Props {
    initialData?: ReferralDashboardData | null;
    contractId?: number;
  }

  let { initialData = null, contractId }: Props = $props();

  let dashboardData = $state<ReferralDashboardData | null>(initialData);
  let loading = $state(!initialData);
  let error = $state<string | null>(null);
  let isCreating = $state(false);
  let filter = $state<'all' | 'active' | 'queued'>('all');
  let isDetailModalOpen = $state(false);
  let selectedReferralProfileId = $state<string | null>(null);

  async function fetchDashboardData() {
    loading = true;
    error = null;
    try {
      const url = contractId
        ? `/api/referrals/dashboard?contractId=${contractId}`
        : '/api/referrals/dashboard';
      const response = await fetch(url);
      const data = await response.json();

      if (data.ok) {
        // The API spreads dashboardData, so data contains all the fields directly
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
      } else {
        error = data.error || 'Failed to load referral dashboard';
      }
    } catch (err) {
      console.error('Failed to load referral dashboard:', err);
      error = 'Failed to load referral dashboard';
    } finally {
      loading = false;
    }
  }

  async function handleCreateCode() {
    isCreating = true;
    try {
      const response = await fetch('/api/referrals/create', {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok) {
        notificationStore.error(data.error || 'Failed to create referral code');
        return;
      }

      // Refresh dashboard data
      await fetchDashboardData();
      notificationStore.success('Referral code created successfully!');
    } catch (err) {
      console.error('Error creating code:', err);
      notificationStore.error('Failed to create referral code');
    } finally {
      isCreating = false;
    }
  }

  // Fetch on mount if no initial data
  onMount(() => {
    if (!initialData) {
      fetchDashboardData();
    }
  });

  const filteredReferrals = $derived.by(() => {
    if (!dashboardData) return [];
    const referrals = dashboardData.referrals || [];
    if (filter === 'all') return referrals;
    if (filter === 'active') return referrals.filter((r) => r.isActive);
    return referrals.filter((r) => !r.isActive);
  });

  function handleReferralClick(referral: ReferralWithStats) {
    selectedReferralProfileId = referral.referredProfileId;
    isDetailModalOpen = true;
  }

  function handleCloseModal() {
    isDetailModalOpen = false;
    selectedReferralProfileId = null;
  }
</script>

<div class="space-y-6">
  {#if loading}
    <div class="text-center py-12">
      <p class="text-neutral-600 dark:text-neutral-400">Loading referral dashboard...</p>
    </div>
  {:else if error}
    <div class="text-center py-12">
      <p class="text-red-600 dark:text-red-400">{error}</p>
      <Button onclick={fetchDashboardData} variant="outline" class="mt-4">
        Retry
      </Button>
    </div>
  {:else if dashboardData}
    <!-- Summary Stats -->
    <ReferralStatsCard
      totalVolume={dashboardData.aggregateStats.totalVolume}
      totalSpins={dashboardData.aggregateStats.totalSpins}
      activeCount={dashboardData.aggregateStats.activeCount}
      totalReferrals={dashboardData.totalReferrals}
    />

    <!-- Referral Codes Summary -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-semibold text-neutral-950 dark:text-white">
              Referral Codes
            </h2>
            <p class="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              {dashboardData.codesGenerated} of {dashboardData.maxReferrals} codes generated
            </p>
          </div>
          {#if dashboardData.codesAvailable > 0}
            <Button
              variant="primary"
              onclick={handleCreateCode}
              disabled={isCreating}
              loading={isCreating}
            >
              {isCreating ? 'Creating...' : 'Generate New Code'}
            </Button>
          {:else}
            <p class="text-sm text-neutral-500 dark:text-neutral-400">
              All referral slots used
            </p>
          {/if}
        </div>
      </CardHeader>
      <CardContent>
        <p class="text-sm text-neutral-600 dark:text-neutral-400">
          {dashboardData.codesAvailable > 0
            ? `You can create ${dashboardData.codesAvailable} more code${dashboardData.codesAvailable !== 1 ? 's' : ''}.`
            : 'You have reached your referral code limit.'}
        </p>
      </CardContent>
    </Card>

    <!-- Referrals List -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-semibold text-neutral-950 dark:text-white">
              Your Referrals
            </h2>
            <p class="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              {dashboardData.totalReferrals} total referral{dashboardData.totalReferrals !== 1 ? 's' : ''}
            </p>
          </div>
          {#if dashboardData.referrals.length > 0}
            <div class="flex gap-2">
              <button
                onclick={() => (filter = 'all')}
                class="px-3 py-1.5 text-sm rounded-lg transition-colors {filter === 'all'
                  ? 'bg-primary-500 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'}"
              >
                All ({dashboardData.referrals.length})
              </button>
              <button
                onclick={() => (filter = 'active')}
                class="px-3 py-1.5 text-sm rounded-lg transition-colors {filter === 'active'
                  ? 'bg-primary-500 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'}"
              >
                Active ({dashboardData.activeReferrals})
              </button>
              <button
                onclick={() => (filter = 'queued')}
                class="px-3 py-1.5 text-sm rounded-lg transition-colors {filter === 'queued'
                  ? 'bg-primary-500 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'}"
              >
                Queued ({dashboardData.queuedReferrals})
              </button>
            </div>
          {/if}
        </div>
      </CardHeader>
      <CardContent>
        {#if filteredReferrals.length === 0}
          <div class="text-center py-12">
            <p class="text-neutral-600 dark:text-neutral-400">
              {dashboardData.totalReferrals === 0
                ? "You don't have any referrals yet. Generate a referral code to get started!"
                : filter === 'active'
                  ? 'No active referrals'
                  : filter === 'queued'
                    ? 'No queued referrals'
                    : 'No referrals found'}
            </p>
          </div>
        {:else}
          <div class="space-y-3">
            {#each filteredReferrals as referral (referral.referredProfileId)}
              <ReferralRow {referral} onClick={() => handleReferralClick(referral)} />
            {/each}
          </div>
        {/if}
      </CardContent>
    </Card>
  {/if}

  <!-- Referral Detail Modal -->
  {#if selectedReferralProfileId}
    <ReferralDetailModal
      isOpen={isDetailModalOpen}
      onClose={handleCloseModal}
      referredProfileId={selectedReferralProfileId}
      contractId={contractId}
    />
  {/if}
</div>

