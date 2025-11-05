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
	import { VoiSlotMachineAdapter } from '$lib/game-engine/adapters/VoiSlotMachineAdapter';
	import { gameStore } from '$lib/game-engine/stores/gameStore.svelte';
	import { detectWinningPaylines, calculateTotalWinnings } from '$lib/game-engine/utils/winDetection';
	import { formatVoi, GAME_DEFAULTS } from '$lib/game-engine/utils/gameConstants';
	import { getWinLevel } from '$lib/game-engine/types/results';
	import { SpinStatus, GameEventType } from '$lib/game-engine/types';

	// Wallet signing
	import { CdpAlgorandSigner } from '$lib/wallet/CdpAlgorandSigner';
	import { getInitializedCdp } from '$lib/auth/cdpClient';
	import { deriveAlgorandAddressFromEVM } from '$lib/chains/algorand-derive';

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
	let reels = $state<any>(null);
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
	onMount(async () => {
		// Clean up any existing engine first
		if (engine) {
			console.log('🧹 Cleaning up existing engine before creating new one');
			engine.destroy();
			engine = null;
		}

		// Clean up any existing cleanup function
		if (cleanupFn) {
			cleanupFn();
			cleanupFn = null;
		}

		const unsubscribers: Array<() => void> = [];

		try {
			// Initialize CDP and create signer
			console.log('🔐 Initializing CDP wallet signer...');
			const cdpSdk = await getInitializedCdp();

			const session = $page.data.session;

			if (!session?.cdpUserId) {
				gameStore.setError('Coinbase wallet not linked. Please sign in with your CDP wallet to play.');
				return;
			}

			let baseWalletAddress: string | null = session.baseWalletAddress ?? null;
			playerAlgorandAddress = null;

			const candidateAccounts = new Set<string>();

			const addCandidate = (value?: string | null) => {
				if (typeof value !== 'string' || value.length === 0) return;
				candidateAccounts.add(value);
				const lower = value.toLowerCase();
				if (lower !== value) candidateAccounts.add(lower);
			};

			addCandidate(baseWalletAddress);

			try {
				const currentUser = await cdpSdk.getCurrentUser();
				const userAccounts: Array<string | undefined> = [
					...(Array.isArray((currentUser as { evmAccounts?: string[] }).evmAccounts)
						? (currentUser as { evmAccounts: string[] }).evmAccounts
						: []),
					...(Array.isArray((currentUser as { evmSmartAccounts?: string[] }).evmSmartAccounts)
						? (currentUser as { evmSmartAccounts: string[] }).evmSmartAccounts
						: []),
					(currentUser as { walletAddress?: string }).walletAddress,
				];

				for (const account of userAccounts) {
					addCandidate(account ?? null);
				}
			} catch (lookupError) {
				console.warn('Failed to enumerate CDP user accounts:', lookupError);
			}

			if (candidateAccounts.size === 0) {
				throw new Error('No Coinbase EVM accounts available for this session.');
			}

			let exportedPrivateKey: string | null = null;

			for (const candidate of candidateAccounts) {
				const formatted =
					candidate.startsWith('0x')
						? (candidate as `0x${string}`)
						: (`0x${candidate.replace(/^0x/, '')}` as `0x${string}`);

				try {
					const { privateKey } = await cdpSdk.exportEvmAccount({
						evmAccount: formatted,
					});

					if (privateKey) {
						exportedPrivateKey = privateKey;
						baseWalletAddress = formatted;
						break;
					}
				} catch (exportError) {
					console.warn('CDP key export failed for candidate', candidate, exportError);
				}
			}

			if (!exportedPrivateKey || !baseWalletAddress) {
				throw new Error('Failed to export Base private key from CDP wallet.');
			}

			// Use the address passed from the server (derived from CDP and stored in session)
			// We still need to derive it here to verify consistency, but we trust the session value
			const derivedAddress = deriveAlgorandAddressFromEVM(exportedPrivateKey);

			// Best-effort cleanup of exported key material
			exportedPrivateKey = null;

			// Use the algorandAddress from props (from server session) if available
			playerAlgorandAddress = algorandAddress || derivedAddress;

			if (!playerAlgorandAddress) {
				gameStore.setError(
					'Voi address not available. Please refresh the page to establish your session.'
				);
				return;
			}

			// Log a warning if the server-provided address doesn't match what we derived
			if (algorandAddress && algorandAddress !== derivedAddress) {
				console.warn('⚠️ Server Voi address mismatch! Server:', algorandAddress, 'Derived:', derivedAddress);
			}

			if (!baseWalletAddress) {
				gameStore.setError('Unable to access your Base wallet. Please refresh and try again.');
				return;
			}

			if (!baseWalletAddress.startsWith('0x')) {
				baseWalletAddress = `0x${baseWalletAddress.replace(/^0x/, '')}`;
			}

			const signer = new CdpAlgorandSigner(
				cdpSdk,
				baseWalletAddress,
				playerAlgorandAddress!
			);

			console.log('✅ CDP signer created for address:', playerAlgorandAddress);

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
		return cleanup;
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
		if (!engine || isRefreshingBalance) return;

		try {
			isRefreshingBalance = true;
			await engine.getBalance();
		} catch (error) {
			console.error('Failed to refresh balance:', error);
			gameStore.setError('Failed to refresh balance. Please try again.');
		} finally {
			isRefreshingBalance = false;
		}
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
