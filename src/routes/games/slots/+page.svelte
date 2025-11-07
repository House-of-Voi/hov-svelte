<script lang="ts">
  import { page } from '$app/stores';
  import GameContainer from '$lib/components/game/GameContainer.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Parse contractId from string to bigint
  const contractId = data.contractId ? BigInt(data.contractId) : undefined;

  // Get mode and gameUrl from query params
  const mode = $derived($page.url.searchParams.get('mode'));
  const gameUrl = $derived($page.url.searchParams.get('url') || undefined);
  const useEmbeddedTest = $derived($page.url.searchParams.get('test') === 'embed');

  // Default: use iframe version (postMessage API)
  // Use embedded version only if test=embed param is present or mode=embedded is explicitly set
  const finalMode = $derived(
    useEmbeddedTest || mode === 'embedded' ? 'embedded' : 'external'
  );
  const finalGameUrl = $derived(
    finalMode === 'external' ? (gameUrl || '/games/slots/iframe') : undefined
  );
</script>

<svelte:head>
  <title>5-Reel Slots - House of Voi</title>
</svelte:head>

<GameContainer
  contractId={contractId}
  algorandAddress={data.algorandAddress}
  mode={finalMode}
  gameUrl={finalGameUrl}
/>
