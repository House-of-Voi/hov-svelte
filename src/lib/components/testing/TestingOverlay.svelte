<script lang="ts">
	import { onMount } from 'svelte';
	import GameSelector from './GameSelector.svelte';
	import ConfigEditor, { type ConfigValues } from './ConfigEditor.svelte';
	import EventMonitor from './EventMonitor.svelte';
	import MessageLog from './MessageLog.svelte';
	import SpinQueuePanel from './SpinQueuePanel.svelte';
	import SpinOutcomeToast, { type OutcomeOption } from './SpinOutcomeToast.svelte';
	import type { LoggedMessage, MessageStats } from '$lib/testing/types';
	import type { GameType } from '$lib/testing/messageTemplates';
	import type { GameRequest, GameResponse, QueuedSpinItem } from '$lib/game-engine/bridge/types';

	interface Props {
		gameType: GameType | null;
		gameUrl: string;
		messages: LoggedMessage[];
		stats: MessageStats;
		currentBalance: number;
		pendingSpinId: string | null;
		spinQueue: QueuedSpinItem[];
		isStuck: boolean;
		onClearLog: () => void;
		onClearQueue?: () => void;
		onSelectSpin?: (spinId: string) => void;
		onUrlChange: (url: string) => void;
		onGameTypeChange: (type: GameType | null) => void;
		onConfigChange: (config: ConfigValues) => void;
		onConfigLoaded?: (config: unknown) => void;
		onBalanceUpdate: (balance: number) => void;
		onOutcomeSelected: (outcome: OutcomeOption) => void;
		onDismissToast: () => void;
		onStuckChange: (stuck: boolean) => void;
	}

	let {
		gameType = null,
		gameUrl = $bindable(''),
		messages = [],
		stats,
		currentBalance,
		pendingSpinId = null,
		spinQueue = [],
		isStuck: isStuckProp = $bindable(true),
		onClearLog,
		onClearQueue,
		onSelectSpin,
		onUrlChange,
		onGameTypeChange,
		onConfigChange,
		onConfigLoaded,
		onBalanceUpdate,
		onOutcomeSelected,
		onDismissToast,
		onStuckChange
	}: Props = $props();

	let isStuck = $state(isStuckProp);

	// Overlay state
	let isCollapsed = $state(false);
	let activeTab = $state<'game' | 'queue' | 'monitor' | 'log'>('game');

	// Derived queue stats for tab badge
	let pendingQueueCount = $derived(spinQueue.filter(s => s.status === 'pending' || s.status === 'submitted').length);
	let isDragging = $state(false);
	let newBalance = $state(currentBalance); // Balance is already in VOI

	// Sync newBalance when currentBalance changes from parent
	$effect(() => {
		newBalance = currentBalance;
	});

	// Stuck/overlay mode state with localStorage persistence
	const STUCK_STORAGE_KEY = 'hov-testing-overlay-stuck';
	const POSITION_STORAGE_KEY = 'hov-testing-overlay-position';

	let position = $state({ x: 20, y: 20 });

	// Load stuck state and position from localStorage on mount
	onMount(() => {
		const storedStuck = localStorage.getItem(STUCK_STORAGE_KEY);
		if (storedStuck !== null) {
			isStuck = storedStuck === 'true';
			isStuckProp = isStuck;
		}

		const storedPosition = localStorage.getItem(POSITION_STORAGE_KEY);
		if (storedPosition) {
			try {
				position = JSON.parse(storedPosition);
			} catch {
				position = { x: 20, y: 20 };
			}
		}

		// Setup drag event listeners (only when not stuck)
		if (!isStuck) {
			const handleMove = (e: MouseEvent) => handleMouseMove(e);
			const handleUp = (e: MouseEvent) => handleMouseUp(e);

			document.addEventListener('mousemove', handleMove);
			document.addEventListener('mouseup', handleUp);

			return () => {
				document.removeEventListener('mousemove', handleMove);
				document.removeEventListener('mouseup', handleUp);
			};
		}
	});

	let dragOffset = $state({ x: 0, y: 0 });

	// Save stuck state to localStorage
	$effect(() => {
		if (typeof window !== 'undefined') {
			localStorage.setItem(STUCK_STORAGE_KEY, String(isStuck));
		}
	});

	// Save position to localStorage (only when not stuck)
	$effect(() => {
		if (typeof window !== 'undefined' && !isStuck) {
			localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
		}
	});

	// Setup/teardown drag listeners when stuck state changes
	$effect(() => {
		if (isStuck) {
			isDragging = false;
		} else {
			// Re-setup drag listeners when switching to overlay mode
			const handleMove = (e: MouseEvent) => handleMouseMove(e);
			const handleUp = (e: MouseEvent) => handleMouseUp(e);
			document.addEventListener('mousemove', handleMove);
			document.addEventListener('mouseup', handleUp);
			return () => {
				document.removeEventListener('mousemove', handleMove);
				document.removeEventListener('mouseup', handleUp);
			};
		}
	});

	function toggleStuck() {
		isStuck = !isStuck;
		isStuckProp = isStuck;
		onStuckChange?.(isStuck);
	}

	// Sync isStuck with prop changes
	$effect(() => {
		if (isStuckProp !== isStuck) {
			isStuck = isStuckProp;
		}
	});

	function handleMouseDown(e: MouseEvent) {
		const target = e.target as HTMLElement;
		// Only drag if not clicking on buttons or interactive elements
		if (target.closest('button') || target.closest('input') || target.closest('select')) {
			return;
		}

		isDragging = true;
		dragOffset = {
			x: e.clientX - position.x,
			y: e.clientY - position.y
		};
		e.preventDefault();
		e.stopPropagation();
	}

	function handleMouseMove(e: MouseEvent) {
		if (isDragging) {
			e.preventDefault();
			position = {
				x: e.clientX - dragOffset.x,
				y: e.clientY - dragOffset.y
			};
		}
	}

	function handleMouseUp(e: MouseEvent) {
		if (isDragging) {
			isDragging = false;
			e.preventDefault();
		}
	}

	function toggleCollapsed() {
		isCollapsed = !isCollapsed;
	}
