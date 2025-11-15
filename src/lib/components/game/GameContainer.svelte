<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import SlotsGame from './SlotsGame.svelte';
	import W2WSlotsGame from './W2WSlotsGame.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { SlotMachineIcon } from '$lib/components/icons';
	import { GameBridge } from '$lib/game-engine/bridge/GameBridge';
	import { StoredKeySigner } from '$lib/wallet/StoredKeySigner';
	import { getStoredVoiAddress } from '$lib/auth/keyStorage';
	import { gameConfigService } from '$lib/services/gameConfigService';
	import { page } from '$app/stores';

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
	let gameConfig = $state<{ display_name: string; description: string | null; game_type?: '5reel' | 'w2w' } | null>(null);
	let gameConfigLoading = $state(true);

	// Determine game URL: use provided gameUrl, or auto-detect from game_type
	const resolvedGameUrl = $derived.by(() => {
		// If gameUrl is explicitly provided, use it (don't wait for gameConfig)
		if (gameUrl) {
			console.log('🎯 Using provided gameUrl:', gameUrl);
			return gameUrl;
		}
		
		// If gameConfig is still loading and no explicit gameUrl, wait
		if (gameConfigLoading && mode === 'external') {
			return '';
		}
		
		// Otherwise, determine from game_type when in external mode
		if (mode === 'external' && gameConfig?.game_type) {
			let detectedUrl = '';
			if (gameConfig.game_type === 'w2w') {
				detectedUrl = '/games/w2w/iframe';
			} else if (gameConfig.game_type === '5reel') {
				detectedUrl = '/games/slots/iframe';
			}
			
			if (detectedUrl) {
				console.log('🎯 Auto-detected game URL from game_type:', {
					gameType: gameConfig.game_type,
					detectedUrl,
					contractId: contractId?.toString()
				});
				return detectedUrl;
			}
		}
		
		// Fallback: if we have a contractId but no gameConfig yet, wait
		if (contractId && gameConfigLoading) {
			return '';
		}
		
		return '';
	});

	// Compute iframe URL (only on client)
	let iframeUrl = $derived.by(() => {
		if (!resolvedGameUrl) return '';
		// If relative URL, make it absolute (only on client)
		if (resolvedGameUrl.startsWith('/')) {
			if (typeof window !== 'undefined') {
				return window.location.origin + resolvedGameUrl;
			}
			// During SSR, return relative URL (will be resolved by browser)
			return resolvedGameUrl;
		}
		return resolvedGameUrl;
	});

	// Fetch game config for display and game type detection
	$effect(() => {
		if (contractId && (mode === 'external' || mode === 'embedded')) {
			gameConfigLoading = true;
			gameConfigService.getConfigByContractId(contractId).then(config => {
				if (config) {
					gameConfig = {
						display_name: config.display_name,
						description: config.description,
						game_type: config.game_type
					};
					console.log('🎮 Game Config Loaded:', {
						contractId: contractId.toString(),
						gameType: config.game_type,
						displayName: config.display_name,
						mode
					});
				}
				gameConfigLoading = false;
			}).catch(err => {
				console.error('Failed to fetch game config:', err);
				gameConfigLoading = false;
			});
		} else {
			gameConfigLoading = false;
		}
	});

	// Initialize bridge for external mode
	onMount(() => {
		if (mode === 'external' && contractId) {
			initializeBridge();
		}
	});

	// Re-initialize when address becomes available
	$effect(() => {
		if (mode === 'external' && contractId && !bridge && !isInitializing) {
			const hasAddress = algorandAddress || $page.data.session?.voiAddress;
			if (hasAddress) {
				console.log('🔄 Address available, initializing bridge...');
				initializeBridge();
			} else {
				// Try to get from stored keys
				getStoredVoiAddress().then(storedAddress => {
					if (storedAddress && !bridge && !isInitializing) {
						console.log('🔄 Stored address found, initializing bridge...');
						initializeBridge();
					}
				}).catch(err => {
					console.error('Failed to get stored address:', err);
				});
			}
		}
	});

	onDestroy(() => {
		if (bridge) {
			bridge.destroy();
			bridge = null;
		}
	});

	async function initializeBridge() {
		if (!contractId || isInitializing || bridge) {
			return;
		}

		isInitializing = true;
		iframeError = null;

		try {
			console.log('🚀 Initializing GameBridge...');
			
			// Get Voi address from props, session, or stored keys
			let voiAddress: string | null = algorandAddress || null;

			// If no address from props, try to get it from session
			if (!voiAddress) {
				const session = $page.data.session;
				voiAddress = session?.voiAddress || null;
				console.log('Address from session:', voiAddress);
			}

			// If still no address, try to get it from stored keys
			if (!voiAddress) {
				console.log('No address from props/session, checking stored keys...');
				voiAddress = await getStoredVoiAddress();
				console.log('Address from stored keys:', voiAddress);
			}

			if (!voiAddress) {
				throw new Error('Voi address not available. Please refresh the page to establish your session.');
			}

			// Create wallet signer using stored keys
			const signer = new StoredKeySigner(voiAddress);

			console.log('✅ Stored key signer created for GameBridge:', voiAddress);

			// Create and initialize bridge
			bridge = new GameBridge({
				contractId,
				walletAddress: voiAddress,
				walletSigner: signer,
			});

			// Set iframe reference BEFORE initializing (so messages can be sent immediately)
			if (iframeRef) {
				bridge.setTargetIframe(iframeRef);
			}

			await bridge.initialize();

			console.log('✅ GameBridge initialized for external game');
		} catch (error) {
			console.error('Failed to initialize GameBridge:', error);
			iframeError = error instanceof Error ? error.message : 'Failed to initialize game bridge';
		} finally {
			isInitializing = false;
		}
	}

	function handleIframeLoad() {
		console.log('📦 Iframe loaded:', {
			url: iframeUrl,
			resolvedUrl: resolvedGameUrl,
			gameType: gameConfig?.game_type,
			hasBridge: !!bridge
		});
		
		if (bridge && iframeRef) {
			bridge.setTargetIframe(iframeRef);
		} else if (!bridge && iframeRef) {
			// Iframe loaded but bridge not initialized yet - try to initialize
			console.log('🔄 Iframe loaded, attempting to initialize bridge...');
			initializeBridge();
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
	{#if gameConfig?.game_type === 'w2w'}
		<W2WSlotsGame {contractId} {algorandAddress} />
	{:else}
		<SlotsGame {contractId} {algorandAddress} />
	{/if}
{:else if mode === 'external'}
	<!-- External mode: Load third-party game in iframe -->
	<div class="space-y-8 max-w-6xl mx-auto p-4">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div>
				<div class="flex items-center gap-3">
					<h1
						class="text-4xl font-black text-warning-500 dark:text-warning-400 neon-text uppercase flex items-center gap-3"
					>
						<SlotMachineIcon size={48} />
						{gameConfig?.display_name || '5-Reel Slots'}
					</h1>
					{#if gameConfig?.game_type}
						<span 
							class="px-3 py-1 text-xs font-bold uppercase rounded-full {gameConfig.game_type === 'w2w' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' : 'bg-purple-500/20 text-purple-400 border border-purple-500/50'}"
							title="Game Type: {gameConfig.game_type === 'w2w' ? 'Ways to Win' : '5-Reel Slots'}"
						>
							{gameConfig.game_type === 'w2w' ? 'W2W' : '5REEL'}
						</span>
					{/if}
				</div>
				<p class="text-tertiary mt-2">
					{gameConfig?.description || 'Match 3+ symbols on a payline to win. Provably fair blockchain gaming on Voi.'}
				</p>
				{#if gameConfigLoading}
					<p class="text-xs text-tertiary/60 mt-1">
						Detecting game type...
					</p>
				{/if}
			</div>
			<a href="/games">
				<Button variant="ghost" size="sm"> ← Back to Lobby </Button>
			</a>
		</div>

		<!-- Game content -->
		<div class="game-content">
			{#if gameConfigLoading && !gameUrl}
				<div class="loading-state">
					<div class="spinner"></div>
					<p>Loading game configuration...</p>
				</div>
			{:else if isInitializing}
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
			{:else if !validateGameUrl(resolvedGameUrl)}
				<div class="error-state">
					<p class="error-message">Invalid game URL. Please provide a valid HTTP/HTTPS URL.</p>
				</div>
			{:else if resolvedGameUrl}
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

