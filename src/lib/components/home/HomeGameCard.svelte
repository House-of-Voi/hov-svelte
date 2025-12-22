<script lang="ts">
  interface Game {
    id?: string;
    display_name: string;
    game_type?: string;
    contract_id?: number;
    image?: string;
    playersCount?: number;
  }

  interface Props {
    game: Game;
    href?: string;
  }

  let { game, href }: Props = $props();

  // Default placeholder image for games
  const placeholderImage = 'https://www.figma.com/api/mcp/asset/6e78f37d-564e-4cbc-b9e4-2a0bd7ea69dc';

  // Calculate game href if not provided
  // Navigate to game detail page instead of directly to game
  const gameHref = $derived(
    href ||
      (game.contract_id
        ? `/games/${game.contract_id}`
        : '/games')
  );

  // Random player count for demo (would be real data in production)
  const playersCount = $derived(game.playersCount ?? Math.floor(Math.random() * 900) + 100);
</script>

<a href={gameHref} class="block w-[114px] flex-shrink-0 group">
  <div class="flex flex-col gap-4 items-start">
    <!-- Game Image -->
    <div class="w-full h-[150px] bg-[#808080] rounded-2xl overflow-hidden relative">
      <img
        src={game.image || placeholderImage}
        alt={game.display_name}
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
    </div>

    <!-- Game Info -->
    <div class="flex flex-col gap-2 w-full">
      <p class="text-base font-medium text-white capitalize truncate w-full">
        {game.display_name}
      </p>
      <p class="text-sm text-white/70 capitalize">
        {playersCount} playing
      </p>
    </div>
  </div>
</a>
