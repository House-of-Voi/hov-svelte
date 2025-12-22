<script lang="ts">
  import type { AssetBalance } from '$lib/voi/balances';
  import { formatBalance } from '$lib/voi/balances';
  import TokenIcon from '$lib/components/icons/TokenIcon.svelte';
  import ChevronDownIcon from '$lib/components/icons/ChevronDownIcon.svelte';

  interface Props {
    selectedToken: AssetBalance | null;
    availableTokens: AssetBalance[];
    onSelect: (token: AssetBalance) => void;
    disabled?: boolean;
    label?: string;
  }

  let { selectedToken, availableTokens, onSelect, disabled = false, label }: Props = $props();

  let isOpen = $state(false);
  let dropdownRef = $state<HTMLDivElement | null>(null);

  function toggleDropdown() {
    if (!disabled) {
      isOpen = !isOpen;
    }
  }

  function selectToken(token: AssetBalance) {
    onSelect(token);
    isOpen = false;
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (dropdownRef && !dropdownRef.contains(target)) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  });
</script>

<div class="relative" bind:this={dropdownRef}>
  {#if label}
    <span class="text-xs text-neutral-500 dark:text-neutral-400 mb-1 block">{label}</span>
  {/if}

  <button
    type="button"
    onclick={toggleDropdown}
    {disabled}
    class="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 transition-colors min-w-[120px] disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {#if selectedToken}
      <TokenIcon symbol={selectedToken.symbol} imageUrl={selectedToken.imageUrl} size={20} />
      <span class="font-medium text-neutral-900 dark:text-white">{selectedToken.symbol}</span>
    {:else}
      <span class="text-neutral-500 dark:text-neutral-400">Select token</span>
    {/if}
    <ChevronDownIcon
      size={16}
      class="ml-auto text-neutral-500 transition-transform {isOpen ? 'rotate-180' : ''}"
    />
  </button>

  {#if isOpen && !disabled}
    <div
      class="absolute top-full left-0 mt-1 w-full min-w-[180px] bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 z-50 max-h-60 overflow-y-auto"
    >
      {#each availableTokens as token}
        <button
          type="button"
          onclick={() => selectToken(token)}
          class="w-full flex items-center gap-3 px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors text-left {selectedToken?.symbol === token.symbol ? 'bg-primary-50 dark:bg-primary-900/20' : ''}"
        >
          <TokenIcon symbol={token.symbol} imageUrl={token.imageUrl} size={24} />
          <div class="flex-1 min-w-0">
            <div class="font-medium text-neutral-900 dark:text-white">{token.symbol}</div>
            <div class="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {formatBalance(token.balance, token.decimals)}
            </div>
          </div>
        </button>
      {/each}
      {#if availableTokens.length === 0}
        <div class="px-3 py-4 text-center text-neutral-500 dark:text-neutral-400 text-sm">
          No tokens available
        </div>
      {/if}
    </div>
  {/if}
</div>
