<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { SlotMachineIcon, CoinsIcon } from '$lib/components/icons';

	// New game components
	import ReelGrid from './ReelGrid.svelte';
	import BettingControls from './BettingControls.svelte';
	import WinDisplay from './WinDisplay.svelte';

	// Game engine
	import { SlotMachineEngine } from '$lib/game-engine/SlotMachineEngine';
	import { VoiSlotMachineAdapter } from '$lib/game-engine/adapters';
	import { gameStore } from '$lib/game-engine/stores/gameStore.svelte';
	import { machineService } from '$lib/services/machineService';
	import { getArc200TokenInfo } from '$lib/voi/arc200';
	import { detectWinningPaylines, calculateTotalWinnings } from '$lib/game-engine/utils/winDetection';
	import { formatVoi, GAME_DEFAULTS } from '$lib/game-engine/utils/gameConstants';
	import { getWinLevel } from '$lib/game-engine/types/results';
	import { SpinStatus, GameEventType } from '$lib/game-engine/types';

	// Wallet signing
	import { StoredKeySigner } from '$lib/wallet/StoredKeySigner';
	import { getFirstStoredVoiAddress } from '$lib/auth/gameAccountStorage';

	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';

	interface Props {
		contractId?: bigint;
		algorandAddress?: string | null;
	}

	let { contractId = 1234n, algorandAddress }: Props = $props();
	let playerAlgorandAddress = $state<string | null>(null);

	// Game state from store
	let grid = $derived(gameStore.visibleGrid);
	let balance = $derived(gameStore.balance);
	let reservedBalance = $derived(gameStore.reservedBalance);
	let isSpinning = $derived(gameStore.isSpinning);
	let waitingForOutcome = $derived(gameStore.waitingForOutcome);
	let isAutoSpinning = $derived(gameStore.isAutoSpinning);
	let autoSpinCount = $derived(gameStore.autoSpinCount);
	let betPerLine = $derived(gameStore.currentBet.betPerLine);
	let paylines = $derived(gameStore.currentBet.paylines);
	let totalBet = $derived(gameStore.currentBet.totalBet);
	let spinQueue = $derived(gameStore.spinQueue);
	let lastError = $derived(gameStore.lastError);
	let showingWinCelebration = $derived(gameStore.showingWinCelebration);

	// Local state
	let engine: SlotMachineEngine | null = $state(null);
	let slotConfig = $state<any>(null);
	let gameConfig = $state<{ display_name: string; description: string | null; treasury_asset_id?: number } | null>(null);
	let reels = $state<any>(null);

	// Token info for the machine's betting currency
	let tokenInfo = $state<{ symbol: string; decimals: number; contractId: number | null }>({
		symbol: 'VOI',
		decimals: 6,
		contractId: null
	});
	let tokenBalance = $state<bigint>(0n);
	let winAmount = $state(0);
	let winLevel = $state<any>('small');
	let winningLines = $state<any>([]);
	let cleanupFn: (() => void) | null = $state(null);
	let showPaytableModal = $state(false);
	let isRefreshingBalance = $state(false);

	// Computed values
	let availableBalance = $derived(balance - reservedBalance);
	let pendingSpins = $derived(spinQueue.filter(s =>
		s.status !== SpinStatus.COMPLETED &&
		s.status !== SpinStatus.FAILED &&
		s.status !== SpinStatus.EXPIRED
	).length);

	/**
	 * Initialize the game engine
	 */
	async function initializeEngine() {
		// Don't initialize if already initializing or already initialized
		if (engine || cleanupFn) {
			console.log('⏭️ Engine already initialized or initializing, skipping');
			return;
		}

		console.log('🚀 Starting engine initialization...');

		const unsubscribers: Array<() => void> = [];

		try {
			// Initialize signer using stored keys
			console.log('🔐 Initializing wallet signer from stored keys...');

			// Try to get session from page data (may not be available in all routes)
			const session = $page.data.session || null;

			// Get Voi address from props first, then session, then stored keys
			playerAlgorandAddress = algorandAddress || null;

			// If no address from props, try session
			if (!playerAlgorandAddress && session?.voiAddress) {
				playerAlgorandAddress = session.voiAddress;
			}

			// If still no address, try to get it from stored game account keys
			if (!playerAlgorandAddress) {
				console.log('No address from props or session, checking stored game account keys...');
				const storedVoiAddress = getFirstStoredVoiAddress();
				playerAlgorandAddress = storedVoiAddress;
			}

			if (!playerAlgorandAddress) {
				console.warn('Voi address not available from any source');
				gameStore.setError(
					'Voi address not available. Please refresh the page to establish your session.'
				);
				return;
			}

			console.log('✅ Voi address found:', playerAlgorandAddress);

			// Create signer using stored keys
			const signer = new StoredKeySigner(playerAlgorandAddress);

			console.log('✅ Stored key signer created for address:', playerAlgorandAddress);

			// Create Voi adapter with wallet signer
			const adapter = new VoiSlotMachineAdapter({
				contractId,
				network: 'mainnet',
				walletSigner: signer
			});

			// Create engine
			engine = new SlotMachineEngine({ walletAddress: playerAlgorandAddress! }, adapter);

			// Listen to game events using specific callbacks
			unsubscribers.push(
				engine.onOutcome((result) => {
					console.log('🎰 Spin completed:', result);

					// Show win celebration if there are winnings
					if (result.winnings > 0) {
						// Convert winnings from microVOI to VOI for display
						winAmount = result.winnings / 1_000_000;
						winLevel = result.winLevel;
						winningLines = result.outcome.winningLines;
						gameStore.setWinCelebration(true);
					}
				})
			);

			unsubscribers.push(
				engine.onBalanceUpdate((balance, previous) => {
					console.log('💰 Balance updated:', balance, 'from', previous);
				})
			);

			unsubscribers.push(
				engine.onError((error) => {
					console.error('❌ Game error:', error);
					gameStore.setError(error.message);
				})
			);

			unsubscribers.push(
				engine.onSpinStart((spinId, betAmount, paylines) => {
					console.log('🎲 Spin started:', spinId);
				})
			);

			unsubscribers.push(
				engine.onSpinSubmitted((spinId, txId) => {
					console.log('📤 Spin submitted:', spinId, txId);
				})
			);

			// Initialize engine
			console.log('🔧 Initializing engine...');
			await engine.initialize();
			console.log('✅ Engine initialized successfully');

			// Get slot config
			console.log('📋 Fetching slot config...');
			slotConfig = await adapter.getContractConfig();
			reels = slotConfig.reelConfig.reels;
			console.log('✅ Slot config loaded');

			// Fetch machine config for display name, description, and token info
			if (contractId) {
				const machineConfig = await machineService.getMachineByContractId(contractId);
				if (machineConfig) {
					gameConfig = {
						display_name: machineConfig.display_name,
						description: machineConfig.description,
						treasury_asset_id: machineConfig.treasury_asset_id
					};

					// If machine has a treasury_asset_id, it uses an ARC200 token
					if (machineConfig.treasury_asset_id) {
						try {
							const arc200Info = await getArc200TokenInfo(machineConfig.treasury_asset_id);
							tokenInfo = {
								symbol: arc200Info.symbol || 'TOKEN',
								decimals: arc200Info.decimals || 6,
								contractId: machineConfig.treasury_asset_id
							};
							console.log('🪙 Machine uses ARC200 token:', tokenInfo.symbol);
						} catch (err) {
							console.error('Failed to fetch ARC200 token info:', err);
						}
					} else {
						// Native VOI
						tokenInfo = { symbol: 'VOI', decimals: 6, contractId: null };
					}
				}
			}

			// Fetch initial balance explicitly
			console.log('💰 Fetching initial balance...');
			await fetchTokenBalance();
			console.log('✅ Initial balance fetched');

			console.log('✅ SlotsGame mounted and initialized');
		} catch (error) {
			console.error('❌ Failed to initialize game:', error);
			const errorMessage = error instanceof Error ? error.message : 'Failed to initialize game';

			// Provide user-friendly error messages
			if (errorMessage.includes('No stored keys') || errorMessage.includes('keys found')) {
				gameStore.setError('Wallet keys not found. Please log in again to export and store your keys.');
			} else if (errorMessage.includes('CDP') || errorMessage.includes('wallet')) {
				gameStore.setError('Wallet connection failed. Please refresh and try again.');
			} else if (errorMessage.includes('not linked')) {
				gameStore.setError('Algorand wallet not linked. Please link your wallet first.');
			} else {
				gameStore.setError(`Failed to initialize game: ${errorMessage}`);
			}
			
			// Don't set cleanupFn if initialization failed
			cleanupFn = null;
		}

		const cleanup = () => {
			// Cleanup - unsubscribe from all events
			unsubscribers.forEach((unsubscribe) => unsubscribe());
			
			// Stop balance polling and destroy engine
			if (engine) {
				console.log('🧹 Destroying engine on unmount');
				engine.destroy();
				engine = null;
			}
		};

		cleanupFn = cleanup;
	}

	// Initialize on mount
	onMount(() => {
		initializeEngine();
	});

	// Re-initialize when session or address becomes available
	$effect(() => {
		const session = $page.data.session || null;
		const hasAddress = algorandAddress || session?.voiAddress;
		
		// If we have address but no engine, try to initialize
		// Don't require session - we can get address from stored keys
		if (hasAddress && !engine && !cleanupFn) {
			console.log('🔄 Address available from props/session, initializing engine...');
			initializeEngine().catch(err => {
				console.error('Failed to initialize engine in effect:', err);
			});
		} else if (!hasAddress && !engine && !cleanupFn) {
			// If no address from props/session, try stored game account keys
			const storedAddress = getFirstStoredVoiAddress();
			if (storedAddress) {
				console.log('🔄 Stored game account address found, initializing engine...');
				initializeEngine().catch(err => {
					console.error('Failed to initialize engine with stored address:', err);
				});
			}
		}
	});

	// Ensure cleanup on component destroy
	onDestroy(() => {
		if (cleanupFn) {
			cleanupFn();
			cleanupFn = null;
		}
		if (engine) {
			console.log('🧹 Destroying engine in onDestroy');
			engine.destroy();
			engine = null;
		}
	});

	/**
	 * Fetch token balance - either ARC200 or native VOI
	 */
	async function fetchTokenBalance() {
		if (!playerAlgorandAddress) return;

		try {
			if (tokenInfo.contractId) {
				// Fetch ARC200 token balance
				const arc200Info = await getArc200TokenInfo(tokenInfo.contractId, playerAlgorandAddress);
				tokenBalance = BigInt(arc200Info.balance || '0');
				// Update game store with the balance in micro units
				gameStore.setBalance(Number(tokenBalance));
				console.log(`💰 ${tokenInfo.symbol} balance:`, tokenBalance.toString());
			} else {
				// Fetch native VOI balance via engine
				if (engine) {
					const voiBalance = await engine.getBalance();
					tokenBalance = BigInt(voiBalance);
				}
			}
		} catch (error) {
			console.error('Failed to fetch token balance:', error);
		}
	}

	/**
	 * Handle spin button click
	 */
	async function handleSpin() {
		if (!engine) {
			console.error('Engine not initialized');
			return;
		}

		try {
			await engine.placeBet(betPerLine, paylines);
		} catch (error) {
			console.error('Failed to place bet:', error);
		}
	}

	/**
	 * Handle auto-spin start
	 */
	function handleAutoSpin(count: number) {
		if (!engine) return;
		engine.startAutoSpin(count);
	}

	/**
	 * Handle auto-spin stop
	 */
	function handleStopAutoSpin() {
		if (!engine) return;
		engine.stopAutoSpin();
	}

	/**
	 * Handle bet amount change
	 */
	function handleBetChange(newBetPerLine: number) {
		gameStore.setBet(newBetPerLine, paylines);
	}

	/**
	 * Handle paylines change
	 */
	function handlePaylinesChange(newPaylines: number) {
		gameStore.setBet(betPerLine, newPaylines);
	}

	/**
	 * Handle win celebration close
	 */
	function handleWinCelebrationClose() {
		gameStore.setWinCelebration(false);
		winningLines = [];
	}

	/**
	 * Handle balance refresh
	 */
	async function handleRefreshBalance() {
		if (isRefreshingBalance) return;

		// If engine not initialized, try to initialize it
		if (!engine) {
			console.log('🔄 Engine not initialized, attempting to initialize...');
			try {
				await initializeEngine();
				// Wait a bit for initialization to complete
				await new Promise(resolve => setTimeout(resolve, 500));
			} catch (error) {
				console.error('Failed to initialize engine on refresh:', error);
				gameStore.setError('Failed to initialize game. Please refresh the page.');
				return;
			}
		}

		if (!engine) {
			gameStore.setError('Game engine not available. Please refresh the page.');
			return;
		}

		try {
			isRefreshingBalance = true;
			await fetchTokenBalance();
		} catch (error) {
			console.error('Failed to refresh balance:', error);
			gameStore.setError('Failed to refresh balance. Please try again.');
		} finally {
			isRefreshingBalance = false;
		}
	}

	/**
	 * Format token balance for display
	 */
	function formatTokenBalance(rawBalance: bigint | number, decimals: number): string {
		const balance = typeof rawBalance === 'bigint' ? rawBalance : BigInt(rawBalance);
		const divisor = BigInt(10 ** decimals);
		const whole = balance / divisor;
		const frac = balance % divisor;
		const fracStr = frac.toString().padStart(decimals, '0').slice(0, 2);
		return `${whole.toLocaleString()}.${fracStr}`;
	}
