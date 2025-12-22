<script lang="ts">
  interface Props {
    userShares?: number;
    totalShares?: number;
    loading?: boolean;
  }

  let { userShares = 0, totalShares = 0, loading = false }: Props = $props();

  let showTooltip = $state(false);

  // Calculate ownership percentage
  const ownershipPercent = $derived(
    totalShares > 0 ? (userShares / totalShares) * 100 : 0
  );

  // Format shares for display
  function formatShares(shares: number): string {
    if (shares === 0) return '0';
    if (shares < 0.001) return shares.toExponential(2);
    return shares.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
</script>

<div class="flex flex-col gap-4 w-full">
  <!-- Header -->
  <div class="flex flex-col gap-2">
    <p class="text-2xl font-bold text-white capitalize">Your Portfolio</p>
    <p class="text-sm text-white/70">Your investment position and contract status</p>
  </div>

  <!-- Shares Card -->
  <div class="border border-white/15 rounded-2xl p-4 flex flex-col gap-4 w-full">
    <div class="flex flex-col gap-2 w-full">
      <div class="flex gap-2 items-start w-full">
        <div class="flex-1 flex flex-col gap-2">
          <p class="text-sm text-white/70 capitalize">Your Shares</p>
          {#if loading}
            <div class="h-5 w-12 bg-white/10 rounded animate-pulse"></div>
            <div class="h-4 w-32 bg-white/10 rounded animate-pulse"></div>
          {:else}
            <p class="text-base font-medium text-white">{formatShares(userShares)}</p>
            <p class="text-sm text-white/70">of {formatShares(totalShares)} total</p>
          {/if}
        </div>

        <!-- Help Icon -->
        <div class="relative">
          <button
            type="button"
            onmouseenter={() => (showTooltip = true)}
            onmouseleave={() => (showTooltip = false)}
            onfocus={() => (showTooltip = true)}
            onblur={() => (showTooltip = false)}
            class="size-6 flex items-center justify-center text-white/70 hover:text-white transition-colors"
            aria-label="What are shares?"
          >
            <svg class="size-6" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" />
              <path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>

          <!-- Tooltip -->
          {#if showTooltip}
            <div class="absolute right-0 top-full mt-2 w-64 p-3 bg-[#333] rounded-lg shadow-xl z-50 text-sm text-white/90">
              Shares represent your ownership stake in the house bankroll. As the bankroll grows from game profits, so does the value of your shares.
            </div>
          {/if}
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="w-full bg-black p-0.5">
        {#if loading}
          <div class="h-2 w-1/3 bg-white/20 rounded animate-pulse"></div>
        {:else}
          <div
            class="h-2 bg-[#d9d9d9] transition-all duration-300"
            style="width: {Math.min(ownershipPercent, 100)}%"
          ></div>
        {/if}
      </div>
    </div>
  </div>
</div>
