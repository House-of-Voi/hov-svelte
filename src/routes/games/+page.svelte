<script lang="ts">
  import type { PageData } from './$types';
  import GamesSearchBar from '$lib/components/games/GamesSearchBar.svelte';
  import GamesFilterChips from '$lib/components/games/GamesFilterChips.svelte';
  import GamesCategorySection from '$lib/components/games/GamesCategorySection.svelte';

  let { data }: { data: PageData } = $props();

  // Group games by type
  const slotsGames = $derived(
    data.games.filter((game) => game.game_type === '5reel')
  );
  const w2wGames = $derived(
    data.games.filter((game) => game.game_type === 'w2w')
  );

  // Mock games for categories without real data
  const mockGames = [
    { id: 'mock-1', display_name: 'Game Name', game_type: 'mock' },
    { id: 'mock-2', display_name: 'Game Name', game_type: 'mock' },
    { id: 'mock-3', display_name: 'Game Name', game_type: 'mock' },
    { id: 'mock-4', display_name: 'Game Name', game_type: 'mock' },
    { id: 'mock-5', display_name: 'Game Name', game_type: 'mock' },
    { id: 'mock-6', display_name: 'Game Name', game_type: 'mock' },
    { id: 'mock-7', display_name: 'Game Name', game_type: 'mock' },
    { id: 'mock-8', display_name: 'Game Name', game_type: 'mock' },
  ];

  // Combine real games with mock data for display
  const displaySlotsGames = $derived(
    slotsGames.length > 0
      ? [...slotsGames, ...mockGames.slice(0, Math.max(0, 8 - slotsGames.length))]
      : mockGames
  );

  const displayPokerGames = $derived(mockGames);

  const displayRouletteGames = $derived(mockGames);

  const displayOtherGames = $derived(
    w2wGames.length > 0
      ? [...w2wGames, ...mockGames.slice(0, Math.max(0, 8 - w2wGames.length))]
      : mockGames
  );

  // Search state (visual only for now)
  let searchValue = $state('');
</script>

<svelte:head>
  <title>Games - House of Voi</title>
  <meta
    name="description"
    content="Browse and play games on House of Voi. Slots, Poker, Roulette and more."
  />
</svelte:head>

<div class="flex flex-col gap-6 w-full">
  <!-- Search and Filters -->
  <div class="flex flex-col gap-4">
    <GamesSearchBar bind:value={searchValue} />
    <GamesFilterChips />
  </div>

  <!-- Actual Games Title -->
  <h1 class="text-2xl font-bold text-white">Actual Games</h1>

  <!-- Game Categories -->
  <div class="flex flex-col gap-8">
    <!-- Slots -->
    <GamesCategorySection title="Slots" games={displaySlotsGames} />

    <!-- Poker -->
    <GamesCategorySection title="Poker" games={displayPokerGames} />

    <!-- Roulette -->
    <GamesCategorySection title="Roulette" games={displayRouletteGames} />

    <!-- Other Casino Games -->
    <GamesCategorySection title="Other Casino Games" games={displayOtherGames} />
  </div>
</div>
