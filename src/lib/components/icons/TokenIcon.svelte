<script lang="ts">
  interface Props {
    symbol: string;
    imageUrl?: string;
    size?: number;
    class?: string;
  }

  let { symbol, imageUrl, size = 24, class: className = '' }: Props = $props();

  // Generate a consistent color based on the symbol
  const getSymbolColor = (sym: string): string => {
    const colors: Record<string, string> = {
      'USDC': 'bg-blue-500',
      'VOI': 'bg-purple-500',
      'UNIT': 'bg-green-500',
      'BTC': 'bg-orange-500',
      'ETH': 'bg-indigo-500',
      'SOL': 'bg-gradient-to-r from-purple-500 to-green-500'
    };
    return colors[sym.toUpperCase()] || 'bg-neutral-500';
  };

  const bgColor = $derived(getSymbolColor(symbol));
  const initial = $derived(symbol.charAt(0).toUpperCase());
</script>

{#if imageUrl}
  <img
    src={imageUrl}
    alt={symbol}
    width={size}
    height={size}
    class="rounded-full {className}"
    onerror={(e) => {
      const target = e.currentTarget as HTMLImageElement;
      target.style.display = 'none';
      target.nextElementSibling?.classList.remove('hidden');
    }}
  />
  <div
    class="hidden rounded-full {bgColor} flex items-center justify-center text-white font-semibold {className}"
    style="width: {size}px; height: {size}px; font-size: {size * 0.4}px;"
  >
    {initial}
  </div>
{:else}
  <div
    class="rounded-full {bgColor} flex items-center justify-center text-white font-semibold {className}"
    style="width: {size}px; height: {size}px; font-size: {size * 0.4}px;"
  >
    {initial}
  </div>
{/if}
