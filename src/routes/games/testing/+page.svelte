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
	import type { GameRequest, GameResponse, OutcomeMessage } from '$lib/game-engine/bridge/types';
	import { MESSAGE_NAMESPACE, isGameRequest } from '$lib/game-engine/bridge/types';

	// Helper function to round balance to 6 decimal places
	function roundBalance(balance: number): number {
		return Math.round(balance * 1_000_000) / 1_000_000;
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
			case 'random-win':
				sendOutcome(detectedGameType, 'medium', Math.random() * 1000 + 100, false, 0, spinId);
				break;
			case 'big-win':
				sendOutcome(detectedGameType, 'large', Math.random() * 5000 + 1000, false, 0, spinId);
				break;
			case 'jackpot':
				sendOutcome(detectedGameType, 'jackpot', 10000, true, 0, spinId);
				break;
			case 'bonus-spins':
				sendOutcome(detectedGameType, 'none', 0, false, 8, spinId);
				break;
			case 'loss':
				sendOutcome(detectedGameType, 'none', 0, false, 0, spinId);
				break;
			case 'custom':
				sendOutcome(
					detectedGameType,
					outcome.winLevel as 'none' | 'small' | 'medium' | 'large' | 'jackpot',
					outcome.winnings,
					outcome.winLevel === 'jackpot',
					outcome.bonusSpins || 0,
					spinId
				);
				break;
		}

		pendingSpinId = null;
		lastSpinId = null;
	}

	function dismissToast() {
		pendingSpinId = null;
	}

	// Send outcome to game
	function sendOutcome(
		gameType: GameType | null,
		winLevel: 'none' | 'small' | 'medium' | 'large' | 'jackpot',
		winnings: number,
		jackpotHit: boolean = false,
		bonusSpins: number = 0,
		spinIdOverride?: string
	) {
		const spinId = spinIdOverride || lastSpinId || generateSpinId();

		// 1. Send SPIN_SUBMITTED first to acknowledge the spin
		const spinSubmitted: GameResponse = {
			namespace: MESSAGE_NAMESPACE,
			type: 'SPIN_SUBMITTED',
			payload: {
				spinId,
				txId: 'test-tx-' + Date.now()
			}
		};
		sendResponseToGame(spinSubmitted);

		// 2. Then send OUTCOME after a small delay
		setTimeout(() => {
			let outcome: GameResponse;

			if (gameType === 'w2w') {
				outcome = gameResponseTemplates.OUTCOME_W2W();
				const payload = outcome.payload as any;
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
				payload.winnings = winnings;
				payload.winLevel = winLevel;
				payload.isWin = winnings > 0;
				payload.spinId = spinId;
				// Clear winningLines for losses
				if (winnings === 0) {
					payload.winningLines = [];
				}
			}

			sendResponseToGame(outcome);

			// Add winnings back to balance and send update
			if (winnings > 0) {
				currentBalance = roundBalance(currentBalance + winnings);
				sendBalanceUpdate(currentBalance);
			}

			// Handle bonus spins for W2W games
			if (gameType === 'w2w' && bonusSpins > 0) {
				currentBonusSpins += bonusSpins;
				// Send credit balance update after a short delay to ensure outcome is processed first
				setTimeout(() => {
					sendCreditBalanceUpdate(currentCredits, currentBonusSpins);
				}, 100);
			}

			// Clear the lastSpinId so we're ready for the next spin
			lastSpinId = null;
		}, 500); // Small delay to simulate network
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

			case 'SPIN_REQUEST':
				// Save spinId and show toast for outcome selection
				const spinRequestPayload = message.payload as {
					spinId?: string;
					paylines?: number;
					betPerLine?: number;
					betAmount?: number;
					reserved?: number;
				};
				const spinId = spinRequestPayload.spinId || generateSpinId();
				lastSpinId = spinId;
				pendingSpinId = spinId;
				
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
				
				console.log('[Auto-Respond] SPIN_REQUEST received with spinId:', spinId, 'betAmount:', betAmount, 'reserved:', spinRequestPayload.reserved);
				// Show toast - don't send outcome automatically
				return;

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
		bind:isStuck={isOverlayStuck}
		onClearLog={handleClearLog}
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
