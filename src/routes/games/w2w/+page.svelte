<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import GameContainer from '$lib/components/game/GameContainer.svelte';
  import { gameConfigService } from '$lib/services/gameConfigService';
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
  // Don't provide default gameUrl - let GameContainer detect from game_type
  const finalGameUrl = $derived(
    finalMode === 'external' ? gameUrl : undefined
  );

  // Fetch game config for page title
  let gameConfig = $state<{ display_name: string } | null>(null);

  onMount(async () => {
    if (contractId) {
      try {
        const config = await gameConfigService.getConfigByContractId(contractId);
        if (config) {
          gameConfig = { display_name: config.display_name };
        }
      } catch (err) {
        console.error('Failed to fetch game config for title:', err);
      }
    }
  });
</script>

<svelte:head>
  <title>{gameConfig?.display_name || 'Ways to Win Slots'} - House of Voi</title>
</svelte:head>

<GameContainer
  contractId={contractId}
  algorandAddress={data.algorandAddress}
  mode={finalMode}
  gameUrl={finalGameUrl}
/>
