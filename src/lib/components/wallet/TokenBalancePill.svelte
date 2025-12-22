<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchAllBalances, formatBalance, type AssetBalance, type WalletBalances } from '$lib/voi/balances';
  import TokenIcon from '$lib/components/icons/TokenIcon.svelte';
  import TokenBalanceDropdown from './TokenBalanceDropdown.svelte';
  import SwapModal from './SwapModal.svelte';
  import ChevronDownIcon from '$lib/components/icons/ChevronDownIcon.svelte';

  interface Props {
    address: string | undefined;
  }

  let { address }: Props = $props();

  let isOpen = $state(false);
  let isSwapOpen = $state(false);
  let loading = $state(false);
  let usdc = $state<AssetBalance | null>(null);
  let otherTokens = $state<AssetBalance[]>([]);
  let containerRef = $state<HTMLDivElement | null>(null);

  const formattedUsdcBalance = $derived(
    usdc ? formatBalance(usdc.balance, usdc.decimals) : '0.00'
  );

  async function loadBalances() {
    if (!address) return;

    loading = true;
    try {
      const data: WalletBalances = await fetchAllBalances(address);
      usdc = data.usdc;
      otherTokens = data.otherTokens;
    } catch (err) {
      console.error('Failed to load balances:', err);
    } finally {
      loading = false;
    }
  }

  function toggleDropdown() {
    isOpen = !isOpen;
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (containerRef && !containerRef.contains(target)) {
      isOpen = false;
    }
  }

  function handleTokenClick(token: AssetBalance) {
    // Close dropdown when token is clicked
    isOpen = false;
  }

  function handleOpenSwap() {
    isOpen = false;
    isSwapOpen = true;
  }

  function handleCloseSwap() {
    isSwapOpen = false;
  }

  function handleSwapSuccess() {
    // Refresh balances after successful swap
    loadBalances();
  }

  $effect(() => {
    if (address) {
      loadBalances();
    }
  });

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  });
</script>

{#if address}
  <div class="relative" bind:this={containerRef}>
    <button
      type="button"
      onclick={toggleDropdown}
      class="flex items-center gap-2 px-4 py-2 rounded-full bg-[#333] border-2 border-[#808080] hover:bg-[#404040] transition-colors"
    >
      <TokenIcon symbol="USDC" size={18} />
      <span class="font-medium text-sm text-white tabular-nums">
        {#if loading}
          <span class="inline-block w-12 h-4 bg-neutral-600 rounded animate-pulse"></span>
        {:else}
          {formattedUsdcBalance}
        {/if}
      </span>
      <ChevronDownIcon
        size={14}
        class="text-white/70 transition-transform {isOpen ? 'rotate-180' : ''}"
      />
    </button>

    <TokenBalanceDropdown
      {isOpen}
      {usdc}
      balances={otherTokens}
      {loading}
      onTokenClick={handleTokenClick}
      onOpenSwap={handleOpenSwap}
    />
  </div>

  <SwapModal
    isOpen={isSwapOpen}
    onClose={handleCloseSwap}
    {address}
    onSuccess={handleSwapSuccess}
  />
{/if}
