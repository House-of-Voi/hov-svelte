<script lang="ts">
  import GameCard from './GameCard.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';

  type SupportedChain = 'base' | 'voi' | 'solana';

  interface Game {
    id?: string;
    display_name: string;
    description?: string;
    game_type: string;
    chain: SupportedChain | string;
    contract_id?: number;
    theme?: string;
    rtp_target?: string;
    min_bet?: number;
    max_bet?: number;
    max_paylines?: number;
  }

  interface Props {
    games: Game[];
    canPlay: boolean;
    variant?: 'compact' | 'full';
    emptyMessage?: string;
  }

  let { games, canPlay, variant = 'full', emptyMessage = 'No games available at this time. Check back soon!' }: Props = $props();
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
  {#if games.length === 0}
    <Card class="col-span-full">
      <CardContent class="p-12 text-center">
        <div class="text-neutral-500 dark:text-neutral-400">
          {emptyMessage}
        </div>
      </CardContent>
    </Card>
  {:else}
    {#each games as game, index}
      <GameCard {game} {canPlay} {variant} {index} />
    {/each}
  {/if}
</div>
