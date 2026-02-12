<script lang="ts">
	import { onMount } from 'svelte';
	import TestingOverlay from '$lib/components/testing/TestingOverlay.svelte';
	import type { OutcomeOption } from '$lib/components/testing/SpinOutcomeToast.svelte';
	import type { ConfigValues } from '$lib/components/testing/ConfigEditor.svelte';
	import type { LoggedMessage, MessageStats } from '$lib/testing/types';
	import type { GameType } from '$lib/testing/messageTemplates';
	import {
		gameResponseTemplates,
		detectGameTypeFromUrl,
		generateSpinId
	} from '$lib/testing/messageTemplates';
	import type { GameRequest, GameResponse, OutcomeMessage, QueuedSpinItem, SpinQueueMessage } from '$lib/game-engine/bridge/types';
	import { MESSAGE_NAMESPACE, isGameRequest } from '$lib/game-engine/bridge/types';
	import {
		calculateW2WPayouts,
		isJackpotTriggered,
		isBonusTriggered
	} from '$lib/game-engine/utils/w2wPayoutCalculator';
	import {
		evaluatePaylines,
		DEFAULT_PAYLINE_PATTERNS,
		DEFAULT_PAYTABLE
	} from '$lib/game-engine/utils/paylineEvaluator';
	import type { SymbolId } from '$lib/game-engine/types/config';

	// Helper function to round balance to 6 decimal places
	function roundBalance(balance: number): number {
		return Math.round(balance * 1_000_000) / 1_000_000;
	}

	// Helper functions to generate realistic grids for test cases
	function generateW2WJackpotGrid(): SymbolId[][] {
		// 3+ HOV (E) symbols = jackpot (no other wins needed)
		return [
			['E', '1', '2'], // Reel 1 (HOV on row 0)
			['E', '3', '4'], // Reel 2 (HOV on row 0)
			['E', '5', '6'], // Reel 3 (HOV on row 0) - 3 HOV = jackpot
			['7', '8', '9'], // Reel 4
			['A', 'B', 'C'] // Reel 5 - pure jackpot, no other winning lines
		];
	}

	function generateW2WBonusGrid(): SymbolId[][] {
		// 2+ BONUS (F) symbols = 8 bonus spins
		return [
			['F', '0', '1'], // Reel 1 (BONUS on row 0)
			['2', '3', '4'], // Reel 2
			['5', '6', '7'], // Reel 3
			['F', '8', '9'], // Reel 4 (BONUS on row 0) - 2 BONUS = 8 spins
			['A', 'B', 'C'] // Reel 5
		];
	}

	function generateW2WBigWinGrid(): SymbolId[][] {
		// 5-of-a-kind high symbol (Buffalo) across all reels
		return [
			['0', '1', '2'], // Reel 1 (Buffalo on row 0)
			['0', '3', '4'], // Reel 2 (Buffalo on row 0)
			['0', '5', '6'], // Reel 3 (Buffalo on row 0)
			['0', '7', '8'], // Reel 4 (Buffalo on row 0)
			['0', '9', 'A'] // Reel 5 (Buffalo on row 0) - 5 Buffalo = big win
		];
	}

	function generateW2WMediumWinGrid(): SymbolId[][] {
		// 4-of-a-kind mid symbol (Eagle)
		return [
			['1', '0', '2'], // Reel 1 (Eagle on row 0)
			['1', '3', '4'], // Reel 2 (Eagle on row 0)
			['1', '5', '6'], // Reel 3 (Eagle on row 0)
			['1', '7', '8'], // Reel 4 (Eagle on row 0) - 4 Eagle = medium win
			['9', 'A', 'B'] // Reel 5
		];
	}

	function generateW2WLossGrid(): SymbolId[][] {
		// All different symbols, no matches
		return [
			['0', '1', '2'], // Reel 1
			['3', '4', '5'], // Reel 2
			['6', '7', '8'], // Reel 3
			['9', 'A', 'B'], // Reel 4
			['C', 'D', 'E'] // Reel 5 - no matching sequences
		];
	}

	function generate5ReelBigWinGrid(): SymbolId[][] {
		// 5-of-a-kind A symbols on payline 0 (middle row)
		return [
			['B', 'A', 'C'], // Reel 1 (A on row 1 = middle)
			['D', 'A', 'B'], // Reel 2 (A on row 1)
			['C', 'A', 'D'], // Reel 3 (A on row 1)
			['B', 'A', 'C'], // Reel 4 (A on row 1)
			['D', 'A', 'B'] // Reel 5 (A on row 1) - 5-of-a-kind on middle payline
		];
	}

	function generate5ReelMediumWinGrid(): SymbolId[][] {
		// 4-of-a-kind B symbols on top row + 3-of-a-kind C on middle
		return [
			['B', 'C', 'D'], // Reel 1 (B on row 0, C on row 1)
			['B', 'C', 'A'], // Reel 2 (B on row 0, C on row 1)
			['B', 'C', 'B'], // Reel 3 (B on row 0, C on row 1)
			['B', 'D', 'A'], // Reel 4 (B on row 0) - 4 B's on top
			['A', 'D', 'C'] // Reel 5
		];
	}

	function generate5ReelSmallWinGrid(): SymbolId[][] {
		// 3-of-a-kind on a payline
		return [
			['C', 'D', 'B'], // Reel 1 (C on row 0)
			['C', 'A', 'D'], // Reel 2 (C on row 0)
			['C', 'B', 'A'], // Reel 3 (C on row 0) - 3 C's
			['A', 'D', 'B'], // Reel 4
			['B', 'A', 'D'] // Reel 5
		];
	}

	function generate5ReelLossGrid(): SymbolId[][] {
		// No matching sequences on any paylines
		return [
			['A', 'B', 'C'], // Reel 1
			['D', 'A', 'B'], // Reel 2
			['C', 'D', 'A'], // Reel 3 - patterns broken
			['B', 'C', 'D'], // Reel 4
			['A', 'D', 'B'] // Reel 5
		];
	}

	// Weighted random grid selection for bonus spins
	function generateRandomW2WGrid(): SymbolId[][] {
		const roll = Math.random();
		if (roll < 0.4) return generateW2WLossGrid();
		if (roll < 0.7) return generateW2WMediumWinGrid();
		if (roll < 0.9) return generateW2WMediumWinGrid(); // another medium variant
		return generateW2WBigWinGrid();
	}

	// Process a batch of bonus spins with timed coordination
	async function processBonusSpinSequence(triggeringSpinId: string, totalSpins: number) {
		bonusProcessing = true;
		bonusProgress = { completed: 0, total: totalSpins };

		const outcomes: Array<{
			spinId: string;
			grid: string[][];
			winnings: number;
			isWin: boolean;
			waysWins: Array<{ symbol: string; ways: number; matchLength: number; payout: number }>;
			winLevel: string;
		}> = [];
		let totalWinnings = 0;

		// Simulate claim completion wait
		await new Promise((r) => setTimeout(r, 1500));

		// Send BONUS_SPIN_START
		sendResponseToGame({
			namespace: MESSAGE_NAMESPACE,
			type: 'BONUS_SPIN_START',
			payload: {
				totalSpins,
				triggeringSpinId
			}
		});

		for (let i = 0; i < totalSpins; i++) {
			// Delay between spins
			await new Promise((r) => setTimeout(r, 2000));

			const grid = generateRandomW2WGrid();
			const calculatedWins = calculateW2WPayouts(grid);
			const winnings = calculatedWins.reduce((sum, w) => sum + w.payout, 0);
			const isWin = winnings > 0;
			let winLevel: string = 'none';
			if (winnings >= 5000) winLevel = 'large';
			else if (winnings >= 1000) winLevel = 'medium';
			else if (winnings > 0) winLevel = 'small';

			// Apply winnings to balance
			if (winnings > 0) {
				currentBalance = roundBalance(currentBalance + winnings);
			}
			totalWinnings += winnings;

			// Decrement bonus spin counter
			currentBonusSpins = Math.max(0, currentBonusSpins - 1);

			// Generate bonus spin ID and add to queue as completed
			const bonusSpinId = generateSpinId();
			addSpinToQueueAsSubmitted(bonusSpinId, undefined, {
				betAmount: 0,
				mode: 0
			});
			updateSpinInQueue(bonusSpinId, {
				status: 'completed',
				outcome: {
					grid,
					winnings,
					isWin,
					winLevel: winLevel as 'none' | 'small' | 'medium' | 'large' | 'jackpot',
					waysWins: calculatedWins,
					bonusSpinsAwarded: 0,
					jackpotHit: false
				}
			});

			const latestOutcome = {
				spinId: bonusSpinId,
				grid: grid as string[][],
				winnings,
				isWin,
				waysWins: calculatedWins,
				winLevel
			};
			outcomes.push(latestOutcome);

			// Send BONUS_SPIN_PROGRESS
			bonusProgress = { completed: i + 1, total: totalSpins };
			sendResponseToGame({
				namespace: MESSAGE_NAMESPACE,
				type: 'BONUS_SPIN_PROGRESS',
				payload: {
					completed: i + 1,
					total: totalSpins,
					availableBalance: currentBalance,
					latestOutcome
				}
			});
		}

		// Send BONUS_SPIN_RESULTS
		sendResponseToGame({
			namespace: MESSAGE_NAMESPACE,
			type: 'BONUS_SPIN_RESULTS',
			payload: {
				outcomes,
				totalWinnings,
				totalSpins,
				completedSpins: totalSpins,
				failedSpins: 0,
				triggeringSpinId,
				availableBalance: currentBalance
			}
		});

		// Reset bonus processing state
		bonusProcessing = false;
		bonusProgress = null;

		// Send final balance updates
		sendCreditBalanceUpdate(currentCredits, currentBonusSpins);
		sendBalanceUpdate(currentBalance);
	}

	// State
	let gameUrl = $state('');
	let gameType = $state<GameType | null>(null);
	let messages = $state<LoggedMessage[]>([]);
	let iframeElement: HTMLIFrameElement | undefined = $state();
	let loadedConfig = $state<unknown | null>(null); // Config loaded from real contract
	let currentConfig = $state<ConfigValues | null>(null); // Current config values
	let currentBalance = $state(roundBalance(10000)); // 1000 VOI (normalized, 6 decimal places)
	let lastSpinId = $state<string | null>(null); // Track last spin request for matching responses
	let pendingSpinId = $state<string | null>(null); // Spin ID waiting for outcome selection
	let isOverlayStuck = $state(true); // Default to stuck mode
	let currentBonusSpins = $state(0); // Track current bonus spin count
	let currentCredits = $state(5000); // Track current credits for W2W games
	let bonusProcessing = $state(false); // Whether bonus spin batch is in progress
	let bonusProgress = $state<{ completed: number; total: number } | null>(null);

	// Spin queue management
	let spinQueue = $state<QueuedSpinItem[]>([]);
	const maxQueueSize = 50;

	// Stats
	let stats = $derived.by(() => {
		const byType: Record<string, { sent: number; received: number }> = {};
		let errors = 0;

		for (const msg of messages) {
			if (!byType[msg.messageType]) {
				byType[msg.messageType] = { sent: 0, received: 0 };
			}

			if (msg.direction === 'sent') {
				byType[msg.messageType].sent++;
			} else {
				byType[msg.messageType].received++;
			}

			if (msg.messageType === 'ERROR') {
				errors++;
			}
		}

		return {
			totalSent: messages.filter((m) => m.direction === 'sent').length,
			totalReceived: messages.filter((m) => m.direction === 'received').length,
			byType,
			errors
		} satisfies MessageStats;
	});

	// Handle URL change
	function handleUrlChange(url: string) {
		gameUrl = url;
		// Reload iframe by changing key
		if (iframeElement) {
			iframeElement.src = url;
		}
	}

	// Handle game type change
	function handleGameTypeChange(type: GameType | null) {
		gameType = type;
	}

	// Handle config loaded from real contract
	function handleConfigLoaded(config: unknown) {
		// Convert config from API format (microVOI) to normalized VOI
		const configAny = config as any;
		if (configAny) {
			// Convert min_bet/max_bet from microVOI to normalized VOI
			if (configAny.min_bet !== undefined) {
				configAny.minBet = configAny.min_bet / 1_000_000;
			}
			if (configAny.max_bet !== undefined) {
				configAny.maxBet = configAny.max_bet / 1_000_000;
			}
			// Normalize field names
			if (configAny.rtp_target !== undefined) {
				configAny.rtpTarget = configAny.rtp_target;
			}
			if (configAny.house_edge !== undefined) {
				configAny.houseEdge = configAny.house_edge;
			}
			if (configAny.max_paylines !== undefined) {
				configAny.maxPaylines = configAny.max_paylines;
			}
		}
		loadedConfig = config;
		console.log('[Testing Page] Config loaded from contract:', config);
		// Optionally send updated CONFIG to game
		sendConfigToGame();
	}

	// Handle config change from editor
	function handleConfigChange(config: ConfigValues) {
		currentConfig = config;
		console.log('[Testing Page] Config updated:', config);
		sendConfigToGame();
	}

	// Send current config to game
	function sendConfigToGame() {
		if (!iframeElement || !iframeElement.contentWindow) return;

		let configPayload: unknown;

		// Use loaded config if available, otherwise build from currentConfig
		// loadedConfig should already be converted to normalized VOI by handleConfigLoaded
		if (loadedConfig) {
			const loaded = loadedConfig as any;
			const detectedGameType = gameType || detectGameTypeFromUrl(gameUrl);
			
			if (detectedGameType === 'w2w') {
				configPayload = {
					contractId: loaded.contract_id || loaded.contractId || '123456',
					minBet: loaded.minBet || (loaded.min_bet ? loaded.min_bet / 1_000_000 : 40),
					maxBet: loaded.maxBet || (loaded.max_bet ? loaded.max_bet / 1_000_000 : 60),
					rtpTarget: loaded.rtpTarget || loaded.rtp_target || 96.5,
					houseEdge: loaded.houseEdge || loaded.house_edge || 3.5,
					jackpotAmount: loaded.jackpotAmount || 10000,
					bonusSpinMultiplier: loaded.bonusSpinMultiplier || 1.5,
					modeEnabled: 7
				};
			} else {
				configPayload = {
					contractId: loaded.contract_id || loaded.contractId || '123456',
					minBet: loaded.minBet || (loaded.min_bet ? loaded.min_bet / 1_000_000 : 0.01),
					maxBet: loaded.maxBet || (loaded.max_bet ? loaded.max_bet / 1_000_000 : 100),
					rtpTarget: loaded.rtpTarget || loaded.rtp_target || 96.5,
					houseEdge: loaded.houseEdge || loaded.house_edge || 3.5,
					maxPaylines: loaded.maxPaylines || loaded.max_paylines || 20
				};
			}
		} else if (currentConfig) {
			const detectedGameType = gameType || detectGameTypeFromUrl(gameUrl);

			if (detectedGameType === 'w2w') {
				configPayload = {
					contractId: '123456',
					minBet: currentConfig.minBet,
					maxBet: currentConfig.maxBet,
					rtpTarget: currentConfig.rtpTarget,
					houseEdge: currentConfig.houseEdge,
					jackpotAmount: currentConfig.jackpotAmount || 10000,
					bonusSpinMultiplier: currentConfig.bonusSpinMultiplier || 1.5,
					modeEnabled: 7
				};
			} else {
				configPayload = {
					contractId: '123456',
					minBet: currentConfig.minBet,
					maxBet: currentConfig.maxBet,
					rtpTarget: currentConfig.rtpTarget,
					houseEdge: currentConfig.houseEdge,
					maxPaylines: currentConfig.maxPaylines || 20
				};
			}
		} else {
			// Use default template
			const detectedGameType = gameType || detectGameTypeFromUrl(gameUrl);
			const template = detectedGameType === 'w2w'
				? gameResponseTemplates.CONFIG_W2W()
				: gameResponseTemplates.CONFIG_5REEL();
			configPayload = template.payload;
		}

		const configMessage: GameResponse = {
			namespace: MESSAGE_NAMESPACE,
			type: 'CONFIG',
			payload: configPayload as any
		};

		sendResponseToGame(configMessage);
	}

	// Handle outcome selection from toast
	function handleOutcomeSelection(outcome: OutcomeOption) {
		console.log('[Testing Page] Outcome selected:', outcome);

		const detectedGameType = gameType || detectGameTypeFromUrl(gameUrl);
		const spinId = pendingSpinId || lastSpinId || generateSpinId();

		switch (outcome.type) {
			case 'random-win': {
				// Generate a realistic medium win grid
				const grid =
					detectedGameType === 'w2w' ? generateW2WMediumWinGrid() : generate5ReelMediumWinGrid();
				// Calculate actual winnings from the grid
				const calculatedWins =
					detectedGameType === 'w2w'
						? calculateW2WPayouts(grid)
						: evaluatePaylines(grid, DEFAULT_PAYLINE_PATTERNS.slice(0, 10), DEFAULT_PAYTABLE, 0.1);
				const totalPayout =
					detectedGameType === 'w2w'
						? calculatedWins.reduce((sum, w) => sum + w.payout, 0)
						: calculatedWins.reduce((sum, w) => sum + w.payout, 0);
				sendOutcome(detectedGameType, 'medium', totalPayout, false, 0, spinId, grid);
				break;
			}
			case 'big-win': {
				// Generate a realistic big win grid
				const grid =
					detectedGameType === 'w2w' ? generateW2WBigWinGrid() : generate5ReelBigWinGrid();
				const calculatedWins =
					detectedGameType === 'w2w'
						? calculateW2WPayouts(grid)
						: evaluatePaylines(grid, DEFAULT_PAYLINE_PATTERNS.slice(0, 10), DEFAULT_PAYTABLE, 0.1);
				const totalPayout =
					detectedGameType === 'w2w'
						? calculatedWins.reduce((sum, w) => sum + w.payout, 0)
						: calculatedWins.reduce((sum, w) => sum + w.payout, 0);
				sendOutcome(detectedGameType, 'large', totalPayout, false, 0, spinId, grid);
				break;
			}
			case 'jackpot': {
				// W2W: Generate jackpot grid (3+ HOV), 5reel: use big win grid
				const grid = detectedGameType === 'w2w' ? generateW2WJackpotGrid() : generate5ReelBigWinGrid();
				sendOutcome(detectedGameType, 'jackpot', 10000, true, 0, spinId, grid);
				break;
			}
			case 'bonus-spins': {
				// W2W only: Generate bonus grid (2+ BONUS symbols)
				const grid = generateW2WBonusGrid();
				sendOutcome(detectedGameType, 'none', 0, false, 8, spinId, grid);
				break;
			}
			case 'loss': {
				// Generate a loss grid with no matches
				const grid = detectedGameType === 'w2w' ? generateW2WLossGrid() : generate5ReelLossGrid();
				sendOutcome(detectedGameType, 'none', 0, false, 0, spinId, grid);
				break;
			}
			case 'custom-grid': {
				const grid = outcome.grid;
				let winnings = 0;
				let jackpotHit = false;
				let bonusSpins = 0;
				let winLevel: 'none' | 'small' | 'medium' | 'large' | 'jackpot' = 'none';

				if (detectedGameType === 'w2w') {
					// Calculate actual wins from the grid
					const calculatedWins = calculateW2WPayouts(grid as SymbolId[][]);
					winnings = calculatedWins.reduce((sum, w) => sum + w.payout, 0);

					// Check for jackpot trigger (3+ HOV symbols)
					if (isJackpotTriggered(grid as SymbolId[][])) {
						jackpotHit = true;
						winnings = 10000; // Jackpot amount
						winLevel = 'jackpot';
					} else if (winnings > 0) {
						// Determine win level based on payout
						if (winnings >= 5000) winLevel = 'large';
						else if (winnings >= 1000) winLevel = 'medium';
						else winLevel = 'small';
					}

					// Check for bonus trigger (2+ BONUS symbols)
					if (isBonusTriggered(grid as SymbolId[][])) {
						bonusSpins = 8;
					}
				} else {
					// 5reel: Calculate wins from paylines
					const calculatedWins = evaluatePaylines(
						grid as SymbolId[][],
						DEFAULT_PAYLINE_PATTERNS.slice(0, 10),
						DEFAULT_PAYTABLE,
						0.1
					);
					winnings = calculatedWins.reduce((sum, w) => sum + w.payout, 0);

					if (winnings > 0) {
						// Determine win level based on payout
						if (winnings >= 100) winLevel = 'large';
						else if (winnings >= 10) winLevel = 'medium';
						else winLevel = 'small';
					}
				}

				console.log('[Testing] Custom grid outcome:', {
					grid,
					winnings,
					jackpotHit,
					bonusSpins,
					winLevel
				});

				sendOutcome(detectedGameType, winLevel, winnings, jackpotHit, bonusSpins, spinId, grid);
				break;
			}
		}

		pendingSpinId = null;
		lastSpinId = null;
	}

	function dismissToast() {
		pendingSpinId = null;
	}

	// Send outcome to game (SPIN_SUBMITTED was already sent when request was received)
	function sendOutcome(
		gameType: GameType | null,
		winLevel: 'none' | 'small' | 'medium' | 'large' | 'jackpot',
		winnings: number,
		jackpotHit: boolean = false,
		bonusSpins: number = 0,
		spinIdOverride?: string,
		customGrid?: string[][]
	) {
		const spinId = spinIdOverride || lastSpinId || generateSpinId();

		let outcome: GameResponse;

		if (gameType === 'w2w') {
			outcome = gameResponseTemplates.OUTCOME_W2W();
			const payload = outcome.payload as any;

			// Use custom grid if provided and calculate actual wins
			if (customGrid) {
				payload.grid = customGrid;
				// Calculate actual waysWins from the custom grid
				const calculatedWins = calculateW2WPayouts(customGrid as SymbolId[][]);
				payload.waysWins = calculatedWins;
				console.log('[Testing] Calculated W2W wins from custom grid:', calculatedWins);
			}

			payload.winnings = winnings;
			// If bonus spins are awarded, treat it as a win even if winnings are 0
			if (bonusSpins > 0) {
				payload.winLevel = 'small';
				payload.isWin = true;
			} else {
				payload.winLevel = winLevel;
				payload.isWin = winnings > 0;
			}
			payload.jackpotHit = jackpotHit;
			if (jackpotHit) {
				payload.jackpotAmount = winnings;
			}
			payload.bonusSpinsAwarded = bonusSpins;
			payload.spinId = spinId;
			// Clear waysWins for losses (no winnings, no jackpot, and no bonus spins)
			if (winnings === 0 && !jackpotHit && bonusSpins === 0) {
				payload.waysWins = [];
			}
		} else {
			outcome = gameResponseTemplates.OUTCOME_5REEL();
			const payload = outcome.payload as any;

			// Use custom grid if provided and calculate actual wins
			if (customGrid) {
				payload.grid = customGrid;
				// Calculate actual winningLines from the custom grid
				const paylines = (payload.paylines as number) || 10;
				const betPerLine = (payload.betPerLine as number) || 0.1;
				const selectedPaylines = DEFAULT_PAYLINE_PATTERNS.slice(0, paylines);
				const calculatedWins = evaluatePaylines(
					customGrid as SymbolId[][],
					selectedPaylines,
					DEFAULT_PAYTABLE,
					betPerLine
				);
				payload.winningLines = calculatedWins;
				console.log('[Testing] Calculated 5reel wins from custom grid:', calculatedWins);
			}

			payload.winnings = winnings;
			payload.winLevel = winLevel;
			payload.isWin = winnings > 0;
			payload.spinId = spinId;
			// Clear winningLines for losses
			if (winnings === 0) {
				payload.winningLines = [];
			}
		}

		// Calculate balance values for the outcome message
		// New balance after winnings are applied
		const balanceAfterOutcome = roundBalance(currentBalance + winnings);
		// Reserved balance after this spin is completed (exclude this spin's bet from reserved)
		const existingReserved = spinQueue
			.filter(s => s.status === 'pending' || s.status === 'submitted')
			.reduce((sum, s) => sum + s.betAmount, 0);
		// Find this spin's bet amount to subtract from reserved
		const thisSpinItem = spinQueue.find(s => s.spinId === spinId || s.clientSpinId === spinId);
		const thisSpinBet = thisSpinItem?.betAmount || 0;
		const reservedAfterOutcome = Math.max(0, existingReserved - thisSpinBet);

		// Set balance values in payload
		(outcome.payload as any).availableBalance = balanceAfterOutcome;
		(outcome.payload as any).reserved = reservedAfterOutcome;

		sendResponseToGame(outcome);

		// Update spin in queue with completed status and outcome
		const outcomePayload = outcome.payload as any;
		if (gameType === 'w2w') {
			updateSpinInQueue(spinId, {
				status: 'completed',
				outcome: {
					grid: outcomePayload.grid,
					winnings,
					isWin: winnings > 0 || bonusSpins > 0,
					winLevel,
					waysWins: outcomePayload.waysWins,
					bonusSpinsAwarded: bonusSpins,
					jackpotHit,
					jackpotAmount: jackpotHit ? winnings : undefined
				}
			});
		} else {
			updateSpinInQueue(spinId, {
				status: 'completed',
				outcome: {
					grid: outcomePayload.grid,
					winnings,
					isWin: winnings > 0,
					winLevel,
					winningLines: outcomePayload.winningLines
				}
			});
		}

		// Add winnings back to balance and send update
		if (winnings > 0) {
			currentBalance = roundBalance(currentBalance + winnings);
			sendBalanceUpdate(currentBalance);
		}

		// Handle bonus spins for W2W games - batch process them
		if (gameType === 'w2w' && bonusSpins > 0) {
			currentBonusSpins += bonusSpins;
			sendCreditBalanceUpdate(currentCredits, currentBonusSpins);
			processBonusSpinSequence(spinId, bonusSpins);
		}

		// Clear the pending spin and lastSpinId
		pendingSpinId = null;
		lastSpinId = null;
	}

	// Send balance update to game (balance is in VOI normalized)
	function sendBalanceUpdate(balance: number) {
		const balanceMessage: GameResponse = {
			namespace: MESSAGE_NAMESPACE,
			type: 'BALANCE_UPDATE',
			payload: {
				balance,
				availableBalance: balance
			}
		};

		sendResponseToGame(balanceMessage);
	}

	// Send credit balance update to game (W2W only)
	function sendCreditBalanceUpdate(credits: number, bonusSpins: number) {
		const creditMessage: GameResponse = {
			namespace: MESSAGE_NAMESPACE,
			type: 'CREDIT_BALANCE',
			payload: {
				credits,
				bonusSpins,
				spinCount: 0
			}
		};

		sendResponseToGame(creditMessage);
	}

	// Spin queue helper functions
	function sendSpinQueueUpdate() {
		const pendingCount = spinQueue.filter(s => s.status === 'pending' || s.status === 'submitted').length;
		// Calculate reserved balance from pending spins
		const reservedBalance = spinQueue
			.filter(s => s.status === 'pending' || s.status === 'submitted')
			.reduce((sum, s) => sum + s.betAmount, 0);

		// Use $state.snapshot() to convert the Svelte 5 reactive proxy to a plain array
		// This is required because postMessage uses structured clone, which can't handle proxies
		const queueSnapshot = $state.snapshot(spinQueue);

		const queueMessage: SpinQueueMessage = {
			namespace: MESSAGE_NAMESPACE,
			type: 'SPIN_QUEUE',
			payload: {
				queue: queueSnapshot,
				pendingCount,
				reservedBalance
			}
		};

		sendResponseToGame(queueMessage);
	}

	function addSpinToQueue(spinId: string, clientSpinId: string | undefined, params: {
		betAmount?: number;
		mode?: number;
		paylines?: number;
		betPerLine?: number;
	}): void {
		const queueItem: QueuedSpinItem = {
			spinId,
			clientSpinId,
			betAmount: params.betAmount || 0,
			mode: params.mode,
			paylines: params.paylines,
			betPerLine: params.betPerLine,
			timestamp: Date.now(),
			status: 'pending'
		};

		spinQueue = [...spinQueue, queueItem];
		trimQueue();
		sendSpinQueueUpdate();
	}

	function addSpinToQueueAsSubmitted(spinId: string, clientSpinId: string | undefined, params: {
		betAmount?: number;
		mode?: number;
		paylines?: number;
		betPerLine?: number;
	}): void {
		const queueItem: QueuedSpinItem = {
			spinId,
			clientSpinId,
			betAmount: params.betAmount || 0,
			mode: params.mode,
			paylines: params.paylines,
			betPerLine: params.betPerLine,
			timestamp: Date.now(),
			status: 'submitted'
		};

		spinQueue = [...spinQueue, queueItem];
		trimQueue();
		sendSpinQueueUpdate();
	}

	function updateSpinInQueue(spinId: string, updates: Partial<QueuedSpinItem>): void {
		const index = spinQueue.findIndex(s => s.spinId === spinId || s.clientSpinId === spinId);
		if (index !== -1) {
			spinQueue = spinQueue.map((s, i) =>
				i === index ? { ...s, ...updates } : s
			);
			sendSpinQueueUpdate();
		}
	}

	function trimQueue(): void {
		if (spinQueue.length <= maxQueueSize) return;

		// Sort by status (pending/submitted first) and then by timestamp
		const pending = spinQueue.filter(s => s.status === 'pending' || s.status === 'submitted');
		const completed = spinQueue.filter(s => s.status === 'completed' || s.status === 'failed');

		// Keep all pending and trim completed to fit
		const maxCompleted = maxQueueSize - pending.length;
		const trimmedCompleted = completed.slice(-maxCompleted); // Keep most recent

		spinQueue = [...pending, ...trimmedCompleted];
	}

	// Auto-respond to game requests
	function autoRespondToMessage(message: GameRequest) {
		if (!iframeElement || !iframeElement.contentWindow) {
			console.log('[Auto-Respond] Skipped: no iframe');
			return;
		}

		const messageType = message.type;
		console.log('[Auto-Respond] Handling:', messageType);

		switch (messageType) {
			case 'INIT':
				// Send CONFIG immediately on init
				sendConfigToGame();
				// Also send initial balance
				sendBalanceUpdate(currentBalance);
				// Send initial credit balance for W2W games
				const detectedGameTypeOnInit = gameType || detectGameTypeFromUrl(gameUrl);
				if (detectedGameTypeOnInit === 'w2w') {
					sendCreditBalanceUpdate(currentCredits, currentBonusSpins);
				}
				// Send current spin queue state
				sendSpinQueueUpdate();
				return;

			case 'GET_CONFIG':
				sendConfigToGame();
				return;

			case 'GET_BALANCE':
				sendBalanceUpdate(currentBalance);
				return;

			case 'GET_CREDIT_BALANCE':
				sendCreditBalanceUpdate(currentCredits, currentBonusSpins);
				return;

			case 'GET_SPIN_QUEUE':
				sendSpinQueueUpdate();
				return;

			case 'SPIN_REQUEST': {
				// Guard: reject bonus spin requests during batch processing
				const spinReqPayload = message.payload as {
					reserved?: number;
					mode?: number;
				};
				if (bonusProcessing && (spinReqPayload.reserved === 1 || spinReqPayload.mode === 0)) {
					sendResponseToGame({
						namespace: MESSAGE_NAMESPACE,
						type: 'ERROR',
						payload: {
							code: 'BONUS_PROCESSING',
							message: 'Bonus spins are being processed server-side. Please wait.',
							recoverable: true,
							requestId: (spinReqPayload as any).spinId
						}
					});
					return;
				}

				// Add spin to queue - user will select outcome from queue panel
				const spinRequestPayload = message.payload as {
					spinId?: string;
					paylines?: number;
					betPerLine?: number;
					betAmount?: number;
					reserved?: number;
					mode?: number;
				};
				const spinId = spinRequestPayload.spinId || generateSpinId();
				lastSpinId = spinId;
				// Don't set pendingSpinId here - user will select from queue

				// Calculate bet amount based on game type
				const detectedGameType = gameType || detectGameTypeFromUrl(gameUrl);
				let betAmount = 0;

				if (detectedGameType === '5reel') {
					// 5reel format: paylines * betPerLine (both in VOI normalized)
					if (spinRequestPayload.paylines && spinRequestPayload.betPerLine) {
						betAmount = spinRequestPayload.paylines * spinRequestPayload.betPerLine;
					}
				} else if (detectedGameType === 'w2w') {
					// W2W format: betAmount (in VOI normalized)
					// Only deduct if it's a regular spin (reserved === 0) and betAmount > 0
					// Bonus spins (reserved === 1) have betAmount = 0, so no deduction
					if (spinRequestPayload.reserved === 0 && spinRequestPayload.betAmount) {
						betAmount = spinRequestPayload.betAmount;
					}

					// Handle bonus spin usage (reserved === 1)
					if (spinRequestPayload.reserved === 1) {
						if (currentBonusSpins > 0) {
							currentBonusSpins = Math.max(0, currentBonusSpins - 1);
							// Send updated credit balance after decrementing bonus spin
							sendCreditBalanceUpdate(currentCredits, currentBonusSpins);
						}
					}
				}

				// Deduct bet from balance (only if betAmount > 0)
				if (betAmount > 0) {
					currentBalance = roundBalance(Math.max(0, currentBalance - betAmount));
					// Send balance update immediately after deducting
					sendBalanceUpdate(currentBalance);
				}

				// Acknowledge the spin with SPIN_SUBMITTED after a small delay
				setTimeout(() => {
					// Calculate total reserved: existing pending spins + this new bet
					const existingReserved = spinQueue
						.filter(s => s.status === 'pending' || s.status === 'submitted')
						.reduce((sum, s) => sum + s.betAmount, 0);
					const totalReserved = existingReserved + betAmount;

					const spinSubmittedAck: GameResponse = {
						namespace: MESSAGE_NAMESPACE,
						type: 'SPIN_SUBMITTED',
						payload: {
							spinId,
							txId: 'test-tx-' + Date.now(),
							availableBalance: currentBalance,
							reserved: totalReserved
						}
					};
					sendResponseToGame(spinSubmittedAck);

					// Add spin to queue with 'submitted' status - user selects outcome from queue
					addSpinToQueueAsSubmitted(spinId, spinRequestPayload.spinId, {
						betAmount,
						mode: spinRequestPayload.mode,
						paylines: spinRequestPayload.paylines,
						betPerLine: spinRequestPayload.betPerLine
					});
				}, 100);

				console.log('[Auto-Respond] SPIN_REQUEST acknowledged with spinId:', spinId, 'betAmount:', betAmount, 'reserved:', spinRequestPayload.reserved);
				return;
			}

			case 'EXIT':
				console.log('[Auto-Respond] Game requested exit');
				break;
		}
	}

	// Send a response to the game and log it
	function sendResponseToGame(response: GameResponse) {
		if (!iframeElement || !iframeElement.contentWindow) return;

		iframeElement.contentWindow.postMessage(response, '*');

		// Log the sent message
		const loggedMessage: LoggedMessage = {
			id: crypto.randomUUID(),
			timestamp: Date.now(),
			direction: 'sent',
			message: response,
			messageType: response.type
		};

		messages = [...messages, loggedMessage];
	}

	// Listen for messages from iframe
	function handleMessageFromIframe(event: MessageEvent) {
		// Only process messages from our iframe origin
		if (!gameUrl) return;

		const message = event.data;

		// Validate namespace
		if (!message || typeof message !== 'object' || message.namespace !== MESSAGE_NAMESPACE) {
			console.log('[Message] Ignored - invalid namespace:', message);
			return;
		}

		console.log('[Message] Received from game:', message.type, message);

		// Log the message
		const loggedMessage: LoggedMessage = {
			id: crypto.randomUUID(),
			timestamp: Date.now(),
			direction: 'received',
			message: message as GameRequest | GameResponse,
			messageType: message.type || 'UNKNOWN'
		};

		messages = [...messages, loggedMessage];

		// Auto-respond - always enabled
		const isRequest = isGameRequest(message);
		console.log('[Message] Is game request?', isRequest);

		if (isRequest) {
			autoRespondToMessage(message as GameRequest);
		}
	}

	// Clear message log
	function handleClearLog() {
		if (confirm('Clear all logged messages?')) {
			messages = [];
		}
	}

	// Clear spin queue
	function handleClearQueue() {
		if (confirm('Clear all queued spins?')) {
			spinQueue = [];
			sendSpinQueueUpdate();
		}
	}

	// Select a spin from the queue to respond to
	function handleSelectSpin(spinId: string) {
		pendingSpinId = spinId;
		lastSpinId = spinId;
	}

	// Setup message listener
	onMount(() => {
		window.addEventListener('message', handleMessageFromIframe);

		return () => {
			window.removeEventListener('message', handleMessageFromIframe);
		};
	});
