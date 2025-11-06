<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchAllBalances, formatBalance, formatUsdValue } from '$lib/voi/balances';
  import type { AssetBalance } from '$lib/voi/balances';
  import SwapPlaceholderModal from './SwapPlaceholderModal.svelte';
  import VoiWithdrawModal from './VoiWithdrawModal.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { page } from '$app/stores';

  interface Props {
    address: string;
  }

  let { address }: Props = $props();

  let balances = $state<AssetBalance[]>([]);
  let usdcBalance = $state<AssetBalance | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let lastFetched = $state<Date | null>(null);
  let swapModal = $state<{
    isOpen: boolean;
    tokenSymbol: string;
    action: 'deposit' | 'withdraw';
  }>({
    isOpen: false,
    tokenSymbol: '',
    action: 'deposit',
  });
  let showVoiWithdrawModal = $state(false);

  const loadBalances = async () => {
    loading = true;
    error = null;

    try {
      const data = await fetchAllBalances(address);
      balances = data.otherTokens; // Only set other tokens (VOI, UNIT)
      usdcBalance = data.usdc; // Store USDC balance for VoiWithdrawModal
      lastFetched = new Date();
    } catch (err) {
      console.error('Error loading balances:', err);
      error = 'Failed to load balances';
    } finally {
      loading = false;
    }
  };

  // Load balances on mount and when address changes
  onMount(() => {
    loadBalances();
  });

  $effect(() => {
    // Re-load when address changes
    if (address) {
      loadBalances();
    }
  });

  const handleRefresh = () => {
    loadBalances();
  };

  const handleDeposit = (tokenSymbol: string) => {
    swapModal = {
      isOpen: true,
      tokenSymbol,
      action: 'deposit',
    };
  };

  const handleWithdraw = (tokenSymbol: string) => {
    // If VOI, open the Voi Withdraw Modal instead of swap modal
    if (tokenSymbol === 'VOI') {
      showVoiWithdrawModal = true;
      return;
    }
    
    // For other tokens, use the swap placeholder modal
    swapModal = {
      isOpen: true,
      tokenSymbol,
      action: 'withdraw',
    };
  };

  const closeSwapModal = () => {
    swapModal = {
      isOpen: false,
      tokenSymbol: '',
      action: 'deposit',
    };
  };

  // Handle image error
  function handleImageError(event: Event) {
    const target = event.currentTarget as HTMLImageElement;
    target.classList.add('hidden');
  }
</script>

{#if loading && !lastFetched}
  <div class="mt-3 p-3 bg-warning-50 dark:bg-warning-500/5 border border-warning-200 dark:border-warning-500/20 rounded-lg">
    <p class="text-sm text-neutral-600 dark:text-neutral-400">Loading balances...</p>
  </div>
{:else if error && balances.length === 0}
  <div class="mt-3 p-3 bg-error-100 dark:bg-error-500/10 border border-error-300 dark:border-error-500/30 rounded-lg">
    <p class="text-sm text-error-600 dark:text-error-400">{error}</p>
    <Button
      variant="ghost"
      size="sm"
      onclick={handleRefresh}
      disabled={loading}
      class="mt-2"
    >
      Retry
    </Button>
  </div>
{:else}
  <div class="mt-3 space-y-2">
    <div class="flex items-center justify-between">
      <p class="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
        Other Tokens
      </p>
      <button
        onclick={handleRefresh}
        disabled={loading}
        class="text-xs text-warning-500 dark:text-warning-400 hover:text-warning-600 dark:hover:text-warning-300 disabled:text-neutral-600 dark:disabled:text-neutral-500 transition-colors"
        title="Refresh balances"
      >
        {loading ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>

    {#if balances.length === 0}
      <div class="p-3 bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 rounded-lg">
        <p class="text-sm text-neutral-600 dark:text-neutral-500">No other tokens found</p>
      </div>
    {:else}
      <div class="space-y-3">
        {#each balances as balance (balance.symbol)}
          {@const formattedBalance = formatBalance(balance.balance, balance.decimals)}
          {@const formattedUsd = formatUsdValue(balance.usdValue)}

          <div class="p-4 bg-warning-50 dark:bg-warning-500/5 border border-warning-200 dark:border-warning-500/20 rounded-lg space-y-3">
            <!-- Token Info and Balance -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                {#if balance.imageUrl}
                  <img
                    src={balance.imageUrl}
                    alt={balance.symbol}
                    width="28"
                    height="28"
                    class="h-7 w-7 rounded-full object-cover"
                    onerror={handleImageError}
                  />
                {/if}
                <div>
                  <div class="font-semibold text-neutral-800 dark:text-neutral-200 text-sm">
                    {balance.symbol}
                  </div>
                  <div class="text-xs text-neutral-600 dark:text-neutral-500">{balance.name}</div>
                </div>
              </div>

              <div class="text-right">
                <div class="font-mono text-sm font-bold text-warning-500 dark:text-warning-400">
                  {formattedBalance}
                </div>
                <div class="text-xs text-neutral-600 dark:text-neutral-500">{formattedUsd}</div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="flex gap-2">
              <button
                onclick={() => handleDeposit(balance.symbol)}
                class="flex-1 px-3 py-2 text-xs font-semibold bg-success-100 dark:bg-success-600/20 text-success-600 dark:text-success-400 border border-success-300 dark:border-success-500/30 rounded hover:bg-success-200 dark:hover:bg-success-600/30 transition-colors uppercase tracking-wide"
              >
                Deposit
              </button>
              <button
                onclick={() => handleWithdraw(balance.symbol)}
                class="flex-1 px-3 py-2 text-xs font-semibold bg-primary-100 dark:bg-primary-600/20 text-primary-600 dark:text-primary-400 border border-primary-300 dark:border-primary-500/30 rounded hover:bg-primary-200 dark:hover:bg-primary-600/30 transition-colors uppercase tracking-wide"
              >
                Withdraw
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if lastFetched}
      <p class="text-xs text-neutral-600 dark:text-neutral-500 text-right">
        Last updated: {lastFetched.toLocaleTimeString()}
      </p>
    {/if}
  </div>

  <!-- Swap Placeholder Modal -->
  <SwapPlaceholderModal
    isOpen={swapModal.isOpen}
    onClose={closeSwapModal}
    tokenSymbol={swapModal.tokenSymbol}
    action={swapModal.action}
  />

  <!-- Voi Withdraw Modal -->
  <VoiWithdrawModal
    isOpen={showVoiWithdrawModal}
    onClose={() => {
      showVoiWithdrawModal = false;
    }}
    onSuccess={() => {
      // Refresh balances after successful withdrawal
      loadBalances();
    }}
    address={address}
    voiBalance={balances.find(b => b.symbol === 'VOI') || null}
    usdcBalance={usdcBalance}
    session={$page.data.session}
  />
{/if}
