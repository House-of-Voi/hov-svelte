<script lang="ts">
  export interface RecentPlay {
    bet: string;
    lines: number;
    won: string;
    multiplier: string;
    roundId: number;
    timestamp: string;
  }

  interface Props {
    plays?: RecentPlay[];
    onLoadMore?: () => void;
    loading?: boolean;
  }

  let { plays = [], onLoadMore, loading = false }: Props = $props();

  function formatTimestamp(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return timestamp;
    }
  }
</script>

<div class="w-full border border-white/15 rounded-2xl p-4 flex flex-col gap-2">
  {#if plays.length === 0}
    <div class="text-center text-white/70 py-8">
      No recent plays to display
    </div>
  {:else}
    {#each plays as play, index (play.roundId)}
      <div class="border border-white/15 rounded-lg p-4 flex flex-col gap-4">
        <div class="flex gap-2 items-start w-full">
          <div class="flex-1 flex flex-col gap-2 items-center justify-center text-center capitalize">
            <p class="text-base font-medium text-white">{play.bet}</p>
            <p class="text-sm text-white/70">Bet</p>
          </div>
          <div class="flex-1 flex flex-col gap-2 items-center justify-center text-center capitalize">
            <p class="text-base font-medium text-white">{play.lines}</p>
            <p class="text-sm text-white/70">Lines</p>
          </div>
          <div class="flex-1 flex flex-col gap-2 items-center justify-center text-center capitalize">
            <p class="text-base font-medium text-white">{play.won}</p>
            <p class="text-sm text-white/70">Won</p>
          </div>
          <div class="flex-1 flex flex-col gap-2 items-center justify-center text-center capitalize">
            <p class="text-base font-medium text-white">{play.multiplier}</p>
            <p class="text-sm text-white/70">Multiplier</p>
          </div>
        </div>
        <p class="text-sm text-white/70 text-center capitalize">
          Round {play.roundId} &bull; {formatTimestamp(play.timestamp)}
        </p>
      </div>
    {/each}
  {/if}

  {#if plays.length > 0}
    <button
      type="button"
      onclick={onLoadMore}
      disabled={loading}
      class="h-10 flex items-center justify-center px-4 rounded-full bg-[#333] border-2 border-[#808080] text-white text-base font-bold uppercase hover:bg-[#404040] transition-colors w-full
        {loading ? 'opacity-50 cursor-not-allowed' : ''}"
    >
      {loading ? 'Loading...' : 'Load more'}
    </button>
  {/if}
</div>
