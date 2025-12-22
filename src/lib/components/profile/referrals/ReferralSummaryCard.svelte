<script lang="ts">
  interface Props {
    totalReferrals: number;
    totalEarned: number;
    loading?: boolean;
  }

  let { totalReferrals, totalEarned, loading = false }: Props = $props();

  function formatEarned(amount: number): string {
    if (amount >= 1000) {
      return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    return amount.toFixed(2);
  }
</script>

<div class="border border-white/15 rounded-2xl p-4 w-full">
  {#if loading}
    <div class="flex gap-2 items-start w-full animate-pulse">
      <div class="flex-1 flex flex-col gap-2 items-center text-center">
        <div class="h-4 w-16 bg-white/10 rounded"></div>
        <div class="h-7 w-12 bg-white/10 rounded"></div>
      </div>
      <div class="w-px self-stretch bg-white/15"></div>
      <div class="flex-1 flex flex-col gap-2 items-center text-center">
        <div class="h-4 w-14 bg-white/10 rounded"></div>
        <div class="h-7 w-16 bg-white/10 rounded"></div>
      </div>
      <div class="w-px self-stretch bg-white/15"></div>
      <div class="flex-1 flex flex-col gap-2 items-center text-center">
        <div class="h-4 w-20 bg-white/10 rounded"></div>
        <div class="h-7 w-12 bg-white/10 rounded"></div>
      </div>
    </div>
  {:else}
    <div class="flex gap-2 items-start w-full">
      <!-- Referrals -->
      <div class="flex-1 flex flex-col gap-2 items-center text-center capitalize leading-normal">
        <p class="text-sm text-white/70 w-full">Referrals</p>
        <p class="text-2xl font-bold text-white w-full">{totalReferrals}</p>
      </div>

      <div class="w-px self-stretch bg-white/15"></div>

      <!-- Earned -->
      <div class="flex-1 flex flex-col gap-2 items-center text-center capitalize leading-normal">
        <p class="text-sm text-white/70 w-full">Earned</p>
        <p class="text-2xl font-bold text-white w-full">{formatEarned(totalEarned)}</p>
      </div>

      <div class="w-px self-stretch bg-white/15"></div>

      <!-- Profit Month (fixed 2% rate) -->
      <div class="flex-1 flex flex-col gap-2 items-center text-center capitalize leading-normal">
        <p class="text-sm text-white/70 w-full">Profit Month</p>
        <p class="text-2xl font-bold text-white w-full">+2%</p>
      </div>
    </div>
  {/if}
</div>
