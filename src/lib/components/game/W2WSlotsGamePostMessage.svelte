<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { CoinsIcon } from '$lib/components/icons';

	// W2W Game components
	import ReelGrid from './ReelGrid.svelte';
	import W2WBettingControls from './W2WBettingControls.svelte';
	import W2WWinDisplay from './W2WWinDisplay.svelte';
	import W2WModeSelector from './W2WModeSelector.svelte';
	import W2WSpinQueue from './W2WSpinQueue.svelte';
	import W2WSpinDetailModal from './W2WSpinDetailModal.svelte';
	import W2WBonusSpinOverlay from './W2WBonusSpinOverlay.svelte';

	// PostMessage types
	import type {
		GameRequest,
		GameResponse,
		OutcomeMessage,
		BalanceUpdateMessage,
		ErrorMessage,
		ConfigMessage,
		CreditBalanceMessage,
	} from '$lib/game-engine/bridge/types';
	// Use MESSAGE_NAMESPACE constant directly to avoid import issues
	const MESSAGE_NAMESPACE = 'com.houseofvoi';

	import { onMount, onDestroy } from 'svelte';

	// W2W default symbols (0-9, A-F)
	const W2W_SYMBOLS: string[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];
	
	// Generate initial grid with W2W symbols
	function generateInitialGrid(): string[][] {
		return Array(5).fill(null).map(() =>
			Array(3).fill(null).map((_, i) => W2W_SYMBOLS[i % W2W_SYMBOLS.length])
		);
	}

	// Game state (managed via postMessage)
	let grid = $state<string[][]>(generateInitialGrid()) as any;
	let balance = $state(0);
	let availableBalance = $state(0);
	let credits = $state(0);
	let bonusSpins = $state(0);
	let jackpotAmount = $state(50000);
	let isSpinning = $state(false);
	let waitingForOutcome = $state(false);
	let betAmount = $state(40);
	let mode = $state(2); // 0=bonus, 1=credit (free-play), 2=VOI, 4=ARC200 (default to VOI, will be updated when credits load)
	let lastError = $state<string | null>(null);
	let showingWinDisplay = $state(false);
	let winAmount = $state(0);
	let winLevel = $state<'none' | 'small' | 'medium' | 'large' | 'jackpot'>('none');
	let waysWins = $state<any[]>([]);
	let bonusSpinsAwarded = $state(0);
	let jackpotHit = $state(false);
	let jackpotWinAmount = $state(0);
	let isRefreshingBalance = $state(false);
	let slotConfig = $state<any>(null);
	let modeEnabled = $state(7); // Default: all modes enabled
	let pendingSpinId: string | null = $state(null);
	let isAutoBonusMode = $state(false); // Track if we're in auto bonus spin mode
	let isAutoSpinning = $state(false); // Prevent multiple simultaneous auto-spins
	let bonusSpinIntervalId: ReturnType<typeof setInterval> | null = $state(null); // Track bonus spin interval timer
	let isDisplayingResults = $state(false); // Track when displaying results before next spin
	let winSequenceCompleteTimeout: ReturnType<typeof setTimeout> | null = null; // Track win sequence completion timeout
	let voiAddress = $state<string | null>(null);
	let configContractId = $state<string | null>(null);
	let isArc200Machine = $state(false);
	let arc200ContractId = $state<number | null>(null);
	let arc200TokenSymbol = $state('ARC200');
	let arc200TokenName = $state('ARC200 Token');
	let arc200Decimals = $state(6);
	let arc200Balance = $state<string | null>(null);
	let isArc200DataLoading = $state(false);
	let arc200Error = $state<string | null>(null);
	let lastArc200FetchKey: string | null = null;
	let lastSlotConfigFetchId: string | null = null;
	
	// Queue tracking
	interface QueuedSpin {
		clientSpinId: string; // Our client-generated ID
		engineSpinId?: string; // Engine's spinId (from SPIN_SUBMITTED)
		betAmount: number;
		mode: number;
		timestamp: number;
		completedAt?: number; // Timestamp when spin completed/failed
		status: 'pending' | 'submitted' | 'completed' | 'failed';
		fadingOut?: boolean; // Flag to trigger fade-out animation
		outcome?: {
			totalPayout: number;
			waysWins?: any[];
			grid?: string[][];
			bonusSpinsAwarded?: number;
			jackpotHit?: boolean;
			jackpotAmount?: number;
			winLevel?: 'none' | 'small' | 'medium' | 'large' | 'jackpot';
		};
		error?: string;
	}
	let spinQueue = $state<QueuedSpin[]>([]);
	let pendingSpins = $derived(spinQueue.filter(s => s.status !== 'completed' && s.status !== 'failed').length);
	const arc200DisplayLabel = $derived(isArc200Machine ? arc200TokenSymbol : 'ARC200');

	// Spin detail modal state
	let selectedSpin = $state<QueuedSpin | null>(null);

	// Auto-removal timeouts tracking
	const removalTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	const fadeOutTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

	// Message handler
	let messageHandler: ((event: MessageEvent) => void) | null = null;

	onMount(() => {
		fetchSessionAddress();

		// Set up postMessage listener
		messageHandler = (event: MessageEvent) => {
			// In production, validate origin
			// if (event.origin !== 'https://houseofvoi.com') return;

			const message = event.data;

			// Filter messages by namespace (silently ignore non-matching messages)
			if (!message || typeof message !== 'object' || !('namespace' in message)) {
				console.debug('W2WGame: Ignoring message without namespace field');
				return;
			}

			if (message.namespace !== MESSAGE_NAMESPACE) {
				console.debug(
					`W2WGame: Ignoring message with non-matching namespace: "${message.namespace}"`
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
				case 'CREDIT_BALANCE':
					handleCreditBalance(message);
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

		// Initialize connection - request balance, credits, and config
		sendMessage({ type: 'INIT' });
		sendMessage({ type: 'GET_BALANCE' });
		sendMessage({ type: 'GET_CREDIT_BALANCE' });
		sendMessage({ type: 'GET_CONFIG' });
	});

	onDestroy(() => {
		if (messageHandler) {
			window.removeEventListener('message', messageHandler);
			messageHandler = null;
		}
		// Clean up bonus spin interval
		console.log('🧹 Component destroying, clearing bonus spin interval');
		clearBonusSpinInterval();
		// Clean up win sequence timeout
		if (winSequenceCompleteTimeout) {
			clearTimeout(winSequenceCompleteTimeout);
			winSequenceCompleteTimeout = null;
		}
	});

	/**
	 * Send message to parent (bridge)
	 */
	function sendMessage(message: GameRequest): void {
		if (window.parent) {
			const messageWithNamespace = {
				...message,
				namespace: MESSAGE_NAMESPACE,
			};
			window.parent.postMessage(messageWithNamespace, '*'); // Use specific origin in production
		}
	}

	async function fetchSessionAddress(): Promise<void> {
		try {
			const response = await fetch('/api/auth/voi/session/check', { credentials: 'include' });
			if (!response.ok) {
				return;
			}
			const data = await response.json();
			const fetchedAddress = data?.voiAddress || null;
			if (fetchedAddress) {
				voiAddress = fetchedAddress;
				if (isArc200Machine && arc200ContractId) {
					await refreshArc200TokenInfo(true);
				}
			}
		} catch (error) {
			console.error('Failed to fetch Voi session address:', error);
		}
	}

	async function loadSlotMachineMetadata(contractId?: string): Promise<void> {
		if (!contractId) {
			return;
		}
		if (lastSlotConfigFetchId === contractId && (arc200ContractId || !isArc200Machine)) {
			return;
		}

		try {
			const response = await fetch(`/api/games/slot-configs?contract_id=${contractId}`);
			if (!response.ok) {
				throw new Error('Failed to load slot machine configuration');
			}
			const result = await response.json();
			const config = result?.data;

			lastSlotConfigFetchId = contractId;

			if (result?.success && config) {
				const arcIdRaw = config.ybt_asset_id ?? null;
				if (arcIdRaw) {
					const tokenId = Number(arcIdRaw);
					if (Number.isFinite(tokenId)) {
						arc200ContractId = tokenId;
						isArc200Machine = true;
						arc200TokenSymbol = 'ARC200';
						arc200TokenName = 'ARC200 Token';
						arc200Balance = null;
						arc200Error = null;
						lastArc200FetchKey = null;
						applyArc200ModePreference();
						await refreshArc200TokenInfo(true);
						return;
					}
				}
			}

			// Not an ARC200 machine or failed to parse token ID
			isArc200Machine = false;
			arc200ContractId = null;
			arc200Balance = null;
			arc200Error = null;
			lastArc200FetchKey = null;
		} catch (error) {
			console.error('Failed to load slot machine metadata:', error);
			lastSlotConfigFetchId = null;
		}
	}

	async function refreshArc200TokenInfo(force = false): Promise<void> {
		if (!arc200ContractId) {
			return;
		}
		const addressKey = voiAddress || 'session';
		const fetchKey = `${arc200ContractId}:${addressKey}`;

		if (!force && lastArc200FetchKey === fetchKey && arc200Balance !== null) {
			return;
		}

		try {
			isArc200DataLoading = true;
			arc200Error = null;

			const params = new URLSearchParams();
			if (voiAddress) {
				params.set('address', voiAddress);
			}
			const query = params.toString();
			const endpoint = query
				? `/api/arc200/${arc200ContractId}?${query}`
				: `/api/arc200/${arc200ContractId}`;

			const response = await fetch(endpoint, { credentials: 'include' });
			if (!response.ok) {
				throw new Error('Failed to fetch ARC200 token info');
			}

			const result = await response.json();
			if (!result?.success || !result?.data) {
				throw new Error(result?.error || 'Failed to fetch ARC200 token info');
			}

			const data = result.data;
			arc200TokenSymbol = data.symbol || 'ARC200';
			arc200TokenName = data.name || arc200TokenSymbol;
			arc200Decimals = Number(data.decimals ?? arc200Decimals);
			arc200Balance = data.balance ?? (voiAddress ? '0' : null);
			lastArc200FetchKey = fetchKey;
		} catch (error) {
			console.error('Failed to fetch ARC200 token info:', error);
			arc200Error = error instanceof Error ? error.message : 'Failed to load ARC200 token data';
		} finally {
			isArc200DataLoading = false;
		}
	}

	function applyArc200ModePreference(currentCredits?: number): void {
		if (!isArc200Machine || !(modeEnabled & 4)) {
			return;
		}

		const creditAmount = currentCredits ?? credits;
		if (creditAmount > 0) {
			return;
		}

		if (mode === 0) {
			return;
		}

		if (mode !== 4) {
			mode = 4;
		}
	}

	/**
	 * Handle outcome message (W2W format)
	 */
	function handleOutcome(message: OutcomeMessage): void {
		const payload = message.payload;

		console.log('🎰 W2W Outcome received:', payload);

		// Update grid
		grid = payload.grid;

		// Update W2W-specific fields (check if it's W2W format)
		if ('waysWins' in payload) {
			waysWins = payload.waysWins || [];
			bonusSpinsAwarded = payload.bonusSpinsAwarded || 0;
			
			// FORCE validation: Count HOV symbols in grid and ONLY set jackpotHit if grid has 3+
			// IGNORE payload.jackpotHit completely - trust the grid only
			let hovCount = 0;
			if (payload.grid && Array.isArray(payload.grid)) {
				// Grid format is [reel][row] - flatten and count 'E' symbols
				for (const reel of payload.grid) {
					if (Array.isArray(reel)) {
						for (const symbol of reel) {
							if (symbol === 'E') {
								hovCount++;
							}
						}
					}
				}
			}
			
			// EXPLICITLY set jackpotHit to false unless grid has 3+ HOV symbols
			// Completely ignore what payload.jackpotHit says
			jackpotHit = hovCount >= 3;
			jackpotWinAmount = jackpotHit ? (payload.jackpotAmount || 0) : 0;
			
			// Always log for debugging
			console.log('🎰 Jackpot validation:', {
				hovCount,
				jackpotHit,
				payloadJackpotHit: payload.jackpotHit,
				grid: payload.grid,
				gridFlat: payload.grid?.flat()
			});
		} else {
			// 5reel format - set defaults
			waysWins = [];
			bonusSpinsAwarded = 0;
			jackpotHit = false;
			jackpotWinAmount = 0;
		}

		// Mark spin as completed in queue and store outcome data
		// Match by engineSpinId first (most reliable), then clientSpinId as fallback
		// Only update spins that aren't already completed to prevent duplicate updates
		if (payload.spinId) {
			spinQueue = spinQueue.map(s => {
				// Skip if already completed or failed
				if (s.status === 'completed' || s.status === 'failed') {
					return s;
				}
				
				// Match by engineSpinId first (preferred), then clientSpinId
				const matches = s.engineSpinId === payload.spinId || s.clientSpinId === payload.spinId;
				
				if (matches) {
					return {
						...s,
						status: 'completed' as const,
						completedAt: Date.now(),
						outcome: {
							totalPayout: payload.winnings,
							waysWins: waysWins,
							grid: payload.grid,
							bonusSpinsAwarded: bonusSpinsAwarded,
							jackpotHit: jackpotHit,
							jackpotAmount: jackpotWinAmount,
							winLevel: payload.winLevel
						}
					};
				}
				
				return s;
			});
		}

		// Check if there are other pending spins
		const remainingPending = spinQueue.filter(s => s.status !== 'completed' && s.status !== 'failed').length;
		
		// If there are other pending spins, pause to show results
		if (remainingPending > 0) {
			// Stop spinning temporarily to show results
			waitingForOutcome = false;
			isSpinning = false;
			isDisplayingResults = true;
			
			// Calculate minimum pause time based on whether there are wins
			const hasWins = payload.winnings > 0 || bonusSpinsAwarded > 0 || jackpotHit;
			const minPauseTime = hasWins ? 3000 : 1500; // 3s for wins, 1.5s for no wins
			
			// Wait for win sequence to complete (or minimum pause time)
			// The win sequence completion will be handled by onWinSequenceComplete callback
			// But we also set a timeout as a fallback
			if (winSequenceCompleteTimeout) {
				clearTimeout(winSequenceCompleteTimeout);
			}
			
			winSequenceCompleteTimeout = setTimeout(() => {
				// Resume spinning for next spin
				isDisplayingResults = false;
				winSequenceCompleteTimeout = null;
				
				// Check if there are still pending spins to continue with
				const stillPending = spinQueue.filter(s => s.status !== 'completed' && s.status !== 'failed').length;
				if (stillPending > 0) {
					// Start next spin
					isSpinning = true;
					waitingForOutcome = true;
				}
			}, minPauseTime);
		} else {
			// No more pending spins - clear all states
			waitingForOutcome = false;
			isSpinning = false;
			pendingSpinId = null;
			isDisplayingResults = false;
			
			// After all spins complete, ensure bonus spin interval is running if needed
			// The interval should continue running regardless of showingWinDisplay state
			// It will keep adding spins every 3 seconds as long as bonusSpins > 0
			if (bonusSpins > 0 && isAutoBonusMode) {
				setTimeout(() => {
					checkAndAutoSubmitBonusSpin();
				}, 500);
			}
		}

		// Update bonus spins if awarded
		if (bonusSpinsAwarded > 0) {
			bonusSpins += bonusSpinsAwarded;
		}

		// Update win display
		if (payload.winnings > 0 || bonusSpinsAwarded > 0 || jackpotHit) {
			winAmount = payload.winnings;
			// FORCE winLevel to match payload - don't let it be 'jackpot' unless jackpotHit is true
			const payloadWinLevel = payload.winLevel || 'small';
			// Only allow 'jackpot' winLevel if jackpotHit is actually true
			winLevel = (payloadWinLevel === 'jackpot' && !jackpotHit) ? 'large' : payloadWinLevel;
			showingWinDisplay = true;
			
			console.log('🎰 Win display update:', {
				winnings: payload.winnings,
				jackpotHit,
				payloadWinLevel,
				actualWinLevel: winLevel,
				showingWinDisplay
			});
		} else {
			showingWinDisplay = false;
			// Ensure bonus spin interval is running after a short delay
			// The interval should run regardless of processing states
			// It will continue adding spins every 3 seconds as long as bonusSpins > 0
			setTimeout(() => {
				if (bonusSpins > 0 && isAutoBonusMode) {
					checkAndAutoSubmitBonusSpin();
				}
			}, 500);
		}

		// Query user data from contract to get actual bonus spin count
		// This ensures we have the latest count after the claim transaction
		sendMessage({ type: 'GET_CREDIT_BALANCE' });

		if (isArc200Machine && arc200ContractId) {
			refreshArc200TokenInfo(true);
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
	function handleBalanceResponse(message: any): void {
		const payload = message.payload;
		balance = Number(payload.balance) || 0;
		availableBalance = Number(payload.availableBalance) || 0;
		isRefreshingBalance = false;
	}

	/**
	 * Handle credit balance (W2W specific)
	 */
	function handleCreditBalance(message: CreditBalanceMessage): void {
		const payload = message.payload;
		const newCredits = Number(payload.credits) || 0;
		const newBonusSpins = Number(payload.bonusSpins) || 0;
		
		const arc200Preferred = isArc200Machine && Boolean(modeEnabled & 4);
		// Set default mode based on credits and ARC200 availability
		if (mode === 0 || (mode !== 1 && mode !== 2 && mode !== 4)) {
			if (newCredits > 0 && (modeEnabled & 1)) {
				// User has credits, default to Credit mode
				mode = 1;
			} else if (arc200Preferred) {
				// ARC200 machine with no credits - default to token mode
				mode = 4;
			} else if (modeEnabled & 2) {
				// Default to VOI if available
				mode = 2;
			} else if (modeEnabled & 4) {
				// Fallback to ARC200 mode if VOI not available
				mode = 4;
			}
		} else if (mode === 1 && newCredits === 0 && credits > 0) {
			// User just ran out of credits
			if (arc200Preferred) {
				mode = 4;
			} else if (modeEnabled & 2) {
				mode = 2;
			} else if (modeEnabled & 4) {
				mode = 4;
			}
		}
		
		credits = newCredits;
		const previousBonusSpins = bonusSpins;
		bonusSpins = newBonusSpins;

		if (arc200Preferred) {
			applyArc200ModePreference(newCredits);
		}

		// Exit auto bonus mode if bonus spins ran out
		if (bonusSpins === 0 && isAutoBonusMode) {
			console.log('🛑 Bonus spins ran out, exiting auto bonus mode');
			clearBonusSpinInterval();
			isAutoBonusMode = false;
			isAutoSpinning = false;
		}

		// If we just received bonus spins and we're not currently spinning,
		// and we're in auto mode or should enter it, trigger auto-submit
		// Only trigger if bonus spins increased (new bonus spins detected)
		// The interval should start regardless of showingWinDisplay or other processing states
		if (newBonusSpins > previousBonusSpins && !isSpinning && !waitingForOutcome) {
			// Start interval immediately - it will continue running regardless of UI state
			checkAndAutoSubmitBonusSpin();
		}
	}

	/**
	 * Handle config message
	 */
	function handleConfig(message: ConfigMessage): void {
		const payload = message.payload;
		slotConfig = {
			contractId: payload.contractId,
			minBet: payload.minBet,
			maxBet: payload.maxBet,
			rtpTarget: payload.rtpTarget,
			houseEdge: payload.houseEdge,
		};
		// Update jackpot if available in config (W2W format)
		if ('jackpotAmount' in payload) {
			jackpotAmount = Number(payload.jackpotAmount) || 50000;
		}
		// Update modeEnabled if available in config (W2W format)
		if ('modeEnabled' in payload) {
			modeEnabled = Number(payload.modeEnabled) ?? 7;
		}

		if (payload.contractId) {
			configContractId = payload.contractId;
			loadSlotMachineMetadata(payload.contractId);
		}
	}

	/**
	 * Handle error message
	 */
	function handleError(message: ErrorMessage): void {
		const payload = message.payload;
		lastError = payload.message;

		// If error has a requestId, mark that spin as failed and store error message
		// requestId could be either clientSpinId or engineSpinId
		if (payload.requestId) {
			spinQueue = spinQueue.map(s =>
				(s.clientSpinId === payload.requestId || s.engineSpinId === payload.requestId)
					? { ...s, status: 'failed' as const, completedAt: Date.now(), error: payload.message }
					: s
			);
		}

		// Only clear spinning state if no other spins are pending
		const remainingPending = spinQueue.filter(s => s.status !== 'completed' && s.status !== 'failed').length;
		if (remainingPending === 0) {
			isSpinning = false;
			waitingForOutcome = false;
			pendingSpinId = null;
		}
		isRefreshingBalance = false;

		// Exit auto bonus mode on error to prevent stuck state
		if (isAutoBonusMode) {
			clearBonusSpinInterval();
			isAutoBonusMode = false;
			isAutoSpinning = false;
		}

		console.error('❌ Game error:', payload);
	}

	/**
	 * Handle spin submitted
	 */
	function handleSpinSubmitted(message: any): void {
		const payload = message.payload;
		pendingSpinId = payload.spinId;
		
		// Mark spin as submitted in queue and store engine's spinId
		// The engine's spinId will be used to match outcomes
		// We match by finding the first pending spin (since they're processed in order)
		if (payload.spinId) {
			// Find the first pending spin that doesn't have an engineSpinId yet
			const pendingIndex = spinQueue.findIndex(s => s.status === 'pending' && !s.engineSpinId);
			if (pendingIndex !== -1) {
				spinQueue = spinQueue.map((s, idx) => 
					idx === pendingIndex 
						? { ...s, status: 'submitted' as const, engineSpinId: payload.spinId } 
						: s
				);
			} else {
				// Fallback: try to match by clientSpinId if we can't find by order
				spinQueue = spinQueue.map(s => 
					s.clientSpinId === payload.spinId || s.engineSpinId === payload.spinId
						? { ...s, status: 'submitted' as const, engineSpinId: payload.spinId } 
						: s
				);
			}
		}
		
		console.log('📤 Spin submitted:', payload.spinId);
	}

	/**
	 * Handle spin button click
	 * Allows rapid queueing with balance-based limiting
	 */
	function handleSpin(): void {
		lastError = null;

		// If user manually clicks spin during auto bonus mode, exit auto mode
		// This allows user to take control
		// BUT: if we're in auto bonus mode and the interval is running, this is an auto-spin
		// so we should NOT exit auto mode. Only exit if it's a manual click (interval not running)
		if (isAutoBonusMode && !isAutoSpinning && bonusSpinIntervalId === null) {
			console.log('👤 Manual spin click detected, exiting auto bonus mode');
			isAutoBonusMode = false;
		}
		
		// Mark that we're auto-spinning if in auto bonus mode
		if (isAutoBonusMode && bonusSpinIntervalId !== null) {
			isAutoSpinning = true;
		}

		// Auto-detect bonus spins: if user has bonus spins, automatically use bonus mode (0)
		// Otherwise use the selected mode
		const actualMode = bonusSpins > 0 ? 0 : mode;
		
		// Convert betAmount from VOI to microAlgos for balance calculations
		const betAmountMicroAlgos = actualMode === 0 ? 0 : betAmount * 1_000_000;
		
		// Transaction cost per spin
		const spinCost = 50_500; // Transaction fee
		const totalCostPerSpin = betAmountMicroAlgos + spinCost;

		// Calculate total cost for all pending spins plus this new one
		const totalPendingCost = spinQueue
			.filter(s => s.status !== 'completed' && s.status !== 'failed')
			.reduce((sum, spin) => {
				const spinBetAmount = spin.mode === 0 ? 0 : spin.betAmount * 1_000_000;
				return sum + spinBetAmount + spinCost;
			}, 0);

		const totalCostWithNewSpin = totalPendingCost + totalCostPerSpin;

		// Check balance for VOI/ARC200 modes (credit/bonus modes checked by bridge)
		if (actualMode === 2 || actualMode === 4) {
			// availableBalance is already in microAlgos from balance updates
			const availableBalanceMicroAlgos = availableBalance;
			
			// Check if we have enough balance for all queued spins plus this new one
			if (availableBalanceMicroAlgos < totalCostPerSpin) {
				lastError = `Insufficient balance. Need ${(totalCostPerSpin / 1_000_000).toFixed(2)} VOI for this spin.`;
				return;
			}

			// Check if adding this spin would exceed available balance
			if (availableBalanceMicroAlgos < totalCostWithNewSpin) {
				lastError = `Insufficient balance to queue another spin. ${pendingSpins} spin${pendingSpins !== 1 ? 's' : ''} already queued.`;
				return;
			}
		}

		// Generate unique client spin ID
		const clientSpinId = `spin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		// Add to queue
		spinQueue = [...spinQueue, {
			clientSpinId,
			engineSpinId: undefined, // Will be set when SPIN_SUBMITTED arrives
			betAmount,
			mode: actualMode,
			timestamp: Date.now(),
			status: 'pending'
		}];

		// Start animation if this is the first spin
		if (pendingSpins === 1) {
			isSpinning = true;
			waitingForOutcome = true;
		}

		// Optimistically decrement bonus spins if using bonus mode
		if (actualMode === 0 && bonusSpins > 0) {
			bonusSpins = Math.max(0, bonusSpins - 1);
			console.log('🎰 Decremented bonus spin (optimistic)', { bonusSpins });
		}

		// Send W2W spin request
		sendMessage({
			type: 'SPIN_REQUEST',
			payload: {
				betAmount,
				mode: actualMode, // Pass the actual mode: 0=bonus, 1=credit, 2=VOI, 4=ARC200
				reserved: actualMode === 0 ? 1 : 0, // 1 for bonus spin, 0 for regular (kept for backward compatibility)
				spinId: clientSpinId, // Send client spinId for reference (engine will generate its own)
			},
		});
	}

	/**
	 * Handle bet amount change
	 */
	function handleBetChange(newBetAmount: number): void {
		// Exit auto bonus mode if user manually changes bet amount
		if (isAutoBonusMode) {
			isAutoBonusMode = false;
			isAutoSpinning = false;
		}
		betAmount = newBetAmount;
	}

	/**
	 * Handle mode change
	 */
	function handleModeChange(newMode: number): void {
		// Exit auto bonus mode if user manually changes mode away from bonus
		if (newMode !== 0 && isAutoBonusMode) {
			isAutoBonusMode = false;
			isAutoSpinning = false;
		}
		mode = newMode;
		// Refresh credit balance when switching modes
		if (newMode === 0 || newMode === 1) {
			sendMessage({ type: 'GET_CREDIT_BALANCE' });
		}
	}

	/**
	 * Handle win display close
	 */
	function handleWinDisplayClose(): void {
		showingWinDisplay = false;
		waysWins = [];
		bonusSpinsAwarded = 0;
		jackpotHit = false;
		
		// After win display closes, ensure bonus spin interval is running if needed
		console.log('🪟 Win display closed, checking bonus spin interval', { bonusSpins, isAutoBonusMode });
		checkAndAutoSubmitBonusSpin();
	}

	/**
	 * Handle win sequence completion from ReelGrid
	 * Called when the win highlighting animation sequence finishes
	 */
	function handleWinSequenceComplete(): void {
		// If we're displaying results and there are pending spins, continue to next spin
		if (isDisplayingResults) {
			// Clear the timeout since win sequence completed
			if (winSequenceCompleteTimeout) {
				clearTimeout(winSequenceCompleteTimeout);
				winSequenceCompleteTimeout = null;
			}
			
			// Small delay before starting next spin (allows win sequence to fully finish)
			setTimeout(() => {
				isDisplayingResults = false;
				
				// Check if there are still pending spins to continue with
				const stillPending = spinQueue.filter(s => s.status !== 'completed' && s.status !== 'failed').length;
				if (stillPending > 0) {
					// Start next spin
					isSpinning = true;
					waitingForOutcome = true;
				}
			}, 300); // Small delay to ensure smooth transition
		}
	}

	/**
	 * Clear the bonus spin interval timer
	 */
	function clearBonusSpinInterval(): void {
		if (bonusSpinIntervalId !== null) {
			console.log('🛑 Clearing bonus spin interval');
			clearInterval(bonusSpinIntervalId);
			bonusSpinIntervalId = null;
		}
	}

	/**
	 * Start the bonus spin interval timer (submits spins every 3 seconds)
	 */
	function startBonusSpinInterval(): void {
		// Don't start if already running
		if (bonusSpinIntervalId !== null) {
			console.log('⏭️ Bonus spin interval already running, skipping start');
			return;
		}

		// Enter auto bonus mode if not already in it
		if (!isAutoBonusMode) {
			isAutoBonusMode = true;
		}
		
		// Mark that we're auto-spinning
		isAutoSpinning = true;

		// Set up interval to submit spins every 3 seconds
		// This interval should continue running regardless of processing state
		bonusSpinIntervalId = setInterval(() => {
			// Check if we should continue submitting
			// Only check for auto mode and bonus spins - don't block on processing states
			if (!isAutoBonusMode || bonusSpins === 0) {
				console.log('🛑 Bonus spin interval stopping:', { isAutoBonusMode, bonusSpins });
				clearBonusSpinInterval();
				isAutoBonusMode = false;
				isAutoSpinning = false;
				return;
			}

			// Remove the pending spins limit - bonus spins should queue continuously
			// The queue will handle processing in order, and we want to keep adding spins
			// every 3 seconds without waiting for previous spins to complete

			// Submit a spin
			try {
				console.log('🎰 Auto-queuing bonus spin', { bonusSpins, pendingSpins });
				handleSpin();
			} catch (error) {
				console.error('❌ Auto bonus spin failed:', error);
				// Don't clear interval on error - let it retry on next interval
				// Only clear if it's a critical error that prevents continuation
			}
		}, 3000); // 3 seconds

		console.log('▶️ Bonus spin interval started (3s interval)', { bonusSpins });
	}

	/**
	 * Check if we should auto-submit bonus spins and start the interval
	 * This should start the interval whenever we have bonus spins, regardless of processing state
	 */
	function checkAndAutoSubmitBonusSpin(): void {
		// Don't start if:
		// - Already has an interval running
		// - No bonus spins available
		// Note: We removed the showingWinDisplay check - the interval should run even during win displays
		// The interval will continue adding spins to the queue every 3 seconds regardless of UI state
		if (bonusSpinIntervalId !== null) {
			console.log('⏭️ Bonus spin interval already running, skipping checkAndAutoSubmitBonusSpin');
			return;
		}

		if (bonusSpins === 0) {
			console.log('⏭️ No bonus spins available, skipping interval start');
			return;
		}

		// If we have bonus spins, start the interval
		// The interval will continue running and adding spins regardless of:
		// - isDisplayingResults
		// - showingWinDisplay
		// - isSpinning
		// - waitingForOutcome
		// It only stops when bonusSpins reaches 0 or isAutoBonusMode is false
		console.log('✅ Starting bonus spin interval check', { bonusSpins, showingWinDisplay, isDisplayingResults });
		startBonusSpinInterval();
	}

	/**
	 * Exit bonus spin mode manually
	 */
	function exitBonusSpinMode(): void {
		clearBonusSpinInterval();
		isAutoBonusMode = false;
		isAutoSpinning = false;
		// Switch back to the previous mode (or default to VOI)
		if (mode === 0) {
			if (modeEnabled & 2) {
				mode = 2; // VOI mode
			} else if (modeEnabled & 4) {
				mode = 4; // ARC200 mode
			} else if (modeEnabled & 1 && credits > 0) {
				mode = 1; // Credit mode
			}
		}
	}

	/**
	 * Handle balance refresh
	 */
	function handleRefreshBalance(): void {
		if (isRefreshingBalance) return;

		isRefreshingBalance = true;
		sendMessage({ type: 'GET_BALANCE' });
		sendMessage({ type: 'GET_CREDIT_BALANCE' });
		if (isArc200Machine && arc200ContractId) {
			refreshArc200TokenInfo(true);
		}
	}

	/**
	 * Handle spin click from queue
	 */
	function handleSpinClick(spin: QueuedSpin): void {
		selectedSpin = spin;
	}

	/**
	 * Close spin detail modal
	 */
	function closeSpinDetail(): void {
		selectedSpin = null;
	}

	/**
	 * Auto-remove completed/failed spins when queue reaches 10 items
	 * Only removes completed/failed spins (oldest first) to maintain queue size
	 */
	$effect(() => {
		// Only start removing when queue reaches 10 items
		if (spinQueue.length < 10) {
			// Clean up any existing timeouts since we're not removing anything
			for (const [spinId, timeoutId] of removalTimeouts.entries()) {
				clearTimeout(timeoutId);
				removalTimeouts.delete(spinId);
			}
			return;
		}

		// Find completed/failed spins that aren't already fading
		const completedOrFailedSpins = spinQueue.filter(
			s => (s.status === 'completed' || s.status === 'failed') && !s.fadingOut
		);

		// If no completed spins to remove, nothing to do
		if (completedOrFailedSpins.length === 0) {
			return;
		}

		// Sort by completedAt (oldest first), fallback to timestamp if completedAt is missing
		const sortedSpins = [...completedOrFailedSpins].sort((a, b) => {
			const aTime = a.completedAt || a.timestamp;
			const bTime = b.completedAt || b.timestamp;
			return aTime - bTime;
		});

		// Process only the oldest completed spin at a time
		const oldestSpin = sortedSpins[0];

		// Skip if we already have a timeout set for this spin
		if (removalTimeouts.has(oldestSpin.clientSpinId) || fadeOutTimeouts.has(oldestSpin.clientSpinId)) {
			return;
		}

		// Mark spin as fading out
		spinQueue = spinQueue.map(s =>
			s.clientSpinId === oldestSpin.clientSpinId
				? { ...s, fadingOut: true }
				: s
		);

		// After fade animation completes (1 second), remove from queue
		const fadeTimeoutId = setTimeout(() => {
			try {
				// Check if spin still exists before removing
				const currentSpin = spinQueue.find(s => s.clientSpinId === oldestSpin.clientSpinId);
				if (currentSpin) {
					spinQueue = spinQueue.filter(s => s.clientSpinId !== oldestSpin.clientSpinId);
				}
				fadeOutTimeouts.delete(oldestSpin.clientSpinId);
			} catch (error) {
				console.error('Error removing spin from queue:', error);
				fadeOutTimeouts.delete(oldestSpin.clientSpinId);
			}
		}, 1000);

		fadeOutTimeouts.set(oldestSpin.clientSpinId, fadeTimeoutId);

		// Cleanup: remove timeout IDs for spins that are no longer in the queue
		const currentSpinIds = new Set(spinQueue.map(s => s.clientSpinId));
		
		for (const [spinId, timeoutId] of removalTimeouts.entries()) {
			if (!currentSpinIds.has(spinId)) {
				clearTimeout(timeoutId);
				removalTimeouts.delete(spinId);
			}
		}
		for (const [spinId, timeoutId] of fadeOutTimeouts.entries()) {
			if (!currentSpinIds.has(spinId)) {
				clearTimeout(timeoutId);
				fadeOutTimeouts.delete(spinId);
			}
		}
	});

	/**
	 * Format number with commas
	 */
	function formatNumber(num: number): string {
		return num.toLocaleString();
	}

	function formatTokenAmount(raw: string | null | undefined, decimals: number, fractionDigits = 4): string {
		if (!raw) {
			return '0.00';
		}
		try {
			const value = BigInt(raw);
			if (decimals <= 0) {
				return value.toLocaleString();
			}
			const divisor = 10n ** BigInt(decimals);
			const whole = value / divisor;
			const fraction = value % divisor;
			if (fraction === 0n) {
				return whole.toLocaleString();
			}
			const padded = fraction.toString().padStart(decimals, '0');
			const trimmed = padded.replace(/0+$/, '');
			const slice = trimmed.slice(0, Math.max(2, fractionDigits));
			return `${whole.toLocaleString()}.${slice}`;
		} catch (error) {
			console.error('Failed to format ARC200 amount:', error);
			return raw;
		}
	}
</script>

<div class="w2w-slot-machine">
	<div class="slot-machine-container">
		<!-- Main Game Area -->
		<div class="game-main">
			<!-- Jackpot Display -->
			<div class="jackpot-display mb-6">
				<div class="jackpot-label">PROGRESSIVE JACKPOT</div>
				<div class="jackpot-amount">{formatNumber(jackpotAmount)}</div>
			</div>

			<!-- Reel Grid -->
			<Card
				glow
				class="reel-card mb-6"
			>
				<CardContent class="p-6">
					<ReelGrid
						{grid}
						isSpinning={isSpinning}
						waitingForOutcome={waitingForOutcome}
						waysWins={waysWins}
						gameType="w2w"
						jackpotAmount={jackpotAmount}
						bonusSpinsAwarded={bonusSpinsAwarded}
						onSpinComplete={() => console.log('Spin animation complete')}
						onWinSequenceComplete={handleWinSequenceComplete}
					/>
				</CardContent>
			</Card>

			<!-- Betting Controls -->
			<Card class="betting-card">
				<CardContent class="p-6">
					<W2WBettingControls
						betAmount={betAmount}
						{mode}
						tokenLabel={arc200DisplayLabel}
						disabled={false}
						isSpinning={pendingSpins > 0}
						onBetChange={handleBetChange}
						onSpin={handleSpin}
					/>
				</CardContent>
			</Card>
		</div>

		<!-- Sidebar -->
		<div class="game-sidebar">
			<!-- Mode Selector -->
			<div class="compact-mode-selector">
				<W2WModeSelector
					{mode}
					{modeEnabled}
					tokenLabel={arc200DisplayLabel}
					{credits}
					{bonusSpins}
					disabled={pendingSpins > 0}
					onModeChange={handleModeChange}
				/>
			</div>

			<!-- Balance Card -->
			<Card glow>
				<CardHeader>
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-bold text-warning-500 dark:text-warning-400 uppercase flex items-center gap-2">
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
					<div class="space-y-3">
						{#if isArc200Machine && arc200ContractId}
							<div class="space-y-1">
								<div class="flex flex-row justify-between">
									<div class="text-xs uppercase tracking-wide text-tertiary">{arc200TokenName || arc200DisplayLabel}</div>
									<div class="text-3xl font-extrabold text-primary-400">
										{#if isArc200DataLoading}
											Loading...
										{:else if arc200Error}
											<span class="text-error-400 text-base">Error</span>
										{:else if arc200Balance !== null}
											{formatTokenAmount(arc200Balance, arc200Decimals, 6)}
										{:else}
											{voiAddress ? '0.00' : 'Sign in to view'}
										{/if}
									</div>
								</div>
								{#if arc200Error}
									<div class="flex items-center justify-between text-xs text-error-400">
										<span>{arc200Error}</span>
										<button
											class="underline hover:text-error-300"
											onclick={() => refreshArc200TokenInfo(true)}
										>
											Retry
										</button>
									</div>
								{/if}
							</div>
							<div class="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
								<span>VOI Balance:</span>
								<span class="text-primary-300 font-medium">
									{(balance / 1_000_000).toFixed(2)}
								</span>
							</div>
						{:else}
							<!-- VOI balance first for non-ARC200 machines -->
							<div class="flex justify-between">
								<span class="text-tertiary">VOI Balance:</span>
								<span class="text-3xl font-extrabold text-primary-400">
									{(balance / 1_000_000).toFixed(2)}
								</span>
							</div>
						{/if}
						<!-- Always show Bonus Spins below VOI Balance -->
						<div class="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
							<span>Bonus Spins:</span>
							<span class="text-warning-400 font-medium">
								{formatNumber(bonusSpins)}
							</span>
						</div>
						<div class="text-xs text-neutral-500 dark:text-neutral-400 italic">
							Bonus spins will be used automatically
						</div>
						{#if mode === 1 && credits > 0}
							<!-- Credit Mode: Show Credits -->
							<div class="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
								<span>Credits:</span>
								<span class="text-primary-400 font-medium">
									{formatNumber(credits)}
								</span>
							</div>
						{/if}
					</div>
				</CardContent>
			</Card>

			<!-- Game Info -->
			{#if slotConfig}
				<Card class="mt-6">
					<CardHeader>
						<h3 class="text-lg font-bold text-warning-500 dark:text-warning-400 uppercase">
							Game Info
						</h3>
					</CardHeader>
					<CardContent class="space-y-2 text-sm">
						<div class="flex justify-between py-2 border-b border-warning-200 dark:border-warning-900/20">
							<span class="text-tertiary">RTP:</span>
							<span class="text-secondary font-semibold">{slotConfig.rtpTarget}%</span>
						</div>
						<div class="flex justify-between py-2 border-b border-warning-200 dark:border-warning-900/20">
							<span class="text-tertiary">House Edge:</span>
							<span class="text-secondary font-semibold">{slotConfig.houseEdge}%</span>
						</div>
						<div class="flex justify-between py-2">
							<span class="text-tertiary">Bet Amount:</span>
							<span class="text-secondary font-semibold">
								{betAmount}
								{mode === 1
									? ' credits'
									: mode === 2
										? ' VOI'
										: mode === 4
											? ` ${arc200DisplayLabel}`
											: ''}
							</span>
						</div>
					</CardContent>
				</Card>
			{/if}

			<!-- Spin Queue -->
			<div class="mt-6">
				<W2WSpinQueue {spinQueue} tokenLabel={arc200DisplayLabel} onSpinClick={handleSpinClick} />
			</div>
		</div>
	</div>

	<!-- Error Display -->
	{#if lastError}
		<div class="error-overlay">
			<div class="error-card">
				<p class="text-error-500 font-medium">{lastError}</p>
				<button
					onclick={() => (lastError = null)}
					class="mt-2 text-sm text-error-400 hover:text-error-300 underline"
				>
					Dismiss
				</button>
			</div>
		</div>
	{/if}

	<!-- Win Display Modal -->
	{#if showingWinDisplay}
		<W2WWinDisplay
			waysWins={waysWins}
			totalPayout={winAmount}
			bonusSpinsAwarded={bonusSpinsAwarded}
			jackpotHit={jackpotHit}
			jackpotAmount={jackpotWinAmount}
			winLevel={winLevel}
			currencyLabel={mode === 4 ? arc200DisplayLabel : mode === 2 ? 'VOI' : 'credits'}
			onClose={handleWinDisplayClose}
		/>
	{/if}

	<!-- Spin Detail Modal -->
	<W2WSpinDetailModal spin={selectedSpin} onClose={closeSpinDetail} />

	<!-- Bonus Spin Overlay -->
	<W2WBonusSpinOverlay
		bonusSpins={bonusSpins}
		isAutoMode={isAutoBonusMode}
		onExit={exitBonusSpinMode}
	/>
</div>

<style>
	.w2w-slot-machine {
		@apply min-h-screen bg-gradient-to-br from-neutral-50 via-white to-neutral-50;
		@apply dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-900;
		@apply p-4 md:p-6;
	}

	.slot-machine-container {
		@apply max-w-7xl mx-auto grid lg:grid-cols-3 gap-6;
	}

	.game-main {
		@apply lg:col-span-2;
	}

	.jackpot-display {
		@apply bg-gradient-to-r from-warning-500/20 via-warning-400/20 to-warning-500/20;
		@apply border-2 border-warning-500/50 rounded-xl p-6 text-center;
		@apply shadow-lg shadow-warning-500/20;
		@apply animate-pulse;
	}

	.jackpot-label {
		@apply text-xs font-bold text-warning-400 uppercase tracking-wider mb-2;
	}

	.jackpot-amount {
		@apply text-4xl md:text-5xl font-black text-warning-300;
		text-shadow: 0 0 20px rgba(251, 191, 36, 0.5);
	}

	.reel-card {
		@apply bg-gradient-to-br from-neutral-50 via-neutral-100 to-neutral-50;
		@apply dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-900;
		@apply border-neutral-200 dark:border-neutral-700;
	}

	.mode-selector-card {
		@apply bg-white/80 dark:bg-neutral-800/80;
		@apply border-neutral-200 dark:border-neutral-700;
	}

	.betting-card {
		@apply bg-white/80 dark:bg-neutral-800/80;
		@apply border-neutral-200 dark:border-neutral-700;
	}

	.game-sidebar {
		@apply space-y-4;
	}

	.compact-mode-selector {
		@apply mb-2;
	}

	.error-overlay {
		@apply fixed inset-0 z-50 flex items-center justify-center;
		@apply bg-black/80 backdrop-blur-sm;
	}

	.error-card {
		@apply bg-surface-900 rounded-2xl p-6 border-2 border-error-500;
		@apply max-w-md w-full mx-4;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.8;
		}
	}

	.animate-pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}
</style>
