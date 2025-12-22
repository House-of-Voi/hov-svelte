<script lang="ts">
  import type { GameAccountInfo } from '$lib/auth/session';
  import AccountSelectorDropdown from '../AccountSelectorDropdown.svelte';
  import PortfolioValueCard from '../PortfolioValueCard.svelte';
  import SharesCard from '../SharesCard.svelte';
  import HousePositionCard from '../HousePositionCard.svelte';
  import ChevronDownIcon from '$lib/components/icons/ChevronDownIcon.svelte';

  interface Props {
    voiAddress?: string;
    gameAccounts: GameAccountInfo[];
    activeAccountId: string;
    onAccountChange?: (account: GameAccountInfo) => void;
    onSettings?: () => void;
    onReceive?: () => void;
    onSwap?: () => void;
    onHistory?: () => void;
  }

  let {
    voiAddress,
    gameAccounts,
    activeAccountId,
    onAccountChange,
    onSettings,
    onReceive,
    onSwap,
    onHistory
  }: Props = $props();

  let loading = $state(true);
  let portfolioData = $state<any>(null);
  let contracts = $state<any[]>([]);
  let displayedCount = $state(3);
  let filterOpen = $state(false);
  let sortOpen = $state(false);

  // Fetch portfolio data
  async function fetchPortfolio() {
    loading = true;
    try {
      const response = await fetch('/api/house/portfolio');
      if (response.ok) {
        const data = await response.json();
        portfolioData = data.portfolio;
      }
    } catch (err) {
      console.error('Failed to fetch portfolio:', err);
    } finally {
      loading = false;
    }
  }

  // Fetch contracts list
  async function fetchContracts() {
    try {
      const response = await fetch('/api/house/contracts');
      if (response.ok) {
        const data = await response.json();
        contracts = data.contracts || [];
      }
    } catch (err) {
      console.error('Failed to fetch contracts:', err);
    }
  }

  // Format value for display
  function formatValue(value: string | number, decimals = 6): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0.00';
    // Convert from microVOI to VOI
    const inVoi = num / 1_000_000;
    return inVoi.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function handleLoadMore() {
    displayedCount += 3;
  }

  function handleRefresh() {
    fetchPortfolio();
    fetchContracts();
  }

  function handleAccountSelect(account: GameAccountInfo) {
    onAccountChange?.(account);
  }

  // Initial load
  $effect(() => {
    fetchPortfolio();
    fetchContracts();
  });

  // Derived values
  const totalValue = $derived(portfolioData?.totalValue ? formatValue(portfolioData.totalValue) : '0.00');
  const totalShares = $derived(portfolioData?.totalShares ? parseFloat(portfolioData.totalShares) / 1_000_000_000 : 0);
  const positions = $derived(portfolioData?.positions || []);
  const displayedContracts = $derived(contracts.slice(0, displayedCount));
  const hasMore = $derived(contracts.length > displayedCount);
</script>

<div class="flex flex-col gap-4 w-full">
  <!-- Portfolio Overview Header -->
  <div class="flex gap-2 items-center w-full">
    <p class="flex-1 text-2xl font-bold text-white capitalize">Portfolio Overview</p>
    <button
      type="button"
      onclick={handleRefresh}
      class="size-8 flex items-center justify-center bg-[#333] border-2 border-[#808080] rounded-full hover:bg-[#404040] transition-colors"
      aria-label="Refresh portfolio"
    >
      <svg class="size-6 text-white {loading ? 'animate-spin' : ''}" viewBox="0 0 24 24" fill="none">
        <path
          d="M21 12a9 9 0 11-2.636-6.364M21 12V6m0 6h-6"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </div>

  <!-- Account Selector -->
  <AccountSelectorDropdown
    accounts={gameAccounts}
    selectedAccountId={activeAccountId}
    onSelect={handleAccountSelect}
    {onSettings}
  />

  <!-- Portfolio Value Card -->
  <PortfolioValueCard
    portfolioValue={totalValue}
    usdValue={totalValue}
    availableBalance={totalValue}
    profitLoss="+0"
    profitLossPercent={0}
    {onReceive}
    {onSwap}
    {onHistory}
    {loading}
  />

  <!-- Shares Section -->
  <SharesCard
    userShares={totalShares}
    totalShares={8110.97}
    {loading}
  />

  <!-- Filters Row -->
  <div class="flex items-start justify-between w-full">
    <div class="relative">
      <button
        type="button"
        onclick={() => (filterOpen = !filterOpen)}
        class="flex gap-1 items-center h-8 px-2 bg-[#333] border-2 border-[#808080] rounded-full hover:bg-[#404040] transition-colors"
      >
        <span class="text-sm font-medium text-white capitalize">All Tokens</span>
        <ChevronDownIcon size={24} class="text-white" />
      </button>
    </div>

    <div class="relative">
      <button
        type="button"
        onclick={() => (sortOpen = !sortOpen)}
        class="flex gap-1 items-center h-8 px-2 bg-[#333] border-2 border-[#808080] rounded-full hover:bg-[#404040] transition-colors"
      >
        <span class="text-sm font-medium text-white">Sort by Trending</span>
        <ChevronDownIcon size={24} class="text-white" />
      </button>
    </div>
  </div>

  <!-- Contract Cards -->
  <div class="flex flex-col gap-2 w-full">
    {#if loading}
      {#each [1, 2, 3] as i}
        <div class="border border-white/15 rounded-2xl p-4 animate-pulse">
          <div class="flex gap-2 items-center mb-4">
            <div class="size-12 rounded-full bg-white/10"></div>
            <div class="flex-1">
              <div class="h-5 w-32 bg-white/10 rounded mb-2"></div>
              <div class="h-4 w-48 bg-white/10 rounded"></div>
            </div>
          </div>
          <div class="h-4 w-full bg-white/10 rounded mb-4"></div>
          <div class="flex gap-4">
            <div class="h-4 w-16 bg-white/10 rounded"></div>
            <div class="h-4 w-16 bg-white/10 rounded"></div>
            <div class="h-4 w-16 bg-white/10 rounded"></div>
          </div>
        </div>
      {/each}
    {:else if contracts.length === 0}
      <div class="border border-white/15 rounded-2xl p-8 text-center">
        <p class="text-white/70">No house contracts available</p>
      </div>
    {:else}
      {#each displayedContracts as contract (contract.id)}
        <HousePositionCard
          name={contract.display_name || contract.name || 'Unknown'}
          description={contract.description || 'Slot machine contract'}
          bankroll={formatValue(contract.treasury_balance || 0)}
          change7d="+0%"
          participants={contract.participant_count || 0}
          age="30d"
          apr={`${(contract.apr || 0).toFixed(2)}%`}
          onClick={() => window.location.href = `/house/${contract.id}`}
        />
      {/each}
    {/if}
  </div>

  <!-- Load More -->
  {#if hasMore && !loading}
    <button
      type="button"
      onclick={handleLoadMore}
      class="w-full h-10 flex items-center justify-center bg-[#333] border-2 border-[#808080] rounded-full text-base font-bold text-white uppercase hover:bg-[#404040] transition-colors"
    >
      Load more
    </button>
  {/if}
</div>
