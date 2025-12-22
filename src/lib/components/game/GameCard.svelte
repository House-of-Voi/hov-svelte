<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import SlotMachineIcon from '$lib/components/icons/SlotMachineIcon.svelte';
  import DiceIcon from '$lib/components/icons/DiceIcon.svelte';
  import ChainBadge from '$lib/components/ui/ChainBadge.svelte';

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
    game: Game;
    canPlay: boolean;
    variant?: 'compact' | 'full';
    index?: number;
  }

  let { game, canPlay, variant = 'full', index = 0 }: Props = $props();

  const formatMicroVoi = (microVoi: number) => (microVoi / 1_000_000).toFixed(2);
  const payoutRate = $derived(parseFloat(game.rtp_target ?? '0'));
  const gameRoute = $derived(game.game_type === 'w2w' ? '/games/w2w' : '/games/slots');
  const gameHref = $derived(game.contract_id ? `${gameRoute}?contract=${game.contract_id}` : gameRoute);

  // Determine icon based on game type
  const GameIcon = $derived(game.game_type === 'dice' ? DiceIcon : SlotMachineIcon);
</script>

{#if variant === 'compact'}
  <!-- Compact variant for landing page -->
  <Card
    hover={true}
    class="h-full group"
    style="animation-delay: {index * 100}ms"
  >
    <CardContent class="p-6 h-full flex flex-col">
      <div class="flex justify-center mb-4">
        <div class="text-primary-500 dark:text-primary-400 group-hover:scale-110 transition-transform">
          <SlotMachineIcon size={48} />
        </div>
      </div>
      <h3 class="text-lg font-semibold text-neutral-950 dark:text-white mb-2 text-center">
        {game.display_name}
      </h3>
      <p class="text-neutral-700 dark:text-neutral-300 text-sm text-center mb-4 flex-1">
        {game.description || 'Spin the reels and win rewards'}
      </p>
      <div class="flex items-center justify-center gap-2 mb-4">
        <ChainBadge chain={game.chain as SupportedChain} />
        {#if game.theme}
          <span class="px-2 py-1 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs rounded-full capitalize">
            {game.theme}
          </span>
        {/if}
      </div>
      {#if canPlay}
        <a href={gameHref} class="block">
          <Button variant="primary" size="sm" class="w-full">
            Play Now
          </Button>
        </a>
      {:else}
        <a href="/auth" class="block">
          <Button variant="outline" size="sm" class="w-full">
            Sign In to Play
          </Button>
        </a>
      {/if}
    </CardContent>
  </Card>
{:else}
  <!-- Full variant for games browser -->
  <Card
    hover={true}
    elevated={true}
    class="h-full animate-in fade-in duration-500 slide-in-from-bottom-4"
    style="animation-delay: {index * 100}ms"
  >
    <CardContent class="p-8 h-full flex flex-col">
      <!-- Game Icon & Title -->
      <div class="space-y-4">
        <div class="flex justify-center">
          <div class="text-primary-500 dark:text-primary-400">
            <SlotMachineIcon size={56} />
          </div>
        </div>
        <div class="text-center">
          <h3 class="text-xl font-semibold text-neutral-950 dark:text-white mb-2">
            {game.display_name}
          </h3>
          <p class="text-neutral-700 dark:text-neutral-300 text-sm">
            {game.description || 'Experience the thrill of slot machine gaming'}
          </p>
          <div class="mt-2 flex items-center justify-center gap-2">
            <ChainBadge chain={game.chain as SupportedChain} />
            {#if game.theme}
              <span class="px-2 py-1 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs rounded-full capitalize">
                {game.theme}
              </span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Spacer to push game info down -->
      <div class="flex-1 min-h-2"></div>

      <!-- Game Info -->
      <div class="space-y-2 text-sm border-y border-neutral-200 dark:border-neutral-700 py-4">
        <div class="flex justify-between">
          <span class="text-neutral-700 dark:text-neutral-300">
            RTP:
          </span>
          <span class="text-neutral-950 dark:text-white font-medium">
            {payoutRate.toFixed(2)}%
          </span>
        </div>
        {#if game.min_bet !== undefined && game.max_bet !== undefined}
          <div class="flex justify-between">
            <span class="text-neutral-700 dark:text-neutral-300">
              Bet Range:
            </span>
            <span class="text-neutral-950 dark:text-white font-medium">
              {formatMicroVoi(game.min_bet)} - {formatMicroVoi(game.max_bet)} VOI
            </span>
          </div>
        {/if}
        {#if game.max_paylines !== undefined}
          <div class="flex justify-between">
            <span class="text-neutral-700 dark:text-neutral-300">
              Max Paylines:
            </span>
            <span class="text-neutral-950 dark:text-white font-medium">
              {game.max_paylines}
            </span>
          </div>
        {/if}
      </div>

      <!-- Play Button -->
      <div class="mt-6">
        {#if canPlay}
          <a href={gameHref} class="block">
            <Button variant="primary" size="md" class="w-full">
              Play Now
            </Button>
          </a>
        {:else}
          <a href="/auth" class="block">
            <Button variant="primary" size="md" class="w-full">
              Sign In to Play
            </Button>
          </a>
        {/if}
      </div>
    </CardContent>
  </Card>
{/if}
