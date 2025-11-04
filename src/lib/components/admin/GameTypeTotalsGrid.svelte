<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import type { GameTypeTotal } from '$lib/types/admin';
  import { formatNumberCompact } from '$lib/utils/format';

  interface Props {
    gameTypeTotals: GameTypeTotal[];
  }

  let { gameTypeTotals }: Props = $props();

  const gameTypeIcons: Record<string, string> = {
    slots: '🎰',
    keno: '🎲',
    roulette: '🎯',
  };

  const gameTypeNames: Record<string, string> = {
    slots: 'Slot Machines',
    keno: 'Keno',
    roulette: 'Roulette',
  };
</script>

{#if gameTypeTotals.length > 0}
  <div>
    <h2 class="text-2xl font-black text-warning-500 dark:text-warning-400 uppercase mb-4 neon-text">
      Treasury by Game Type
    </h2>
    <div class="grid md:grid-cols-3 gap-6">
      {#each gameTypeTotals as gameTypeTotal (gameTypeTotal.game_type)}
        {@const balance = parseFloat(gameTypeTotal.total_balance)}
        {@const available = parseFloat(gameTypeTotal.total_available)}
        <Card>
          <CardHeader>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-2xl">{gameTypeIcons[gameTypeTotal.game_type]}</span>
                <span class="text-lg font-bold text-neutral-900 dark:text-neutral-200 uppercase tracking-wide">
                  {gameTypeNames[gameTypeTotal.game_type]}
                </span>
              </div>
              <span class="text-xs text-neutral-500 uppercase tracking-wider font-bold">
                {gameTypeTotal.machine_count} Machine{gameTypeTotal.machine_count !== 1 ? 's' : ''}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div class="space-y-3">
              <div>
                <div class="text-sm text-neutral-500 uppercase tracking-wider font-bold mb-1">
                  Total Balance
                </div>
                <div class="text-3xl font-black text-warning-500 dark:text-warning-400">
                  {formatNumberCompact(balance)}
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4 pt-3 border-t border-warning-200 dark:border-warning-900/20">
                <div>
                  <div class="text-xs text-neutral-600 uppercase tracking-wider font-bold mb-1">
                    Available
                  </div>
                  <div class="text-xl font-bold text-success-600 dark:text-success-400">
                    {formatNumberCompact(available)}
                  </div>
                </div>
                <div>
                  <div class="text-xs text-neutral-600 uppercase tracking-wider font-bold mb-1">
                    Reserved
                  </div>
                  <div class="text-xl font-bold text-neutral-400">
                    {formatNumberCompact(parseFloat(gameTypeTotal.total_reserved))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      {/each}
    </div>
  </div>
{/if}
