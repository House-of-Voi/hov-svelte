<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import SlotsGame from './SlotsGame.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { SlotMachineIcon } from '$lib/components/icons';
	import { GameBridge } from '$lib/game-engine/bridge/GameBridge';
	import { CdpAlgorandSigner } from '$lib/wallet/CdpAlgorandSigner';
	import { getInitializedCdp } from '$lib/auth/cdpClient';
	import { deriveAlgorandAddressFromEVM } from '$lib/chains/algorand-derive';

	interface Props {
		contractId?: bigint;
		algorandAddress?: string | null;
		mode?: 'embedded' | 'external';
		gameUrl?: string;
	}

	let { 
		contractId, 
		algorandAddress,
		mode = 'embedded',
		gameUrl 
	}: Props = $props();

	let bridge: GameBridge | null = $state(null);
	let iframeRef: HTMLIFrameElement | null = $state(null);
	let iframeError = $state<string | null>(null);
	let isInitializing = $state(false);

	// Compute iframe URL (only on client)
	let iframeUrl = $derived.by(() => {
		if (!gameUrl) return '';
		// If relative URL, make it absolute (only on client)
		if (gameUrl.startsWith('/')) {
			if (typeof window !== 'undefined') {
				return window.location.origin + gameUrl;
			}
			// During SSR, return relative URL (will be resolved by browser)
			return gameUrl;
		}
		return gameUrl;
	});

	// Initialize bridge for external mode
	onMount(async () => {
		if (mode === 'external' && contractId && algorandAddress) {
			await initializeBridge();
		}
		});

	onDestroy(() => {
		if (bridge) {
			bridge.destroy();
			bridge = null;
		}
	});

	async function initializeBridge() {
		if (!contractId || !algorandAddress || isInitializing) {
			return;
		}

		isInitializing = true;
		iframeError = null;

		try {
			// Get CDP SDK and wallet setup (similar to SlotsGame)
			const cdpSdk = await getInitializedCdp();
			if (!cdpSdk) {
				throw new Error('CDP SDK not initialized');
			}

			// Get current user and EVM address
			const user = await cdpSdk.getCurrentUser();
			if (!user) {
				throw new Error('No user logged in');
			}

			// Get wallet address from user (similar to SlotsGame)
			const userAccounts: Array<string | undefined> = [
				...(Array.isArray((user as { evmAccounts?: string[] }).evmAccounts)
					? (user as { evmAccounts: string[] }).evmAccounts
					: []),
				...(Array.isArray((user as { evmSmartAccounts?: string[] }).evmSmartAccounts)
					? (user as { evmSmartAccounts: string[] }).evmSmartAccounts
					: []),
				(user as { walletAddress?: string }).walletAddress,
			];

			let baseWalletAddress: string | null = null;
			for (const account of userAccounts) {
				if (account) {
					baseWalletAddress = account;
					break;
				}
			}

			if (!baseWalletAddress) {
				throw new Error('Unable to access your Base wallet');
			}

			if (!baseWalletAddress.startsWith('0x')) {
				baseWalletAddress = `0x${baseWalletAddress.replace(/^0x/, '')}`;
			}

			// Create wallet signer (cast cdpSdk to match expected type)
			const signer = new CdpAlgorandSigner(
				cdpSdk as any, // Type compatibility issue with CDP SDK types
				baseWalletAddress,
				algorandAddress
			);

			// Create and initialize bridge
			bridge = new GameBridge({
				contractId,
				walletAddress: algorandAddress,
				walletSigner: signer,
			});

			await bridge.initialize();

			// Set iframe reference for postMessage
			if (iframeRef) {
				bridge.setTargetIframe(iframeRef);
			}

			console.log('✅ GameBridge initialized for external game');
		} catch (error) {
			console.error('Failed to initialize GameBridge:', error);
			iframeError = error instanceof Error ? error.message : 'Failed to initialize game bridge';
		} finally {
			isInitializing = false;
		}
	}

	function handleIframeLoad() {
		if (bridge && iframeRef) {
			bridge.setTargetIframe(iframeRef);
		}
	}

	function handleIframeError() {
		iframeError = 'Failed to load game. Please check the game URL.';
	}

	function validateGameUrl(url: string | undefined): boolean {
		if (!url) return false;
		// Allow relative URLs (for iframe route)
		if (url.startsWith('/')) return true;
		// Allow absolute URLs
		try {
			const parsed = new URL(url);
			return parsed.protocol === 'http:' || parsed.protocol === 'https:';
		} catch {
			return false;
		}
	}

</script>

{#if mode === 'embedded'}
	<!-- Embedded mode: Use existing Svelte UI -->
	<SlotsGame {contractId} {algorandAddress} />
{:else if mode === 'external'}
	<!-- External mode: Load third-party game in iframe -->
	<div class="space-y-8 max-w-6xl mx-auto p-4">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div>
				<h1
					class="text-4xl font-black text-warning-500 dark:text-warning-400 neon-text uppercase flex items-center gap-3"
				>
					<SlotMachineIcon size={48} />
					5-Reel Slots
				</h1>
				<p class="text-tertiary mt-2">
					Match 3+ symbols on a payline to win. Provably fair blockchain gaming on Voi.
				</p>
			</div>
			<a href="/games">
				<Button variant="ghost" size="sm"> ← Back to Lobby </Button>
			</a>
		</div>

		<!-- Game content -->
		<div class="game-content">
			{#if isInitializing}
				<div class="loading-state">
					<div class="spinner"></div>
					<p>Initializing game bridge...</p>
				</div>
			{:else if iframeError}
				<div class="error-state">
					<p class="error-message">{iframeError}</p>
					<button 
						onclick={() => initializeBridge()}
						class="retry-button"
					>
						Retry
					</button>
				</div>
			{:else if !validateGameUrl(gameUrl)}
				<div class="error-state">
					<p class="error-message">Invalid game URL. Please provide a valid HTTP/HTTPS URL.</p>
				</div>
			{:else if gameUrl}
			<iframe
				bind:this={iframeRef}
				src={iframeUrl}
				class="game-iframe"
				sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
				scrolling="auto"
				title="Third-party game"
				onload={handleIframeLoad}
				onerror={handleIframeError}
			></iframe>
			{:else}
				<div class="error-state">
					<p class="error-message">No game URL provided. Please specify a game URL to load.</p>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.game-content {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.game-iframe {
		width: 100%;
		height: calc(100vh - 300px);
		min-height: 100vh;
		border: none;
		background: #000;
		border-radius: 0.5rem;
		/* Iframe content will scroll automatically if taller than iframe height */
	}

	.loading-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 2rem;
		text-align: center;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid #e5e7eb;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-message {
		color: #ef4444;
		font-size: 1rem;
		margin: 0;
	}

	.retry-button {
		padding: 0.5rem 1rem;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.875rem;
		transition: background-color 0.2s;
	}

	.retry-button:hover {
		background: #2563eb;
	}
</style>

