<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import ChainBadge from '$lib/components/ui/ChainBadge.svelte';
  import type { ChainTotal } from '$lib/types/admin';
  import { formatNumberCompact } from '$lib/utils/format';

  interface Props {
    chainTotals: ChainTotal[];
  }

  let { chainTotals }: Props = $props();
</script>

{#if chainTotals.length > 0}
  <div>
    <h2 class="text-2xl font-semibold text-neutral-950 dark:text-white uppercase mb-4">
      Treasury by Chain
    </h2>
    <div class="grid md:grid-cols-3 gap-6">
      {#each chainTotals as chainTotal (chainTotal.chain)}
        {@const balance = parseFloat(chainTotal.total_balance)}
        {@const available = parseFloat(chainTotal.total_available)}
        <Card>
          <CardHeader>
            <div class="flex items-center justify-between">
              <ChainBadge chain={chainTotal.chain} />
              <span class="text-xs text-neutral-600 dark:text-neutral-400 uppercase tracking-wider font-bold">
                {chainTotal.machine_count} Machine{chainTotal.machine_count !== 1 ? 's' : ''}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div class="space-y-3">
              <div>
                <div class="text-sm text-neutral-600 dark:text-neutral-400 uppercase tracking-wider font-bold mb-1">
                  Total Balance
                </div>
                <div class="text-3xl font-black text-primary-600 dark:text-primary-400">
                  {formatNumberCompact(balance)}
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4 pt-3 border-t border-neutral-200 dark:border-neutral-700">
                <div>
                  <div class="text-xs text-neutral-600 dark:text-neutral-400 uppercase tracking-wider font-bold mb-1">
                    Available
                  </div>
                  <div class="text-xl font-bold text-success-600 dark:text-success-400">
                    {formatNumberCompact(available)}
                  </div>
                </div>
                <div>
                  <div class="text-xs text-neutral-600 dark:text-neutral-400 uppercase tracking-wider font-bold mb-1">
                    Reserved
                  </div>
                  <div class="text-xl font-bold text-neutral-600 dark:text-neutral-400">
                    {formatNumberCompact(parseFloat(chainTotal.total_reserved))}
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