</script>

<svelte:head>
	<title>PostMessage API Tester - House of Voi</title>
</svelte:head>

<div class="testing-page" class:overlay-stuck={isOverlayStuck}>
	<!-- Game Iframe -->
	<div class="iframe-container">
		{#if gameUrl}
			<iframe
				bind:this={iframeElement}
				src={gameUrl}
				title="Game Testing Iframe"
				class="game-iframe"
				allow="clipboard-write"
			></iframe>
		{:else}
			<div class="empty-iframe">
				<svg
					width="64"
					height="64"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1"
				>
					<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
					<line x1="8" y1="21" x2="16" y2="21" />
					<line x1="12" y1="17" x2="12" y2="21" />
				</svg>
				<div class="empty-title">No Game Loaded</div>
				<div class="empty-subtitle">Use the overlay to load a game</div>
			</div>
		{/if}
	</div>

	<!-- Testing Overlay -->
	<TestingOverlay
		{gameType}
		bind:gameUrl={gameUrl}
		{messages}
		{stats}
		currentBalance={currentBalance}
		pendingSpinId={pendingSpinId}
		{spinQueue}
		{bonusProcessing}
		{bonusProgress}
		bind:isStuck={isOverlayStuck}
		onClearLog={handleClearLog}
		onClearQueue={handleClearQueue}
		onSelectSpin={handleSelectSpin}
		onUrlChange={handleUrlChange}
		onGameTypeChange={handleGameTypeChange}
		onConfigChange={handleConfigChange}
		onConfigLoaded={handleConfigLoaded}
		onBalanceUpdate={(balanceInVOI) => {
			currentBalance = roundBalance(balanceInVOI);
			sendBalanceUpdate(currentBalance);
		}}
		onOutcomeSelected={handleOutcomeSelection}
		onDismissToast={dismissToast}
		onStuckChange={(stuck) => {
			isOverlayStuck = stuck;
		}}
	/>
</div>

<style>
	.testing-page {
		position: relative;
		width: 100vw;
		height: 100vh;
		background: #f3f4f6;
		overflow: hidden;
		display: flex;
	}

	.iframe-container {
		flex: 1;
		height: 100%;
		position: relative;
		overflow: hidden;
		margin-left: 0;
		transition: margin-left 0.3s ease;
	}

	.testing-page.overlay-stuck .iframe-container {
		margin-left: 400px;
	}

	.game-iframe {
		width: 100%;
		height: 100%;
		border: none;
		background: white;
	}

	.empty-iframe {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: #9ca3af;
	}

	.empty-iframe svg {
		margin-bottom: 1.5rem;
	}

	.empty-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: #6b7280;
		margin-bottom: 0.5rem;
	}

	.empty-subtitle {
		font-size: 1rem;
		color: #9ca3af;
	}
</style>
