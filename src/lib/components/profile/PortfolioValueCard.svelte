<script lang="ts">
  interface Props {
    portfolioValue?: string;
    usdValue?: string;
    availableBalance?: string;
    profitLoss?: string;
    profitLossPercent?: number;
    onReceive?: () => void;
    onSwap?: () => void;
    onHistory?: () => void;
    onRefresh?: () => void;
    loading?: boolean;
  }

  let {
    portfolioValue = '0.00',
    usdValue = '0.00',
    availableBalance = '0',
    profitLoss = '+0',
    profitLossPercent = 0,
    onReceive,
    onSwap,
    onHistory,
    onRefresh,
    loading = false
  }: Props = $props();

  // Format profit/loss with sign and percentage
  const formattedProfitLoss = $derived(() => {
    const sign = profitLossPercent >= 0 ? '+' : '';
    return `${profitLoss} USDC (${sign}${profitLossPercent.toFixed(2)}%)`;
  });
</script>

<div class="border border-white/15 rounded-2xl p-4 flex flex-col gap-4 w-full">
  <!-- Portfolio Value Section -->
  <div class="flex flex-col gap-2">
    <p class="text-sm text-white/70 capitalize">Portfolio Value</p>
    {#if loading}
      <div class="h-7 w-32 bg-white/10 rounded animate-pulse"></div>
      <div class="h-5 w-20 bg-white/10 rounded animate-pulse"></div>
    {:else}
      <p class="text-2xl font-bold text-white">{portfolioValue} USDC</p>
      <p class="text-base font-medium text-white">${usdValue} USD</p>
    {/if}
  </div>

  <!-- Divider -->
  <div class="h-px bg-white/15 w-full"></div>

  <!-- Balance Row -->
  <div class="flex gap-4 w-full">
    <div class="flex-1 flex flex-col gap-2">
      <p class="text-sm text-white/70 capitalize">Available Balance</p>
      {#if loading}
        <div class="h-5 w-16 bg-white/10 rounded animate-pulse"></div>
      {:else}
        <p class="text-base font-medium text-white">{availableBalance} USDC</p>
      {/if}
    </div>
    <div class="flex-1 flex flex-col gap-2 text-right">
      <p class="text-sm text-white/70 capitalize">Profit/Loss</p>
      {#if loading}
        <div class="h-5 w-24 bg-white/10 rounded animate-pulse ml-auto"></div>
      {:else}
        <p class="text-base font-medium text-white">{formattedProfitLoss()}</p>
      {/if}
    </div>
  </div>

  <!-- Action Buttons -->
  <div class="flex gap-4 w-full">
    <button
      type="button"
      onclick={onReceive}
      class="flex-1 h-10 flex items-center justify-center px-4 py-2 bg-[#333] border-2 border-[#808080] rounded-full text-sm font-medium text-white uppercase hover:bg-[#404040] transition-colors"
    >
      Receive
    </button>
    <button
      type="button"
      onclick={onSwap}
      class="flex-1 h-10 flex items-center justify-center px-4 py-2 bg-[#333] border-2 border-[#808080] rounded-full text-sm font-medium text-white uppercase hover:bg-[#404040] transition-colors"
    >
      Swap
    </button>
    <button
      type="button"
      onclick={onHistory}
      class="flex-1 h-10 flex items-center justify-center px-4 py-2 bg-[#333] border-2 border-[#808080] rounded-full text-sm font-medium text-white uppercase hover:bg-[#404040] transition-colors"
    >
      History
    </button>
  </div>
</div>
