<script lang="ts">
  import type { AssetBalance } from '$lib/voi/balances';
  import { formatBalance } from '$lib/voi/balances';
  import TokenIcon from '$lib/components/icons/TokenIcon.svelte';
  import ArrowUpDownIcon from '$lib/components/icons/ArrowUpDownIcon.svelte';

  interface Props {
    isOpen: boolean;
    balances: AssetBalance[];
    usdc: AssetBalance | null;
    onTokenClick: (token: AssetBalance) => void;
    onOpenSwap: () => void;
    loading?: boolean;
  }

  let { isOpen, balances, usdc, onTokenClick, onOpenSwap, loading = false }: Props = $props();

  // Combine USDC with other tokens for unified list
  const allTokens = $derived(() => {
    const tokens: AssetBalance[] = [];
    if (usdc) tokens.push(usdc);
    tokens.push(...balances);
    return tokens;
  });
</script>

{#if isOpen}
  <div
    class="absolute right-0 top-full mt-2 min-w-[200px] max-w-[calc(100vw-2rem)] bg-[#4c4c4c] rounded-lg shadow-xl overflow-hidden z-50 p-6"
  >
    <!-- Token List -->
    <div class="flex flex-col gap-6">
      {#each allTokens() as token}
        <button
          type="button"
          onclick={() => onTokenClick(token)}
          class="w-full flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <TokenIcon symbol={token.symbol} imageUrl={token.imageUrl} size={24} />
          <div class="flex items-center gap-1 text-sm">
            <span class="text-white capitalize">
              {formatBalance(token.balance, token.decimals)}
            </span>
            <span class="text-white/70 uppercase">
              {token.symbol}
            </span>
          </div>
        </button>
      {/each}

      {#if allTokens().length === 0}
        <div class="text-center text-white/70 text-sm py-2">
          {loading ? 'Loading...' : 'No tokens found'}
        </div>
      {/if}
    </div>

    <!-- Divider -->
    <div class="h-px bg-white/15 my-3"></div>

    <!-- Token Management -->
    <button
      type="button"
      onclick={onOpenSwap}
      class="w-full flex items-center gap-2 hover:opacity-80 transition-opacity"
    >
      <ArrowUpDownIcon size={24} class="text-white" />
      <span class="text-sm font-medium text-white capitalize">
        Token management
      </span>
    </button>
  </div>
{/if}
