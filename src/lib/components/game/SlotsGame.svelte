<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { SlotMachineIcon, CoinsIcon } from '$lib/components/icons';

	// New game components
	import ReelGrid from './ReelGrid.svelte';
	import BettingControls from './BettingControls.svelte';
	import WinDisplay from './WinDisplay.svelte';

	// Game engine
	import { SlotMachineEngine } from '$lib/game-engine/SlotMachineEngine';
	import { VoiSlotMachineAdapter } from '$lib/game-engine/adapters/VoiSlotMachineAdapter';
	import { gameStore } from '$lib/game-engine/stores/gameStore.svelte';
	import { detectWinningPaylines, calculateTotalWinnings } from '$lib/game-engine/utils/winDetection';
	import { formatVoi, GAME_DEFAULTS } from '$lib/game-engine/utils/gameConstants';
	import { getWinLevel } from '$lib/game-engine/types/results';
	import { SpinStatus, GameEventType } from '$lib/game-engine/types';

	// Wallet signing
	import { CdpAlgorandSigner } from '$lib/wallet/CdpAlgorandSigner';
	import { getInitializedCdp } from '$lib/auth/cdpClient';

	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	interface Props {
		contractId?: bigint;
		algorandAddress?: string | null;
	}

	let { contractId = 1234n, algorandAddress }: Props = $props();

	// Game state from store
	let grid = $derived(gameStore.visibleGrid);
	let balance = $derived(gameStore.balance);
	let reservedBalance = $derived(gameStore.reservedBalance);
	let isSpinning = $derived(gameStore.isSpinning);
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
	let reels = $state<any>(null);
	let winAmount = $state(0);
	let winLevel = $state<any>('small');
	let winningLines = $state<any>([]);

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
	onMount(async () => {
		const unsubscribers: Array<() => void> = [];

		try {
			// Check for Algorand address
			if (!algorandAddress) {
				gameStore.setError(
					'Algorand wallet not linked. Please link your wallet in settings first.'
				);
				return;
			}

			// Initialize CDP and create signer
			console.log('🔐 Initializing CDP wallet signer...');
			const cdpSdk = await getInitializedCdp();

			// Get session data and fall back to CDP user info when missing
			const session = $page.data.session;
			let baseWalletAddress = session?.baseWalletAddress;

			if (!baseWalletAddress) {
				try {
					const currentUser = await cdpSdk.getCurrentUser();
					const fallbackAddress =
						(Array.isArray((currentUser as { evmAccounts?: string[] }).evmAccounts)
							? (currentUser as { evmAccounts: string[] }).evmAccounts[0]
							: undefined) ||
						(currentUser as { walletAddress?: string }).walletAddress;

					baseWalletAddress = fallbackAddress?.toLowerCase();
				} catch (cdpError) {
					console.error('Failed to fetch wallet address from CDP user session:', cdpError);
				}
			}

			if (!baseWalletAddress) {
				gameStore.setError('Unable to access your Base wallet. Please refresh and try again.');
				return;
			}

			const signer = new CdpAlgorandSigner(
				cdpSdk,
				baseWalletAddress,
				algorandAddress
			);

			console.log('✅ CDP signer created for address:', algorandAddress);

			// Create Voi adapter with wallet signer
			const adapter = new VoiSlotMachineAdapter({
				contractId,
				network: 'mainnet',
				walletSigner: signer
			});

			// Create engine
			engine = new SlotMachineEngine({ walletAddress: algorandAddress }, adapter);

			// Listen to game events using specific callbacks
			unsubscribers.push(
				engine.onOutcome((result) => {
					console.log('🎰 Spin completed:', result);

					// Show win celebration if there are winnings
					if (result.winnings > 0) {
						winAmount = result.winnings;
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
			await engine.initialize();

			// Get slot config
			slotConfig = await adapter.getContractConfig();
			reels = slotConfig.reelConfig.reels;

			console.log('✅ SlotsGame mounted and initialized');
		} catch (error) {
			console.error('Failed to initialize game:', error);
			const errorMessage = error instanceof Error ? error.message : 'Failed to initialize game';

			// Provide user-friendly error messages
			if (errorMessage.includes('CDP') || errorMessage.includes('wallet')) {
				gameStore.setError('Wallet connection failed. Please refresh and try again.');
			} else if (errorMessage.includes('not linked')) {
				gameStore.setError('Algorand wallet not linked. Please link your wallet first.');
			} else {
				gameStore.setError(errorMessage);
			}
		}

		return () => {
			// Cleanup - unsubscribe from all events
			unsubscribers.forEach((unsubscribe) => unsubscribe());
		};
	});

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
</script>

<div class="space-y-8 max-w-6xl mx-auto">
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
						winningLines={winningLines}
						onSpinComplete={() => console.log('Spin animation complete')}
					/>

					<!-- Queue Status -->
					{#if pendingSpins > 0}
						<div class="mt-4 text-center">
							<p class="text-sm text-tertiary">
								{pendingSpins} spin{pendingSpins > 1 ? 's' : ''} pending...
							</p>
						</div>
					{/if}
				</CardContent>
			</Card>

			<!-- Paytable -->
			{#if slotConfig}
				<Card>
					<CardHeader>
						<h3 class="text-xl font-bold text-warning-500 dark:text-warning-400 uppercase">
							Paytable
						</h3>
					</CardHeader>
					<CardContent>
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
					</CardContent>
				</Card>
			{/if}
		</div>

		<!-- Sidebar - Controls & Info -->
		<div class="space-y-6">
			<!-- Balance Card -->
			<Card glow>
				<CardHeader>
					<h3
						class="text-lg font-bold text-warning-500 dark:text-warning-400 uppercase flex items-center gap-2"
					>
						<CoinsIcon size={20} />
						Balance
					</h3>
				</CardHeader>
				<CardContent>
					<div class="text-center py-4">
						<div class="text-4xl font-black text-warning-500 dark:text-warning-400 mb-2">
							{formatVoi(balance)}
						</div>
						{#if reservedBalance > 0}
							<div class="text-xs text-neutral-600 dark:text-neutral-500">
								Available: {formatVoi(availableBalance)}
							</div>
						{/if}
						<div class="text-xs text-neutral-600 dark:text-neutral-500 uppercase tracking-wider mt-1">
							VOI Network
						</div>
					</div>
				</CardContent>
			</Card>

			<!-- Betting Controls -->
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
							<span class="text-secondary font-semibold">{formatVoi(slotConfig.minBet)}</span>
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
					{#if algorandAddress}
						<code
							class="block text-xs font-mono text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-900 p-3 rounded-lg break-all border border-warning-200 dark:border-warning-900/20"
						>
							{algorandAddress.slice(0, 8)}...{algorandAddress.slice(-6)}
						</code>
					{/if}
				</CardContent>
			</Card>
		</div>
	</div>
</div>

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
