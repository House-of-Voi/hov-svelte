<script lang="ts">
  import HeroBanner from '$lib/components/home/HeroBanner.svelte';
  import SectionHeader from '$lib/components/home/SectionHeader.svelte';
  import HorizontalScrollSection from '$lib/components/home/HorizontalScrollSection.svelte';
  import HomeGameCard from '$lib/components/home/HomeGameCard.svelte';
  import TournamentCard from '$lib/components/home/TournamentCard.svelte';
  import NewsCard from '$lib/components/home/NewsCard.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Scroll section refs
  let activeGamesScroll: HorizontalScrollSection | undefined = $state();
  let featuredGamesScroll: HorizontalScrollSection | undefined = $state();

  // Create duplicate games for the second row (for demo purposes)
  const activeGamesRow1 = $derived(data.featuredGames?.slice(0, 4) || []);
  const activeGamesRow2 = $derived(data.featuredGames?.slice(0, 4) || []);
  const featuredGamesRow1 = $derived(data.featuredGames?.slice(0, 4) || []);
  const featuredGamesRow2 = $derived(data.featuredGames?.slice(0, 4) || []);

  // Mock data for demonstration
  const mockGames = [
    { id: '1', display_name: 'Game name', game_type: '5reel' },
    { id: '2', display_name: 'Game name', game_type: '5reel' },
    { id: '3', display_name: 'Game name', game_type: '5reel' },
    { id: '4', display_name: 'Game name', game_type: '5reel' },
  ];

  // Use real games if available, otherwise use mock
  const displayActiveGames1 = $derived(activeGamesRow1.length > 0 ? activeGamesRow1 : mockGames);
  const displayActiveGames2 = $derived(activeGamesRow2.length > 0 ? activeGamesRow2 : mockGames);
  const displayFeaturedGames1 = $derived(featuredGamesRow1.length > 0 ? featuredGamesRow1 : mockGames);
  const displayFeaturedGames2 = $derived(featuredGamesRow2.length > 0 ? featuredGamesRow2 : mockGames);
</script>

<svelte:head>
  <title>House of Voi - Fun Games, Real Rewards</title>
  <meta name="description" content="Play engaging games and earn rewards on the blockchain. Transparent, fast, and built for everyone." />
</svelte:head>

<div class="flex flex-col gap-8 w-full">
  <!-- Hero Banner -->
  <HeroBanner />

  <!-- Active Games Feed -->
  <section class="flex flex-col gap-4 w-full">
    <SectionHeader
      title="Active Games Feed"
      showArrows={true}
      onScrollLeft={() => activeGamesScroll?.scrollLeft()}
      onScrollRight={() => activeGamesScroll?.scrollRight()}
    />
    <HorizontalScrollSection bind:this={activeGamesScroll}>
      <!-- Row 1 -->
      {#each displayActiveGames1 as game (game.id || game.display_name)}
        <HomeGameCard {game} />
      {/each}
    </HorizontalScrollSection>
    <HorizontalScrollSection>
      <!-- Row 2 -->
      {#each displayActiveGames2 as game, i (i + '-row2')}
        <HomeGameCard {game} />
      {/each}
    </HorizontalScrollSection>
  </section>

  <!-- Featured Games -->
  <section class="flex flex-col gap-4 w-full">
    <SectionHeader
      title="Featured Games"
      showArrows={true}
      onScrollLeft={() => featuredGamesScroll?.scrollLeft()}
      onScrollRight={() => featuredGamesScroll?.scrollRight()}
    />
    <HorizontalScrollSection bind:this={featuredGamesScroll}>
      <!-- Row 1 -->
      {#each displayFeaturedGames1 as game (game.id || game.display_name)}
        <HomeGameCard {game} />
      {/each}
    </HorizontalScrollSection>
    <HorizontalScrollSection>
      <!-- Row 2 -->
      {#each displayFeaturedGames2 as game, i (i + '-featured-row2')}
        <HomeGameCard {game} />
      {/each}
    </HorizontalScrollSection>
  </section>

  <!-- Tournaments -->
  <section class="flex flex-col gap-4 w-full">
    <SectionHeader
      title="Tournaments"
      showSeeAll={true}
      seeAllHref="/tournaments"
    />
    <TournamentCard
      tournament={{
        name: 'Tournaments name',
        participantsCount: 790
      }}
    />
  </section>

  <!-- News -->
  <section class="flex flex-col gap-4 w-full">
    <SectionHeader
      title="News"
      showSeeAll={true}
      seeAllHref="/news"
    />
    <div class="flex gap-2 w-full">
      <NewsCard
        news={{
          title: 'News Title',
          text: 'News Text'
        }}
      />
      <NewsCard
        news={{
          title: 'News Title',
          text: 'News Text'
        }}
      />
    </div>
  </section>
</div>
