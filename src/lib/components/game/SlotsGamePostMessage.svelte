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
		SpinQueueMessage,
		QueuedSpinItem,
	} from '$lib/game-engine/bridge/types';
	import { MESSAGE_NAMESPACE } from '$lib/game-engine/bridge/types';

	import { onMount, onDestroy } from 'svelte';

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
	let betPerLine = $state(1); // 1 VOI (normalized)
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

	// Spin queue state (synced from bridge via postMessage)
	interface LocalQueuedSpin {
		clientSpinId: string;
		engineSpinId?: string;
		betAmount: number;
		paylines?: number;
		betPerLine?: number;
		timestamp: number;
		status: 'pending' | 'submitted' | 'completed' | 'failed';
		outcome?: {
			winnings: number;
			isWin: boolean;
			winLevel?: string;
			winningLines?: any[];
		};
		error?: string;
	}
	let spinQueue = $state<LocalQueuedSpin[]>([]);
	let pendingSpins = $derived(spinQueue.filter(s => s.status === 'pending' || s.status === 'submitted').length);

	// Message handler
	let messageHandler: ((event: MessageEvent) => void) | null = null;

	onMount(() => {
		// Set up postMessage listener
		messageHandler = (event: MessageEvent) => {
			// In production, validate origin
			// if (event.origin !== 'https://houseofvoi.com') return;

			const message = event.data;

			// Filter messages by namespace (silently ignore non-matching messages)
			if (!message || typeof message !== 'object' || !('namespace' in message)) {
				console.debug('SlotsGame: Ignoring message without namespace field');
				return;
			}

			if (message.namespace !== MESSAGE_NAMESPACE) {
				console.debug(
					`SlotsGame: Ignoring message with non-matching namespace: "${message.namespace}"`
				);
				return;
			}

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
				case 'SPIN_QUEUE':
					handleSpinQueue(message as SpinQueueMessage);
					break;
			}
		};

		window.addEventListener('message', messageHandler);

		// Initialize connection - request balance, config, and spin queue
		sendMessage({ type: 'INIT' });
		sendMessage({ type: 'GET_BALANCE' });
		sendMessage({ type: 'GET_CONFIG' });
		sendMessage({ type: 'GET_SPIN_QUEUE' } as any);
	});

	onDestroy(() => {
		if (messageHandler) {
			window.removeEventListener('message', messageHandler);
			messageHandler = null;
		}
	});

	/**
	 * Send message to parent (bridge) or same window
	 */
	function sendMessage(message: GameRequest): void {
		const messageWithNamespace = {
			...message,
			namespace: MESSAGE_NAMESPACE,
		};

		// Check if we're in an iframe
		const isInIframe = window !== window.parent;

		if (isInIframe) {
			// If in iframe, send to parent
			window.parent.postMessage(messageWithNamespace, '*');
		} else {
			// If not in iframe, send to same window (for GameBridge on same page)
			window.postMessage(messageWithNamespace, '*');
		}
	}

	/**
	 * Exit game and return to lobby
	 */
	function handleExit(): void {
		// Check if we're in an iframe
		const isInIframe = window !== window.parent;

		if (isInIframe) {
			// If in iframe, send EXIT message to parent
			sendMessage({ type: 'EXIT' } as any);
		} else {
			// If not in iframe (running as main page), navigate directly
			window.location.href = '/games';
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
	 * Handle spin queue message from bridge
	 * Syncs the local spin queue state with the authoritative queue from the bridge
	 */
	function handleSpinQueue(message: SpinQueueMessage): void {
		const payload = message.payload;
		console.log('📋 Spin queue update received:', payload);

		// Convert bridge queue items to local queue format
		const bridgeQueue = payload.queue || [];

		// Update local spin queue with bridge data
		spinQueue = bridgeQueue.map((item: QueuedSpinItem) => ({
			clientSpinId: item.clientSpinId || item.spinId,
			engineSpinId: item.spinId,
			betAmount: item.betAmount,
			paylines: item.paylines,
			betPerLine: item.betPerLine,
			timestamp: item.timestamp,
			status: item.status,
			outcome: item.outcome ? {
				winnings: item.outcome.winnings,
				isWin: item.outcome.isWin,
				winLevel: item.outcome.winLevel,
				winningLines: item.outcome.winningLines,
			} : undefined,
			error: item.error,
		}));

		// Update spinning state based on queue
		const hasPending = spinQueue.some(s => s.status === 'pending' || s.status === 'submitted');
		if (hasPending && !isSpinning) {
			isSpinning = true;
			waitingForOutcome = true;
		} else if (!hasPending && isSpinning) {
			// Don't clear spinning state here - let OUTCOME message handle it
		}
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

<div class="slots-game-container">
	<!-- Game Header -->
	<div class="game-header">
		<div class="game-title">5-Reel Slots</div>
		<button class="exit-button" onclick={handleExit} aria-label="Exit game">
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="18" y1="6" x2="6" y2="18"></line>
				<line x1="6" y1="6" x2="18" y2="18"></line>
			</svg>
		</button>
	</div>

	<div class="game-content">

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
								{(availableBalance || 0).toFixed(2)}
							</span>
						</div>
						<div class="flex justify-between text-sm">
							<span class="text-tertiary">Total:</span>
							<span class="text-neutral-600 dark:text-neutral-400">
								{(balance || 0).toFixed(2)}
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
								{betPerLine.toFixed(2)}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-tertiary">Paylines:</span>
							<span class="text-neutral-950 dark:text-white font-medium">{paylines}</span>
						</div>
						<div class="flex justify-between border-t border-neutral-200 dark:border-neutral-700 pt-2 mt-2">
							<span class="text-tertiary font-semibold">Total:</span>
							<span class="text-warning-500 dark:text-warning-400 font-bold">
								{totalBet.toFixed(2)}
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
</div>

<style>
	.slots-game-container {
		@apply h-screen overflow-auto bg-gradient-to-br from-neutral-50 via-white to-neutral-50;
		@apply dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-900;
		@apply flex flex-col;
	}

	.game-header {
		@apply flex items-center justify-between px-4 md:px-6 py-3 bg-neutral-100/80 dark:bg-neutral-800/80;
		@apply border-b border-neutral-200 dark:border-neutral-700 backdrop-blur-sm;
		@apply sticky top-0 z-50;
	}

	.game-title {
		@apply text-lg md:text-xl font-bold text-neutral-800 dark:text-neutral-100;
	}

	.exit-button {
		@apply p-2 rounded-lg text-neutral-600 dark:text-neutral-400;
		@apply hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-100;
		@apply transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500;
	}

	.game-content {
		@apply space-y-6 max-w-6xl mx-auto p-4 flex-1 overflow-auto;
	}
</style>

