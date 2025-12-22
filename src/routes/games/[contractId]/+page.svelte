<script lang="ts">
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import GameDetailHero from '$lib/components/game-detail/GameDetailHero.svelte';
  import GameDetailHeader from '$lib/components/game-detail/GameDetailHeader.svelte';
  import GameStatsBar from '$lib/components/game-detail/GameStatsBar.svelte';
  import GameActionButtons from '$lib/components/game-detail/GameActionButtons.svelte';
  import GameInfoTabs from '$lib/components/game-detail/GameInfoTabs.svelte';
  import QueueTab from '$lib/components/game-detail/tabs/QueueTab.svelte';
  import StatsTab from '$lib/components/game-detail/tabs/StatsTab.svelte';
  import AboutTab from '$lib/components/game-detail/tabs/AboutTab.svelte';
  import PlaceholderTab from '$lib/components/game-detail/tabs/PlaceholderTab.svelte';

  let { data }: { data: PageData } = $props();

  type TabId = 'queue' | 'leaderboard' | 'stats' | 'staking' | 'about';
  let activeTab: TabId = $state('queue');

  // Track favorites (would persist to localStorage or server in production)
  let isFavorited = $state(false);

  function handleFavoriteToggle() {
    isFavorited = !isFavorited;
    // TODO: Persist favorite state
  }

  function handlePlayDemo() {
    // Demo mode not yet implemented
    console.log('Demo mode coming soon');
  }

  function handleRealPlay() {
    const { gameConfig } = data;
    const route = gameConfig.game_type === 'w2w' ? '/games/w2w' : '/games/slots';
    goto(`${route}?contract=${gameConfig.contract_id}`);
  }

  function handleInvest() {
    // Navigate to house/staking page
    goto('/house');
  }

  function handleTabChange(tabId: TabId) {
    activeTab = tabId;
  }

  function handleLoadMore() {
    // TODO: Load more plays from API
    console.log('Load more plays');
  }

  // Prepare stats data for StatsTab
  const gameStats = $derived({
    rtpTarget: data.gameConfig.rtp_target,
    houseEdge: data.gameConfig.house_edge,
    minBet: data.gameConfig.min_bet,
    maxBet: data.gameConfig.max_bet,
    maxPaylines: data.gameConfig.max_paylines,
    launchedAt: data.gameConfig.launched_at,
  });
</script>

<svelte:head>
  <title>{data.gameConfig.display_name} - House of Voi</title>
  <meta
    name="description"
    content={data.gameConfig.description || `Play ${data.gameConfig.display_name} on House of Voi`}
  />
</svelte:head>

<div class="flex flex-col gap-6 w-full">
  <!-- Main Content Section -->
  <div class="flex flex-col gap-4 w-full">
    <!-- Hero Image -->
    <GameDetailHero
      image={null}
      gameName={data.gameConfig.display_name}
    />

    <!-- Title and Favorite -->
    <GameDetailHeader
      title={data.gameConfig.display_name}
      description={data.gameConfig.description}
      {isFavorited}
      onFavoriteToggle={handleFavoriteToggle}
    />

    <!-- Stats Bar -->
    <GameStatsBar
      totalBet={data.stats.totalBet}
      players={data.stats.players}
      winRate={data.stats.winRate}
      token={data.token}
    />

    <!-- Action Buttons -->
    <GameActionButtons
      demoDisabled={true}
      onPlayDemo={handlePlayDemo}
      onRealPlay={handleRealPlay}
      onInvest={handleInvest}
    />
  </div>

  <!-- Game Info Section -->
  <div class="flex flex-col gap-4 w-full">
    <h2 class="text-2xl font-bold text-white capitalize">Game Info</h2>

    <!-- Tab Navigation -->
    <GameInfoTabs {activeTab} onTabChange={handleTabChange} />

    <!-- Tab Content -->
    {#if activeTab === 'queue'}
      <QueueTab plays={data.recentPlays} onLoadMore={handleLoadMore} />
    {:else if activeTab === 'stats'}
      <StatsTab stats={gameStats} token={data.token} />
    {:else if activeTab === 'about'}
      <AboutTab
        description={data.gameConfig.description}
        theme={data.gameConfig.theme}
        launchedAt={data.gameConfig.launched_at}
      />
    {:else if activeTab === 'leaderboard'}
      <PlaceholderTab tabName="Leaderboard" />
    {:else if activeTab === 'staking'}
      <PlaceholderTab tabName="Staking" />
    {/if}
  </div>
</div>
