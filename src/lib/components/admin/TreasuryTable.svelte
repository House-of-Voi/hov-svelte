<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import ChainBadge from '$lib/components/ui/ChainBadge.svelte';
  import type { TreasuryItem } from '$lib/types/admin';
  import { formatNumberCompact } from '$lib/utils/format';

  interface Props {
    treasuries: TreasuryItem[];
  }

  let { treasuries }: Props = $props();

  const gameTypeIcons: Record<string, string> = {
    slots: '🎰',
    keno: '🎲',
    roulette: '🎯',
  };
</script>

{#if treasuries.length === 0}
  <Card>
    <CardContent>
      <div class="text-center py-12 text-neutral-500">
        No treasury data available. Add slot machines or games to see their treasuries here.
      </div>
    </CardContent>
  </Card>
{:else}
  <div>
    <h2 class="text-2xl font-semibold text-neutral-950 dark:text-white uppercase mb-4">
      Machine Performance
    </h2>
    <Card>
      <CardContent>
        <div class="overflow-x-auto">
          <table class="min-w-full">
            <thead class="border-b border-neutral-200 dark:border-neutral-700">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                  Machine
                </th>
                <th class="px-6 py-3 text-left text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                  Chain
                </th>
                <th class="px-6 py-3 text-right text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                  Total Wagered (VOI)
                </th>
                <th class="px-6 py-3 text-right text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                  Paid Out (VOI)
                </th>
                <th class="px-6 py-3 text-right text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                  Net Profit (VOI)
                </th>
                <th class="px-6 py-3 text-center text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                  Contract ID
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-200 dark:divide-neutral-700">
              {#each treasuries as treasury (treasury.contract_id + '-' + treasury.chain)}
                {@const balance = parseFloat(treasury.balance)}
                {@const reserved = parseFloat(treasury.reserved)}
                {@const available = parseFloat(treasury.available)}
                <tr class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                      <span class="text-xl">{gameTypeIcons[treasury.game_type]}</span>
                      <span class="font-bold text-neutral-900 dark:text-neutral-100">{treasury.game_name}</span>
                    </div>
                  </td>
                  <td class="px-6 py-4">
                    <ChainBadge chain={treasury.chain} />
                  </td>
                  <td class="px-6 py-4 text-right">
                    <div class="font-bold text-primary-600 dark:text-primary-400 text-lg">
                      {formatNumberCompact(balance)}
                    </div>
                  </td>
                  <td class="px-6 py-4 text-right">
                    <div class="font-bold text-neutral-600 dark:text-neutral-400">
                      {formatNumberCompact(reserved)}
                    </div>
                  </td>
                  <td class="px-6 py-4 text-right">
                    <div class="font-bold text-success-600 dark:text-success-400 text-lg">
                      {formatNumberCompact(available)}
                    </div>
                  </td>
                  <td class="px-6 py-4 text-center">
                    <code class="px-2 py-1 text-xs font-mono bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded border border-neutral-300 dark:border-neutral-700">
                      {treasury.contract_id}
                    </code>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Summary Footer -->
        <div class="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <div class="text-sm text-neutral-600 dark:text-neutral-400 text-center">
            Showing {treasuries.length} machine{treasuries.length !== 1 ? 's' : ''} across all chains
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
{/if}
