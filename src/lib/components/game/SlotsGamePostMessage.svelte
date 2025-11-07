<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { SlotMachineIcon, CoinsIcon } from '$lib/components/icons';

	// Game components
	import ReelGrid from './ReelGrid.svelte';
	import BettingControls from './BettingControls.svelte';
	import WinDisplay from './WinDisplay.svelte';

	// PostMessage types
	import type {
		GameRequest,
		GameResponse,
		OutcomeMessage,
		BalanceUpdateMessage,
		ErrorMessage,
		ConfigMessage,
		BalanceResponse,
		SpinSubmittedMessage,
	} from '$lib/game-engine/bridge/types';

	import { onMount, onDestroy } from 'svelte';
	import { formatVoi } from '$lib/game-engine/utils/gameConstants';

	// Default symbols for initial grid
	const DEFAULT_SYMBOLS: string[] = ['A', 'B', 'C', 'D', '_'];
	
	// Generate initial grid with default symbols (not blanks)
	function generateInitialGrid(): string[][] {
		return Array(5).fill(null).map(() =>
			Array(3).fill(null).map((_, i) => DEFAULT_SYMBOLS[i % DEFAULT_SYMBOLS.length])
		);
	}

	// Game state (managed via postMessage)
	let grid = $state<string[][]>(generateInitialGrid());
	let balance = $state(0);
	let availableBalance = $state(0);
	let isSpinning = $state(false);
	let waitingForOutcome = $state(false);
	let betPerLine = $state(1_000_000); // 1 VOI
	let paylines = $state(20);
	let totalBet = $derived(betPerLine * paylines);
	let lastError = $state<string | null>(null);
	let showingWinCelebration = $state(false);
	let winAmount = $state(0);
	let winLevel = $state<'small' | 'medium' | 'large' | 'jackpot'>('small');
	let winningLines = $state<any[]>([]);
	let showPaytableModal = $state(false);
	let isRefreshingBalance = $state(false);
	let reels = $state<any>(null);
	let slotConfig = $state<any>(null);
	let pendingSpinId: string | null = $state(null);

	// Message handler
	let messageHandler: ((event: MessageEvent) => void) | null = null;

	onMount(() => {
		// Set up postMessage listener
		messageHandler = (event: MessageEvent) => {
			// In production, validate origin
			// if (event.origin !== 'https://houseofvoi.com') return;

			const message = event.data as GameResponse;

			switch (message.type) {
				case 'OUTCOME':
					handleOutcome(message);
					break;
				case 'BALANCE_UPDATE':
					handleBalanceUpdate(message);
					break;
				case 'BALANCE_RESPONSE':
					handleBalanceResponse(message);
					break;
				case 'CONFIG':
					handleConfig(message);
					break;
				case 'ERROR':
					handleError(message);
					break;
				case 'SPIN_SUBMITTED':
					handleSpinSubmitted(message);
					break;
			}
		};

		window.addEventListener('message', messageHandler);

		// Initialize connection - request balance and config
		sendMessage({ type: 'INIT' });
		sendMessage({ type: 'GET_BALANCE' });
		sendMessage({ type: 'GET_CONFIG' });
	});

	onDestroy(() => {
		if (messageHandler) {
			window.removeEventListener('message', messageHandler);
			messageHandler = null;
		}
	});

	/**
	 * Send message to parent (bridge)
	 */
	function sendMessage(message: GameRequest): void {
		if (window.parent) {
			window.parent.postMessage(message, '*'); // Use specific origin in production
		}
	}

	/**
	 * Handle outcome message
	 */
	function handleOutcome(message: OutcomeMessage): void {
		const payload = message.payload;
		
		console.log('🎰 Outcome received:', payload);

		// Update grid
		grid = payload.grid;
		waitingForOutcome = false;
		isSpinning = false;
		pendingSpinId = null;

		// Update balance (will be updated via BALANCE_UPDATE, but set here for immediate feedback)
		if (payload.winnings > 0) {
			winAmount = payload.winnings;
			winLevel = payload.winLevel;
			winningLines = payload.winningLines;
			showingWinCelebration = true;
		} else {
			showingWinCelebration = false;
		}
	}

	/**
	 * Handle balance update
	 */
	function handleBalanceUpdate(message: BalanceUpdateMessage): void {
		const payload = message.payload;
		balance = Number(payload.balance) || 0;
		availableBalance = Number(payload.availableBalance) || 0;
	}

	/**
	 * Handle balance response
	 */
	function handleBalanceResponse(message: BalanceResponse): void {
		const payload = message.payload;
		balance = Number(payload.balance) || 0;
		availableBalance = Number(payload.availableBalance) || 0;
		isRefreshingBalance = false;
	}

	/**
	 * Handle config message
	 */
	function handleConfig(message: ConfigMessage): void {
		const payload = message.payload;
		slotConfig = {
			minBet: payload.minBet,
			maxBet: payload.maxBet,
			maxPaylines: payload.maxPaylines,
			rtpTarget: payload.rtpTarget,
			houseEdge: payload.houseEdge,
		};
	}

	/**
	 * Handle error message
	 */
	function handleError(message: ErrorMessage): void {
		const payload = message.payload;
		lastError = payload.message;
		isSpinning = false;
		waitingForOutcome = false;
		pendingSpinId = null;
		isRefreshingBalance = false;

		console.error('❌ Game error:', payload);
	}

	/**
	 * Handle spin submitted
	 */
	function handleSpinSubmitted(message: SpinSubmittedMessage): void {
		const payload = message.payload;
		pendingSpinId = payload.spinId;
		// Animation already started in handleSpin(), just confirm we're waiting
		// (waitingForOutcome is already true from handleSpin)
		console.log('📤 Spin submitted:', payload.spinId);
	}

	/**
	 * Handle spin button click
	 */
	function handleSpin(): void {
		// Don't allow multiple simultaneous spins
		if (isSpinning) {
			return;
		}

		// Start animation immediately (don't wait for transaction)
		isSpinning = true;
		waitingForOutcome = true; // Start animation immediately
		lastError = null;

		// Send spin request (backend will validate balance)
		sendMessage({
			type: 'SPIN_REQUEST',
			payload: {
				paylines,
				betPerLine,
				spinId: `spin-${Date.now()}`,
			},
		});
	}

	/**
	 * Handle auto-spin (not supported in postMessage mode yet)
	 */
	function handleAutoSpin(count: number): void {
		// Auto-spin not yet supported via postMessage
		console.warn('Auto-spin not yet supported in postMessage mode');
	}

	/**
	 * Handle auto-spin stop
	 */
	function handleStopAutoSpin(): void {
		// Auto-spin not supported
	}

	/**
	 * Handle bet amount change
	 */
	function handleBetChange(newBetPerLine: number): void {
		betPerLine = newBetPerLine;
	}

	/**
	 * Handle paylines change
	 */
	function handlePaylinesChange(newPaylines: number): void {
		paylines = newPaylines;
	}

	/**
	 * Handle win celebration close
	 */
	function handleWinCelebrationClose(): void {
		showingWinCelebration = false;
		winningLines = [];
	}

	/**
	 * Handle balance refresh
	 */
	function handleRefreshBalance(): void {
		if (isRefreshingBalance) return;

		isRefreshingBalance = true;
		sendMessage({ type: 'GET_BALANCE' });
	}

	// Note: Config and balance are requested in the main onMount above
