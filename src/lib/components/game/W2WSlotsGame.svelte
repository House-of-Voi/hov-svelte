<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { SlotMachineIcon, CoinsIcon } from '$lib/components/icons';

	// W2W game components
	import ReelGrid from './ReelGrid.svelte';
	import W2WBettingControls from './W2WBettingControls.svelte';
	import W2WWinDisplay from './W2WWinDisplay.svelte';
	import W2WModeSelector from './W2WModeSelector.svelte';

	// Game engine
	import { SlotMachineEngine } from '$lib/game-engine/SlotMachineEngine';
	import { VoiW2WAdapter } from '$lib/game-engine/adapters/VoiW2WAdapter';
	import { gameStore } from '$lib/game-engine/stores/gameStore.svelte';
	import { machineService } from '$lib/services/machineService';
	import { getArc200TokenInfo } from '$lib/voi/arc200';
	import { formatVoi } from '$lib/game-engine/utils/gameConstants';
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
	let betAmount = $derived(gameStore.currentBet.betAmount || 40);
	let mode = $derived(gameStore.currentBet.mode || 1);
	let totalBet = $derived(gameStore.currentBet.totalBet || 40);
	let spinQueue = $derived(gameStore.spinQueue);
	let lastError = $derived(gameStore.lastError);

	// Local state
	let engine: SlotMachineEngine | null = $state(null);
	let slotConfig = $state<any>(null);
	let gameConfig = $state<{ display_name: string; description: string | null; treasury_asset_id?: number } | null>(null);
	let winAmount = $state(0);

	// Token info for the machine's betting currency
	let tokenInfo = $state<{ symbol: string; decimals: number; contractId: number | null }>({
		symbol: 'VOI',
		decimals: 6,
		contractId: null
	});
	let tokenBalance = $state<bigint>(0n);
	let winLevel = $state<any>('none');
	let waysWins = $state<any[]>([]);
	let bonusSpinsAwarded = $state(0);
	let jackpotHit = $state(false);
	let jackpotAmount = $state(0);
	let credits = $state(0);
	let bonusSpins = $state(0);
	let modeEnabled = $state(7); // Default: all modes enabled
	let baseBet = $state(40); // Base bet from contract (defaults to 40)
	let kickerAmount = $state(20); // Kicker amount from contract (defaults to 20)
	let cleanupFn: (() => void) | null = $state(null);
	let showWinDisplay = $state(false);
	let isRefreshingBalance = $state(false);
	let isHandlingSpin = $state(false);

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
		if (engine || cleanupFn) {
			console.log('⏭️ Engine already initialized or initializing, skipping');
			return;
		}

		console.log('🚀 Starting W2W engine initialization...');

		const unsubscribers: Array<() => void> = [];

		try {
			// Initialize signer using stored keys
			console.log('🔐 Initializing wallet signer from stored keys...');

			const session = $page.data.session || null;
			playerAlgorandAddress = algorandAddress || null;

			if (!playerAlgorandAddress && session?.voiAddress) {
				playerAlgorandAddress = session.voiAddress;
			}

			if (!playerAlgorandAddress) {
				const storedAddress = getFirstStoredVoiAddress();
				if (storedAddress) {
					playerAlgorandAddress = storedAddress;
				}
			}

			if (!playerAlgorandAddress) {
				throw new Error('No wallet address available');
			}

			console.log('✅ Wallet address:', playerAlgorandAddress);

			// Create signer
			const signer = new StoredKeySigner(playerAlgorandAddress);

			// Fetch machine config
			const config = await machineService.getMachineByContractId(contractId);
			if (config) {
				gameConfig = {
					display_name: config.display_name,
					description: config.description,
					treasury_asset_id: config.treasury_asset_id
				};

				// If machine has a treasury_asset_id, it uses an ARC200 token
				if (config.treasury_asset_id) {
					try {
						const arc200Info = await getArc200TokenInfo(config.treasury_asset_id);
						tokenInfo = {
							symbol: arc200Info.symbol || 'TOKEN',
							decimals: arc200Info.decimals || 6,
							contractId: config.treasury_asset_id
						};
						console.log('🪙 W2W Machine uses ARC200 token:', tokenInfo.symbol);
					} catch (err) {
						console.error('Failed to fetch ARC200 token info:', err);
					}
				} else {
					tokenInfo = { symbol: 'VOI', decimals: 6, contractId: null };
				}
			}

			// Create W2W adapter
			const adapter = new VoiW2WAdapter({
				contractId,
				walletSigner: signer,
				network: 'mainnet'
			});

			// Create engine
			engine = new SlotMachineEngine(
				{ walletAddress: playerAlgorandAddress },
				adapter
			);
			
			// Store adapter reference for later use
			const engineAdapter = adapter;

			// Set up event listeners
			const unsubscribeOutcome = engine.onOutcome((result) => {
				console.log('🎰 Outcome received:', result);
				// Convert winnings from microVOI to VOI for display
				winAmount = result.winnings / 1_000_000;
				winLevel = result.winLevel;
				waysWins = result.outcome.waysWins || [];
				bonusSpinsAwarded = result.outcome.bonusSpinsAwarded || 0;
				jackpotHit = result.outcome.jackpotHit || false;
				jackpotAmount = result.outcome.jackpotAmount ? result.outcome.jackpotAmount / 1_000_000 : 0;
				
				if (result.isWin || bonusSpinsAwarded > 0 || jackpotHit) {
					showWinDisplay = true;
				}

				// Refresh user data after every spin completion (not just wins)
				refreshUserData();
			});

			unsubscribers.push(unsubscribeOutcome);

			// Listen for spin submission to refresh bonus spins immediately
			const unsubscribeSpinSubmitted = engine.onSpinSubmitted((spinId, txId) => {
				console.log('📤 Spin submitted:', spinId, txId);
				// Refresh user data after spin submission to immediately reflect consumed bonus spins
				refreshUserData();
			});

			unsubscribers.push(unsubscribeSpinSubmitted);

			// Initialize engine
			await engine.initialize();

			// Load initial balance, user data, and machine state
			await fetchTokenBalance();
			await refreshUserData();
			
			// Fetch modeEnabled and bet costs from machine state
			if (engineAdapter.getMachineState) {
				try {
					const machineState = await engineAdapter.getMachineState();
					if (machineState) {
						// Get mode enabled
						if (machineState.mode_enabled !== undefined) {
							modeEnabled = Number(machineState.mode_enabled);
						}

						// Determine bet costs based on enabled modes
						// If token mode is enabled (mode_enabled & 4) and network is not, use token costs
						// Otherwise use network costs
						const isTokenMode = (modeEnabled & 4) !== 0;
						const isNetworkMode = (modeEnabled & 2) !== 0;

						if (isTokenMode && !isNetworkMode) {
							// Token-only mode: use token_base_bet_cost and token_kicker_extra
							if (machineState.token_base_bet_cost) {
								baseBet = Number(machineState.token_base_bet_cost) / 1_000_000;
							}
							if (machineState.token_kicker_extra) {
								kickerAmount = Number(machineState.token_kicker_extra) / 1_000_000;
							}
						} else if (isNetworkMode) {
							// Network mode (or mixed mode): use network_base_bet_cost and network_kicker_extra
							if (machineState.network_base_bet_cost) {
								baseBet = Number(machineState.network_base_bet_cost) / 1_000_000;
							}
							if (machineState.network_kicker_extra) {
								kickerAmount = Number(machineState.network_kicker_extra) / 1_000_000;
							}
						} else if (isTokenMode) {
							// Token mode available but network is also available - prefer network for consistency
							if (machineState.network_base_bet_cost) {
								baseBet = Number(machineState.network_base_bet_cost) / 1_000_000;
							} else if (machineState.token_base_bet_cost) {
								baseBet = Number(machineState.token_base_bet_cost) / 1_000_000;
							}
							if (machineState.network_kicker_extra) {
								kickerAmount = Number(machineState.network_kicker_extra) / 1_000_000;
							} else if (machineState.token_kicker_extra) {
								kickerAmount = Number(machineState.token_kicker_extra) / 1_000_000;
							}
						}

						console.log('💰 Machine bet costs:', { baseBet, kickerAmount, modeEnabled });
					}
				} catch (error) {
					console.warn('Failed to fetch machine state, using defaults:', error);
				}
			}

			console.log('✅ W2W SlotsGame mounted and initialized');
		} catch (error) {
			console.error('❌ Failed to initialize W2W game:', error);
			const errorMessage = error instanceof Error ? error.message : 'Failed to initialize game';
			gameStore.setError(`Failed to initialize game: ${errorMessage}`);
			cleanupFn = null;
		}

		const cleanup = () => {
			unsubscribers.forEach((unsubscribe) => unsubscribe());
			if (engine) {
				console.log('🧹 Destroying engine on unmount');
				engine.destroy();
				engine = null;
			}
		};

		cleanupFn = cleanup;
	}

	/**
	 * Refresh user data (credits and bonus spins)
	 */
	async function refreshUserData() {
		if (!engine || !playerAlgorandAddress) return;

		try {
			const adapter = engine['adapter'] as any;
			if (adapter.getUserData) {
				const userData = await adapter.getUserData(playerAlgorandAddress);
				const newCredits = userData.credits || 0;
				const newBonusSpins = userData.bonusSpins || 0;
				
				// Set default mode based on credits:
				// - If user has credits, default to Credit mode (1)
				// - If user has no credits, default to VOI mode (2)
				// Only set default if mode is not already set to a valid enabled mode
				if (mode === 0 || (mode !== 1 && mode !== 2 && mode !== 4)) {
					if (newCredits > 0 && (modeEnabled & 1)) {
						// User has credits, default to Credit mode
						mode = 1;
					} else if (modeEnabled & 2) {
						// User has no credits, default to VOI mode
						mode = 2;
					} else if (modeEnabled & 4) {
						// Fallback to ARC200 mode if VOI not available
						mode = 4;
					}
				} else if (mode === 1 && newCredits === 0 && credits > 0) {
					// User just ran out of credits, switch to VOI mode
					if (modeEnabled & 2) {
						mode = 2;
					} else if (modeEnabled & 4) {
						mode = 4;
					}
				}
				
				credits = newCredits;
				bonusSpins = newBonusSpins;
			}
		} catch (error) {
			console.error('Failed to refresh user data:', error);
		}
	}

	// Initialize on mount
	onMount(() => {
		initializeEngine();

		// Refresh user data when window regains focus to ensure bonus spins are up to date
		const handleFocus = () => {
			if (engine && playerAlgorandAddress) {
				refreshUserData();
			}
		};

		window.addEventListener('focus', handleFocus);

		return () => {
			window.removeEventListener('focus', handleFocus);
		};
	});

	// Re-initialize when session or address becomes available
	$effect(() => {
		const session = $page.data.session || null;
		const hasAddress = algorandAddress || session?.voiAddress;
		
		if (hasAddress && !engine && !cleanupFn) {
			console.log('🔄 Address available from props/session, initializing engine...');
			initializeEngine().catch(err => {
				console.error('Failed to initialize engine in effect:', err);
			});
		} else if (!hasAddress && !engine && !cleanupFn) {
			const storedAddress = getFirstStoredVoiAddress();
			if (storedAddress) {
				console.log('🔄 Stored game account address found, initializing engine...');
				initializeEngine().catch(err => {
					console.error('Failed to initialize engine with stored address:', err);
				});
			}
		}
	});

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
	 * Allows rapid queueing with balance-based limiting
	 */
	async function handleSpin() {
		console.log('🔵 handleSpin called', { stack: new Error().stack });
		if (!engine) {
			console.error('Engine not initialized');
			return;
		}

		// Prevent duplicate spin submissions
		if (isHandlingSpin) {
			console.warn('Spin already in progress, ignoring duplicate call', { stack: new Error().stack });
			return;
		}

		isHandlingSpin = true;

		// Auto-detect bonus spins: if user has bonus spins, automatically use bonus mode (0)
		// Otherwise use the selected mode
		const actualMode = bonusSpins > 0 ? 0 : mode;
		let bonusSpinDecremented = false;

		try {
			// Convert betAmount from VOI to microAlgos (UI uses VOI units, engine expects microAlgos)
			const betAmountMicroAlgos = actualMode === 0 ? 0 : betAmount * 1_000_000;
			
			// Transaction cost per spin
			const spinCost = 50_500; // Transaction fee
			const totalCostPerSpin = betAmountMicroAlgos + spinCost;

			// Get current state
			const state = engine.getState();
			const pendingSpins = state.spinQueue.filter(
				(s) =>
					s.status !== SpinStatus.COMPLETED &&
					s.status !== SpinStatus.FAILED &&
					s.status !== SpinStatus.EXPIRED
			);

			// Calculate total cost for all pending spins plus this new one
			const totalPendingCost = pendingSpins.reduce((sum, spin) => {
				// For W2W spins, calculate cost based on betAmount and mode
				if (spin.gameType === 'w2w') {
					const spinBetAmount = spin.betAmount || 0;
					// Bonus mode (0) has no bet amount, only fee
					const spinMode = spin.mode || 2;
					const spinBet = spinMode === 0 ? 0 : spinBetAmount;
					return sum + spinBet + spinCost;
				}
				// For 5reel spins, use totalBet
				return sum + (spin.totalBet || 0) + spinCost;
			}, 0);

			const totalCostWithNewSpin = totalPendingCost + totalCostPerSpin;

			// Check balance for VOI/ARC200 modes (credit/bonus modes checked in engine)
			if (actualMode === 2 || actualMode === 4) {
				const availableBalance = Math.max(0, balance - reservedBalance);
				
				// Check if we have enough balance for all queued spins plus this new one
				if (availableBalance < totalCostPerSpin) {
					gameStore.setError(`Insufficient balance. Need ${formatVoi(totalCostPerSpin)} VOI for this spin.`);
					return;
				}

				// Check if adding this spin would exceed available balance
				if (availableBalance < totalCostWithNewSpin) {
					gameStore.setError(
						`Insufficient balance to queue another spin. ${pendingSpins.length} spin${pendingSpins.length !== 1 ? 's' : ''} already queued.`
					);
					return;
				}
			}

			// Optimistically decrement bonus spins if using bonus mode
			if (actualMode === 0 && bonusSpins > 0) {
				bonusSpins = Math.max(0, bonusSpins - 1);
				bonusSpinDecremented = true;
				console.log('🎰 Decremented bonus spin (optimistic)', { bonusSpins });
			}
			
			// Generate unique index (should be per-user, but for now use timestamp)
			const index = Date.now() % 1000000;
			
			// Queue the spin (engine will process it sequentially)
			await (engine as any).spinW2W(betAmountMicroAlgos, index, actualMode);
		} catch (error) {
			// If spin failed and we decremented bonus spin, restore it
			if (bonusSpinDecremented) {
				refreshUserData();
			}
			const errorMessage = error instanceof Error ? error.message : 'Failed to place bet';
			console.error('Failed to place bet:', error);
			gameStore.setError(errorMessage);
		} finally {
			isHandlingSpin = false;
		}
	}

	/**
	 * Handle bet amount change
	 */
	function handleBetChange(newBetAmount: number) {
		gameStore.setBetW2W(newBetAmount, mode, Date.now() % 1000000);
	}

	/**
	 * Handle mode change
	 */
	function handleModeChange(newMode: number) {
		gameStore.setBetW2W(betAmount, newMode, Date.now() % 1000000);
		refreshUserData();
	}

	/**
	 * Handle win display close
	 */
	function handleWinDisplayClose() {
		showWinDisplay = false;
		waysWins = [];
		bonusSpinsAwarded = 0;
		jackpotHit = false;
	}

	/**
	 * Handle balance refresh
	 */
	async function handleRefreshBalance() {
		if (isRefreshingBalance || !engine) return;

		try {
			isRefreshingBalance = true;
			await fetchTokenBalance();
			await refreshUserData();
		} catch (error) {
			console.error('Failed to refresh balance:', error);
			gameStore.setError('Failed to refresh balance. Please try again.');
		} finally {
			isRefreshingBalance = false;
		}
	}

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
				// Update game store with the balance
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
	 * Format token balance for display
	 */
	function formatTokenBalance(rawBalance: bigint | number, decimals: number): string {
		const bal = typeof rawBalance === 'bigint' ? rawBalance : BigInt(rawBalance);
		const divisor = BigInt(10 ** decimals);
		const whole = bal / divisor;
		const frac = bal % divisor;
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
				{gameConfig?.display_name || 'Ways to Win Slots'}
			</h1>
			<p class="text-tertiary mt-2">
				{gameConfig?.description || 'Match symbols left-to-right for ways to win. Provably fair blockchain gaming on Voi.'}
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

	<!-- Mode Selector -->
	<div class="compact-mode-selector mb-4">
		<W2WModeSelector
			mode={mode}
			{modeEnabled}
			{credits}
			{bonusSpins}
			disabled={isSpinning || waitingForOutcome}
			onModeChange={handleModeChange}
		/>
	</div>

	<!-- Balance Display -->
	<Card>
		<CardContent>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4">
					<CoinsIcon size={24} class="text-primary-400" />
					<div>
						{#if bonusSpins > 0}
							<div class="text-sm text-tertiary">Bonus Spins</div>
							<div class="text-2xl font-bold text-warning-400">
								{bonusSpins.toLocaleString()}
							</div>
							<div class="text-xs text-secondary italic">
								Will be used automatically
							</div>
							{#if balance > 0}
								<div class="text-xs text-secondary mt-1">
									VOI: {formatVoi(balance)}
								</div>
							{/if}
						{:else if mode === 1}
							<div class="text-sm text-tertiary">Credits</div>
							<div class="text-2xl font-bold text-primary-400">
								{credits.toLocaleString()}
							</div>
							{#if balance > 0}
								<div class="text-xs text-secondary">
									VOI: {formatVoi(balance)}
								</div>
							{/if}
						{:else if mode === 2 || mode === 4}
							<div class="text-sm text-tertiary">{tokenInfo.symbol} Balance</div>
							<div class="text-2xl font-bold text-primary-400">
								{formatTokenBalance(tokenInfo.contractId ? tokenBalance : balance, tokenInfo.decimals)}
							</div>
							{#if reservedBalance > 0 && !tokenInfo.contractId}
								<div class="text-xs text-secondary">
									Reserved: {formatVoi(reservedBalance)}
								</div>
							{/if}
						{/if}
					</div>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onclick={handleRefreshBalance}
					disabled={isRefreshingBalance}
				>
					{isRefreshingBalance ? 'Refreshing...' : 'Refresh'}
				</Button>
			</div>
		</CardContent>
	</Card>

	<!-- Game Grid -->
	<Card>
		<CardContent>
			<ReelGrid 
				grid={grid} 
				isSpinning={isSpinning}
				waitingForOutcome={waitingForOutcome}
				waysWins={waysWins}
				gameType="w2w"
			/>
		</CardContent>
	</Card>

		<!-- Betting Controls -->
		<Card>
			<CardContent>
				<W2WBettingControls
					betAmount={betAmount}
					mode={mode}
					disabled={false}
					isSpinning={pendingSpins > 0}
					{baseBet}
					{kickerAmount}
					onBetChange={handleBetChange}
					onSpin={handleSpin}
				/>
			</CardContent>
		</Card>

	<!-- Win Display Modal -->
	{#if showWinDisplay}
		<W2WWinDisplay
			waysWins={waysWins}
			totalPayout={winAmount}
			bonusSpinsAwarded={bonusSpinsAwarded}
			jackpotHit={jackpotHit}
			jackpotAmount={jackpotAmount}
			winLevel={winLevel}
			onClose={handleWinDisplayClose}
		/>
	{/if}

	<!-- Pending Spins Indicator -->
	{#if pendingSpins > 0}
		<div class="p-4 bg-primary-500/10 border border-primary-500/30 rounded-lg text-center">
			<p class="text-primary-400">
				{pendingSpins} spin{pendingSpins > 1 ? 's' : ''} pending...
			</p>
		</div>
	{/if}
</div>

