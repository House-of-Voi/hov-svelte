<script lang="ts">
  import SlotsGame from '$lib/components/game/SlotsGame.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Parse contractId from string to bigint
  const contractId = data.contractId ? BigInt(data.contractId) : undefined;
</script>

<svelte:head>
  <title>5-Reel Slots - House of Voi</title>
</svelte:head>

<SlotsGame
  contractId={contractId}
  algorandAddress={data.algorandAddress}
/>
