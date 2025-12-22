<script lang="ts">
  import SectionHeader from '$lib/components/home/SectionHeader.svelte';
  import HorizontalScrollSection from '$lib/components/home/HorizontalScrollSection.svelte';
  import HomeGameCard from '$lib/components/home/HomeGameCard.svelte';

  interface Game {
    id?: string;
    display_name: string;
    game_type?: string;
    contract_id?: number;
    image?: string;
    playersCount?: number;
  }

  interface Props {
    title: string;
    games: Game[];
  }

  let { title, games }: Props = $props();

  // Split games into two rows
  const row1Games = $derived(games.slice(0, Math.ceil(games.length / 2)));
  const row2Games = $derived(games.slice(Math.ceil(games.length / 2)));

  // Reference to scroll sections
  let scrollSection1: HorizontalScrollSection | undefined = $state();
  let scrollSection2: HorizontalScrollSection | undefined = $state();

  function handleScrollLeft() {
    scrollSection1?.scrollLeft();
    scrollSection2?.scrollLeft();
  }

  function handleScrollRight() {
    scrollSection1?.scrollRight();
    scrollSection2?.scrollRight();
  }
</script>

<section class="flex flex-col gap-4 w-full">
  <SectionHeader
    {title}
    showArrows={true}
    onScrollLeft={handleScrollLeft}
    onScrollRight={handleScrollRight}
  />

  {#if row1Games.length > 0}
    <HorizontalScrollSection bind:this={scrollSection1}>
      {#each row1Games as game, i (`${game.id || game.display_name}-row1-${i}`)}
        <HomeGameCard {game} />
      {/each}
    </HorizontalScrollSection>
  {/if}

  {#if row2Games.length > 0}
    <HorizontalScrollSection bind:this={scrollSection2}>
      {#each row2Games as game, i (`${game.id || game.display_name}-row2-${i}`)}
        <HomeGameCard {game} />
      {/each}
    </HorizontalScrollSection>
  {/if}
</section>
