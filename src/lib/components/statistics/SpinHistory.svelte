<script lang="ts">
  import { fetchPlayerSpins } from '$lib/api/statistics';
  import { formatVoi, formatDate } from '$lib/utils/format';

  interface SpinHistoryProps {
    address: string;
    contractId?: number;
    limit?: number;
  }

  let {
    address,
    contractId,
    limit = 20,
  }: SpinHistoryProps = $props();

  let offset = $state(0);
  let isLoading = $state(true);
  let isError = $state(false);
  let data = $state<Awaited<ReturnType<typeof fetchPlayerSpins>> | null>(null);

  async function loadData() {
    isLoading = true;
    isError = false;
    try {
      data = await fetchPlayerSpins(address, {
        contractId,
        limit,
        offset,
        order: 'desc',
      });
    } catch (error) {
      console.error('Failed to load spin history:', error);
      isError = true;
    } finally {
      isLoading = false;
    }
  }

  // Load data on mount and when dependencies change
  $effect(() => {
    loadData();
  });

  function handlePrevious() {
    offset = Math.max(0, offset - limit);
  }

  function handleNext() {
    if (data && data.spins.length === limit) {
      offset = offset + limit;
    }
  }
</script>

<div class="space-y-6">
  <div>
    <h2 class="text-2xl font-bold text-gold-400">Spin History</h2>
    <p class="text-neutral-500 text-sm mt-1">
      Recent spins for {address.slice(0, 12)}...
    </p>
  </div>

  {#if isLoading}
    <div class="space-y-3">
      {#each Array(5) as _, i}
        <div
          class="bg-gradient-to-r from-neutral-900/50 to-neutral-950 border border-gold-900/20 rounded-lg p-4 animate-pulse"
        >
          <div class="flex justify-between items-center">
            <div class="h-4 bg-gold-900/20 rounded w-24"></div>
            <div class="h-4 bg-gold-900/20 rounded w-32"></div>
          </div>
        </div>
      {/each}
    </div>
  {:else if isError || !data}
    <div class="bg-red-950/20 border border-red-900/30 rounded-lg p-6 text-center">
      <p class="text-red-400">Failed to load spin history</p>
    </div>
  {:else if data.spins.length === 0}
    <div class="bg-neutral-900/50 border border-gold-900/20 rounded-lg p-6 text-center">
      <p class="text-neutral-400">No spins recorded yet</p>
    </div>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-gold-900/20 text-left text-xs font-semibold text-neutral-500 uppercase">
            <th class="px-4 py-3">Timestamp</th>
            <th class="px-4 py-3 text-right">Bet</th>
            <th class="px-4 py-3 text-right">Payout</th>
            <th class="px-4 py-3 text-right">Result</th>
            <th class="px-4 py-3 text-right">Block</th>
            <th class="px-4 py-3 text-right">Tx</th>
          </tr>
        </thead>
        <tbody>
          {#each data.spins as spin}
            {@const payout = BigInt(spin.payout)}
            {@const amount = BigInt(spin.amount)}
            {@const netResult = payout - amount}
            {@const netResultNum = Number(netResult)}
            {@const isWin = netResult > 0n}

            <tr
              class="border-b border-gold-900/10 hover:bg-gold-900/5 transition-colors"
            >
              <td class="px-4 py-3 text-neutral-300 text-sm">
                {formatDate(spin.timestamp, 'short')}
              </td>
              <td class="px-4 py-3 text-right text-neutral-300 text-sm">
                {formatVoi(spin.amount, 2)} VOI
              </td>
              <td class="px-4 py-3 text-right text-blue-400 text-sm font-semibold">
                {formatVoi(spin.payout, 2)} VOI
              </td>
              <td
                class="px-4 py-3 text-right font-semibold text-sm {isWin ? 'text-emerald-400' : 'text-red-400'}"
              >
                {isWin ? '+' : ''}
                {formatVoi(netResultNum, 2)} VOI
              </td>
              <td class="px-4 py-3 text-right text-neutral-500 text-xs font-mono">
                #{spin.block}
              </td>
              <td class="px-4 py-3 text-right">
                <a
                  href="https://explorer.voi.network/tx/{spin.txid}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-gold-400 hover:text-gold-300 text-xs font-mono inline-block"
                  title={spin.txid}
                >
                  {spin.txid.slice(0, 6)}...{spin.txid.slice(-4)}
                </a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="flex justify-between items-center">
      <button
        onclick={handlePrevious}
        disabled={offset === 0}
        class="px-4 py-2 rounded-lg bg-neutral-900/50 text-neutral-300 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-900 transition-all"
      >
        ← Previous
      </button>

      <p class="text-neutral-500 text-sm">
        Showing {offset + 1}–{Math.min(offset + limit, offset + data.spins.length)}
      </p>

      <button
        onclick={handleNext}
        disabled={data.spins.length < limit}
        class="px-4 py-2 rounded-lg bg-neutral-900/50 text-neutral-300 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-900 transition-all"
      >
        Next →
      </button>
    </div>
  {/if}
</div>
