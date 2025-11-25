<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { GameBridge } from '$lib/game-engine/bridge/GameBridge';
	import { StoredKeySigner } from '$lib/wallet/StoredKeySigner';

	interface Props {
		contractId: bigint;
		walletAddress: string;
		children?: import('svelte').Snippet;
	}

	let { contractId, walletAddress, children }: Props = $props();

	let bridge: GameBridge | null = $state(null);
	let initError: string | null = $state(null);
	let isInitializing = false;

	// Track previous props to detect changes
	let prevContractId: bigint | undefined = undefined;
	let prevWalletAddress: string | undefined = undefined;

	onMount(async () => {
		// Prevent double initialization
		if (isInitializing || bridge) {
			console.log('GameBridgeWrapper: Already initializing or initialized, skipping');
			return;
		}

		isInitializing = true;
		prevContractId = contractId;
		prevWalletAddress = walletAddress;

		try {
			console.log('GameBridgeWrapper: Initializing bridge', {
				contractId: contractId.toString(),
				walletAddress
			});

			// Create signer using stored keys
			const signer = new StoredKeySigner(walletAddress);
			console.log('GameBridgeWrapper: Signer created for address:', walletAddress);

			// Create and initialize GameBridge
			bridge = new GameBridge({
				contractId,
				walletAddress,
				walletSigner: signer,
			});

			await bridge.initialize();
			console.log('GameBridgeWrapper: Bridge initialized successfully');
		} catch (error) {
			console.error('GameBridgeWrapper: Failed to initialize bridge:', error);
			initError = error instanceof Error ? error.message : 'Failed to initialize game';
		} finally {
			isInitializing = false;
		}
	});

	onDestroy(() => {
		if (bridge) {
			console.log('GameBridgeWrapper: Destroying bridge');
			bridge.destroy();
			bridge = null;
		}
	});
</script>

{#if initError}
	<div class="flex items-center justify-center h-screen bg-neutral-50 dark:bg-neutral-900">
		<div class="text-center p-8">
			<div class="text-error-500 text-xl font-semibold mb-2">Failed to Initialize Game</div>
			<div class="text-neutral-600 dark:text-neutral-400">{initError}</div>
			<a href="/games" class="mt-4 inline-block px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors">
				Back to Lobby
			</a>
		</div>
	</div>
{:else}
	{@render children?.()}
{/if}
