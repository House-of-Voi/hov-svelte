<script lang="ts">
	import W2WSlotsGamePostMessage from '$lib/components/game/W2WSlotsGamePostMessage.svelte';
	import GameBridgeWrapper from '$lib/components/game/GameBridgeWrapper.svelte';
	import { gameConfigService } from '$lib/services/gameConfigService';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Parse contractId from string to bigint (skip for test-mode)
	const contractId = $derived(
		data.contractId && data.contractId !== 'test-mode' ? BigInt(data.contractId) : undefined
	);
	const algorandAddress = $derived(data.algorandAddress);

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

{#if data.contractId === 'test-mode'}
	<!-- Test mode: No bridge needed, parent (testing suite) handles all communication -->
	<W2WSlotsGamePostMessage />
{:else if contractId && algorandAddress}
	<!-- Normal mode: Use GameBridge for blockchain communication -->
	{#key `${contractId}-${algorandAddress}`}
		<GameBridgeWrapper contractId={contractId} walletAddress={algorandAddress}>
			<W2WSlotsGamePostMessage />
		</GameBridgeWrapper>
	{/key}
{:else}
	<div class="flex items-center justify-center h-screen bg-neutral-50 dark:bg-neutral-900">
		<div class="text-center p-8">
			<div class="text-neutral-600 dark:text-neutral-400">Loading game...</div>
		</div>
	</div>
{/if}