</script>

<div class="space-y-8 max-w-6xl mx-auto">
	<!-- Header -->
	<div class="flex items-center justify-between">
			<div>
				<h1
					class="text-4xl font-black text-warning-500 dark:text-warning-400 neon-text uppercase flex items-center gap-3"
				>
					<SlotMachineIcon size={48} />
					{gameConfig?.display_name || slotConfig?.displayName || '5-Reel Slots'}
				</h1>
				<p class="text-tertiary mt-2">
					{gameConfig?.description || 'Match 3+ symbols on a payline to win. Provably fair blockchain gaming on Voi.'}
				</p>
			</div>
		<a href="/games">
			<Button variant="ghost" size="sm"> ← Back to Lobby </Button>
		</a>
	</div>

	<!-- Error Display -->
	{#if lastError}
		<div class="p-4 bg-error-500/10 border border-error-500/30 rounded-lg">
			<p class="text-error-500 font-medium">{lastError}</p>
			<button
				onclick={() => gameStore.setError(null)}
				class="mt-2 text-sm text-error-400 hover:text-error-300 underline"
			>
				Dismiss
			</button>
		</div>
	{/if}

	<div class="grid lg:grid-cols-3 gap-6">
		<!-- Main Game Area -->
		<div class="lg:col-span-2 space-y-6">
			<!-- Slot Machine -->
			<Card
				glow
				class="bg-gradient-to-br from-neutral-50 via-neutral-100 to-neutral-50 dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-900"
			>
				<CardContent class="p-6">
					<!-- Reel Grid -->
					<ReelGrid
						{grid}
						{reels}
						isSpinning={isSpinning}
						waitingForOutcome={waitingForOutcome}
						winningLines={winningLines}
						onSpinComplete={() => console.log('Spin animation complete')}
					/>

					<!-- Betting Controls - Below reel display, horizontal -->
					<div class="mt-6">
						<BettingControls
							{betPerLine}
							{paylines}
							disabled={!engine || balance === 0}
							{isSpinning}
							{isAutoSpinning}
							{autoSpinCount}
							onBetChange={handleBetChange}
							onPaylinesChange={handlePaylinesChange}
							onSpin={handleSpin}
							onAutoSpin={handleAutoSpin}
							onStopAutoSpin={handleStopAutoSpin}
						/>
					</div>
				</CardContent>
			</Card>
		</div>

		<!-- Sidebar - Info -->
		<div class="space-y-6">
			<!-- Balance Card -->
			<Card glow>
				<CardHeader>
					<div class="flex items-center justify-between">
						<h3
							class="text-lg font-bold text-warning-500 dark:text-warning-400 uppercase flex items-center gap-2"
						>
							<CoinsIcon size={20} />
							Balance
						</h3>
						<button
							onclick={handleRefreshBalance}
							disabled={!engine || isRefreshingBalance}
							class="text-xs text-warning-500 dark:text-warning-400 hover:text-warning-600 dark:hover:text-warning-300 disabled:text-neutral-600 dark:disabled:text-neutral-500 disabled:cursor-not-allowed transition-colors"
							title="Refresh balance"
						>
							{isRefreshingBalance ? 'Refreshing...' : 'Refresh'}
						</button>
					</div>
				</CardHeader>
				<CardContent>
					<div class="text-center py-4">
						<div class="text-4xl font-black text-warning-500 dark:text-warning-400 mb-2">
							{formatTokenBalance(tokenInfo.contractId ? tokenBalance : balance, tokenInfo.decimals)}
						</div>
						{#if reservedBalance > 0 && !tokenInfo.contractId}
							<div class="text-xs text-neutral-600 dark:text-neutral-500">
								Available: {formatVoi(availableBalance)}
							</div>
						{/if}
						<div class="text-xs text-neutral-600 dark:text-neutral-500 uppercase tracking-wider mt-1">
							{tokenInfo.symbol}
						</div>
					</div>
				</CardContent>
			</Card>

			<!-- Game Info -->
			{#if slotConfig}
				<Card>
					<CardHeader>
						<h3 class="text-lg font-bold text-warning-500 dark:text-warning-400 uppercase">
							Game Info
						</h3>
					</CardHeader>
					<CardContent class="space-y-2 text-sm">
						<div
							class="flex justify-between py-2 border-b border-warning-200 dark:border-warning-900/20"
						>
							<span class="text-tertiary">RTP:</span>
							<span class="text-secondary font-semibold">{slotConfig.rtpTarget}%</span>
						</div>
						<div
							class="flex justify-between py-2 border-b border-warning-200 dark:border-warning-900/20"
						>
							<span class="text-tertiary">House Edge:</span>
							<span class="text-secondary font-semibold">{slotConfig.houseEdge}%</span>
						</div>
						<div
							class="flex justify-between py-2 border-b border-warning-200 dark:border-warning-900/20"
						>
							<span class="text-tertiary">Min Bet:</span>
							<span class="text-secondary font-semibold">{formatTokenBalance(slotConfig.minBet, tokenInfo.decimals)} {tokenInfo.symbol}</span>
						</div>
						<div class="flex justify-between py-2">
							<span class="text-tertiary">Max Payout:</span>
							<span class="text-secondary font-semibold"
								>{slotConfig.paytable.maxPayoutMultiplier}x</span
							>
						</div>
					</CardContent>
				</Card>
			{/if}

			<!-- Paytable Button -->
			{#if slotConfig}
				<Button
					variant="outline"
					size="lg"
					onclick={() => (showPaytableModal = true)}
					class="w-full"
				>
					View Paytable
				</Button>
			{/if}

			<!-- Provably Fair Info -->
			<Card>
				<CardHeader>
					<h3 class="text-lg font-bold text-warning-500 dark:text-warning-400 uppercase">
						Provably Fair
					</h3>
				</CardHeader>
				<CardContent>
					<p class="text-xs text-tertiary mb-3">
						Every spin outcome is determined by Voi blockchain and can be verified on-chain.
					</p>
					{#if playerAlgorandAddress}
						<code
							class="block text-xs font-mono text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-900 p-3 rounded-lg break-all border border-warning-200 dark:border-warning-900/20"
						>
							{playerAlgorandAddress.slice(0, 8)}...{playerAlgorandAddress.slice(-6)}
						</code>
					{/if}
				</CardContent>
			</Card>
		</div>
	</div>
</div>

<!-- Paytable Modal -->
{#if slotConfig}
	<Modal
		isOpen={showPaytableModal}
		onClose={() => (showPaytableModal = false)}
		title="Paytable"
		size="lg"
	>
		<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
			{#each slotConfig.paytable.symbols as symbolConfig}
				<div
					class="p-4 border border-warning-200 dark:border-warning-900/20 rounded-lg text-center"
				>
					<div class="text-2xl mb-2 font-bold">{symbolConfig.displayName}</div>
					<div class="text-xs text-tertiary space-y-1">
						<div>3x: {symbolConfig.match3}x</div>
						<div>4x: {symbolConfig.match4}x</div>
						<div>5x: {symbolConfig.match5}x</div>
					</div>
				</div>
			{/each}
		</div>
	</Modal>
{/if}

<!-- Win Celebration Overlay -->
<WinDisplay
	show={showingWinCelebration}
	{winAmount}
	{totalBet}
	{winLevel}
	onClose={handleWinCelebrationClose}
/>

<style>
	.neon-text {
		text-shadow:
			0 0 10px currentColor,
			0 0 20px currentColor,
			0 0 30px currentColor;
	}
</style>