</script>

<div
	class="testing-overlay"
	class:collapsed={isCollapsed}
	class:dragging={isDragging}
	class:stuck={isStuck}
	style={isStuck ? '' : `left: ${position.x}px; top: ${position.y}px;`}
>
	{#if pendingSpinId}
		<div class="toast-container">
			<SpinOutcomeToast
				spinId={pendingSpinId}
				{gameType}
				onSelectOutcome={onOutcomeSelected}
				onDismiss={onDismissToast}
			/>
		</div>
	{/if}
	<!-- Header -->
	<div
		class="overlay-header"
		class:drag-handle={!isStuck}
		onmousedown={!isStuck ? handleMouseDown : undefined}
	>
		<div class="header-left">
			<div class="header-icon">
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
				</svg>
			</div>
			<div class="header-title">PostMessage Tester</div>
		</div>
		<div class="header-actions">
			<button
				onclick={toggleStuck}
				class="header-btn"
				title={isStuck ? 'Pop out as overlay' : 'Stick to side'}
			>
				{#if isStuck}
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
					</svg>
				{:else}
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
					</svg>
				{/if}
			</button>
			<button onclick={toggleCollapsed} class="header-btn" title={isCollapsed ? 'Expand' : 'Collapse'}>
				{#if isCollapsed}
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M18 15l-6-6-6 6" />
					</svg>
				{:else}
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M6 9l6 6 6-6" />
					</svg>
				{/if}
			</button>
		</div>
	</div>

	{#if !isCollapsed}
		<!-- Stats Bar -->
		<div class="stats-bar">
			<div class="stat">
				<span class="stat-label">Sent:</span>
				<span class="stat-value">{stats.totalSent}</span>
			</div>
			<div class="stat">
				<span class="stat-label">Received:</span>
				<span class="stat-value">{stats.totalReceived}</span>
			</div>
			<div class="stat">
				<span class="stat-label">Errors:</span>
				<span class="stat-value error">{stats.errors}</span>
			</div>
			{#if gameType}
				<div class="stat">
					<span class="stat-label">Type:</span>
					<span class="stat-value type">{gameType}</span>
				</div>
			{/if}
		</div>

		<!-- Tabs -->
		<div class="tabs">
			<button class="tab" class:active={activeTab === 'game'} onclick={() => (activeTab = 'game')}>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
					<path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
				</svg>
				Game
			</button>
			<button class="tab" class:active={activeTab === 'queue'} onclick={() => (activeTab = 'queue')}>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5"/>
					<path d="M21 3l-9 9M3 21l9-9"/>
				</svg>
				Queue
				{#if pendingQueueCount > 0}
					<span class="queue-badge">{pendingQueueCount}</span>
				{/if}
			</button>
			<button class="tab" class:active={activeTab === 'log'} onclick={() => (activeTab = 'log')}>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
				</svg>
				Log ({messages.length})
			</button>
			<button
				class="tab"
				class:active={activeTab === 'monitor'}
				onclick={() => (activeTab = 'monitor')}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<circle cx="12" cy="12" r="10" />
					<path d="M12 6v6l4 2" />
				</svg>
				Monitor
			</button>
		</div>

		<!-- Tab Content -->
		<div class="tab-content">
			{#if activeTab === 'game'}
				<div class="game-tab">
					<GameSelector
						bind:currentUrl={gameUrl}
						currentGameType={gameType}
						{onUrlChange}
						{onGameTypeChange}
					/>
					{#if gameType}
						<div class="divider"></div>
						<div class="balance-section">
							<h4 class="balance-title">Balance</h4>
							<div class="balance-input-group">
								<input
									type="number"
									step="1"
									bind:value={newBalance}
									placeholder="Enter balance (VOI)"
									class="balance-input"
								/>
								<button
									onclick={() => onBalanceUpdate(newBalance)}
									class="balance-update-btn"
								>
									Update
								</button>
							</div>
							<div class="current-balance">
								Current: {currentBalance.toFixed(6)} VOI
							</div>
						</div>
						<div class="divider"></div>
						<ConfigEditor {gameType} onConfigChange={onConfigChange} onConfigLoaded={onConfigLoaded} />
					{:else}
						<div class="select-game-type-prompt">
							<p class="prompt-text">Please select a game type above to continue</p>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'queue'}
				<SpinQueuePanel
					queue={spinQueue}
					selectedSpinId={pendingSpinId}
					onClearQueue={onClearQueue}
					onSelectSpin={onSelectSpin}
				/>
			{:else if activeTab === 'monitor'}
				<EventMonitor {messages} />
			{:else if activeTab === 'log'}
				<MessageLog {messages} onClear={onClearLog} />
			{/if}
		</div>
	{/if}
</div>

<style>
	.testing-overlay {
		position: fixed;
		width: 400px;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 0.75rem;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
		z-index: 9999;
		display: flex;
		flex-direction: column;
		max-height: calc(100vh - 40px);
		overflow: hidden;
		transition: left 0.3s ease, top 0.3s ease, width 0.3s ease, border-radius 0.3s ease;
	}

	.testing-overlay.stuck {
		left: 0 !important;
		top: 0 !important;
		width: 400px;
		height: 100vh;
		max-height: 100vh;
		border-radius: 0;
		border-left: none;
		border-top: none;
		border-bottom: none;
		box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
	}

	.toast-container {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 10000;
		pointer-events: none;
	}

	.toast-container > :global(*) {
		pointer-events: auto;
	}

	.testing-overlay.collapsed {
		height: auto;
	}

	.testing-overlay.dragging {
		cursor: grabbing;
		user-select: none;
	}

	.overlay-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border-radius: 0.75rem 0.75rem 0 0;
		cursor: grab;
		user-select: none;
	}

	.overlay-header:active {
		cursor: grabbing;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
	}

	.header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 0.375rem;
	}

	.header-title {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.025em;
	}

	.header-actions {
		display: flex;
		gap: 0.25rem;
	}

	.header-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: rgba(255, 255, 255, 0.2);
		border: none;
		border-radius: 0.375rem;
		color: white;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.header-btn:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	.stats-bar {
		display: flex;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.stat {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.stat-label {
		font-size: 0.75rem;
		color: #6b7280;
		font-weight: 500;
	}

	.stat-value {
		font-size: 0.875rem;
		font-weight: 700;
		color: #111827;
		font-family: 'Courier New', monospace;
	}

	.stat-value.error {
		color: #dc2626;
	}

	.stat-value.type {
		color: #7c3aed;
	}

	.tabs {
		display: flex;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
		padding: 0 0.5rem;
	}

	.tab {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		font-size: 0.875rem;
		font-weight: 500;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.tab:hover {
		color: #111827;
		background: rgba(0, 0, 0, 0.02);
	}

	.tab.active {
		color: #667eea;
		border-bottom-color: #667eea;
		background: white;
	}

	.queue-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 0.375rem;
		font-size: 0.625rem;
		font-weight: 700;
		background: #f59e0b;
		color: white;
		border-radius: 9999px;
		animation: pulse-badge 2s ease-in-out infinite;
	}

	@keyframes pulse-badge {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.1); }
	}

	.pulse {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #10b981;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}

	.tab-content {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.game-tab {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.divider {
		height: 1px;
		background: #e5e7eb;
		margin: 0.5rem 0;
	}

	.balance-section {
		padding: 1rem;
		background: white;
	}

	.balance-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
		margin: 0 0 0.75rem 0;
	}

	.balance-input-group {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.balance-input {
		flex: 1;
		padding: 0.5rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-size: 0.875rem;
	}

	.balance-input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.balance-update-btn {
		padding: 0.5rem 1rem;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s ease;
		white-space: nowrap;
	}

	.balance-update-btn:hover {
		background: #2563eb;
	}

	.current-balance {
		font-size: 0.75rem;
		color: #6b7280;
		font-family: 'Courier New', monospace;
	}

	.select-game-type-prompt {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		background: white;
	}

	.prompt-text {
		font-size: 0.875rem;
		color: #6b7280;
		text-align: center;
		margin: 0;
	}

	/* Scrollbar styling */
	:global(.testing-overlay *::-webkit-scrollbar) {
		width: 8px;
		height: 8px;
	}

	:global(.testing-overlay *::-webkit-scrollbar-track) {
		background: #f3f4f6;
	}

	:global(.testing-overlay *::-webkit-scrollbar-thumb) {
		background: #d1d5db;
		border-radius: 4px;
	}

	:global(.testing-overlay *::-webkit-scrollbar-thumb:hover) {
		background: #9ca3af;
	}
</style>