</script>

<div class="space-y-6 max-w-6xl mx-auto p-4">
	<!-- Header - Hidden in iframe mode -->
	<div class="flex items-center justify-between" style="display: none;">
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
			<p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
				(postMessage Mode - E2E Test)
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
				onclick={() => (lastError = null)}
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
						{winningLines}
						onSpinComplete={() => console.log('Spin animation complete')}
					/>

					<!-- Betting Controls -->
					<div class="mt-6">
						<BettingControls
							{betPerLine}
							{paylines}
							disabled={balance === 0}
							{isSpinning}
							isAutoSpinning={false}
							autoSpinCount={0}
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
							disabled={isRefreshingBalance}
							class="text-xs text-warning-500 dark:text-warning-400 hover:text-warning-600 dark:hover:text-warning-300 disabled:text-neutral-600 dark:disabled:text-neutral-500 disabled:cursor-not-allowed transition-colors"
							title="Refresh balance"
						>
							{isRefreshingBalance ? 'Refreshing...' : 'Refresh'}
						</button>
					</div>
				</CardHeader>
				<CardContent>
					<div class="space-y-2">
						<div class="flex justify-between">
							<span class="text-tertiary">Available:</span>
							<span class="text-warning-500 dark:text-warning-400 font-bold">
								{formatVoi(availableBalance || 0)}
							</span>
						</div>
						<div class="flex justify-between text-sm">
							<span class="text-tertiary">Total:</span>
							<span class="text-neutral-600 dark:text-neutral-400">
								{formatVoi(balance || 0)}
							</span>
						</div>
					</div>
				</CardContent>
			</Card>

			<!-- Bet Info Card -->
			<Card>
				<CardHeader>
					<h3 class="text-lg font-semibold text-neutral-950 dark:text-white">Current Bet</h3>
				</CardHeader>
				<CardContent>
					<div class="space-y-2">
						<div class="flex justify-between">
							<span class="text-tertiary">Per Line:</span>
							<span class="text-neutral-950 dark:text-white font-medium">
								{formatVoi(betPerLine)}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-tertiary">Paylines:</span>
							<span class="text-neutral-950 dark:text-white font-medium">{paylines}</span>
						</div>
						<div class="flex justify-between border-t border-neutral-200 dark:border-neutral-700 pt-2 mt-2">
							<span class="text-tertiary font-semibold">Total:</span>
							<span class="text-warning-500 dark:text-warning-400 font-bold">
								{formatVoi(totalBet)}
							</span>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	</div>

	<!-- Win Celebration Modal -->
	<WinDisplay
		show={showingWinCelebration}
		{winAmount}
		{totalBet}
		{winLevel}
		onClose={handleWinCelebrationClose}
	/>
</div>

