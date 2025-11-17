<script lang="ts">
	import type { GameType } from '$lib/testing/messageTemplates';

	interface Props {
		currentUrl: string;
		currentGameType: GameType | null;
		onUrlChange: (url: string) => void;
		onGameTypeChange?: (gameType: GameType | null) => void;
	}

	let {
		currentUrl = $bindable(''),
		currentGameType = $bindable(null),
		onUrlChange,
		onGameTypeChange
	}: Props = $props();

	// Use localStorage to persist input across tab switches
	const STORAGE_KEY = 'hov-testing-game-url-input';
	
	// Track the last synced currentUrl to detect parent changes
	let lastSyncedUrl = $state(currentUrl || '');
	
	// Initialize from localStorage or currentUrl
	let customUrl = $state(
		(typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || currentUrl || ''
	);

	// Only sync customUrl when currentUrl changes from parent (not from user typing)
	$effect(() => {
		// Only sync if currentUrl changed from parent (different from last synced value)
		if (currentUrl !== lastSyncedUrl && currentUrl) {
			customUrl = currentUrl;
			lastSyncedUrl = currentUrl;
			if (typeof window !== 'undefined') {
				localStorage.setItem(STORAGE_KEY, currentUrl);
			}
		}
	});

	// Persist customUrl to localStorage when it changes (debounced to avoid excessive writes)
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (typeof window !== 'undefined' && customUrl) {
			if (saveTimeout) clearTimeout(saveTimeout);
			saveTimeout = setTimeout(() => {
				localStorage.setItem(STORAGE_KEY, customUrl);
			}, 300);
		}
		return () => {
			if (saveTimeout) clearTimeout(saveTimeout);
		};
	});

	function loadCustomUrl() {
		if (customUrl.trim()) {
			const urlToLoad = customUrl.trim();
			onUrlChange(urlToLoad);
			// Update lastSyncedUrl to prevent sync loop
			lastSyncedUrl = urlToLoad;
			// Persist the loaded URL
			if (typeof window !== 'undefined') {
				localStorage.setItem(STORAGE_KEY, urlToLoad);
			}
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			loadCustomUrl();
		}
	}

	function handleGameTypeChange(type: GameType | null) {
		currentGameType = type;
		onGameTypeChange?.(type);
		
		// Populate default URL based on game type
		if (type === '5reel') {
			customUrl = '/games/slots?contract=test-mode';
		} else if (type === 'w2w') {
			customUrl = '/games/w2w?contract=test-mode';
		}
	}

</script>

<div class="game-selector">
	<div class="section">
		<h3 class="section-title">Game Type</h3>
		<p class="section-description">Select game type to configure postmessage responses</p>
		<div class="game-type-buttons">
			<button
				class="game-type-btn"
				class:active={currentGameType === '5reel'}
				onclick={() => handleGameTypeChange('5reel')}
				title="Traditional payline-based slot machine"
			>
				<span class="game-type-name">5reel</span>
			</button>
			<button
				class="game-type-btn"
				class:active={currentGameType === 'w2w'}
				onclick={() => handleGameTypeChange('w2w')}
				title="Ways-to-win slot machine with bonus features"
			>
				<span class="game-type-name">W2W</span>
			</button>
		</div>
	</div>

	{#if currentGameType}
		<div class="section">
			<h3 class="section-title">Game URL</h3>
			<div class="url-input-group">
				<input
					type="text"
					bind:value={customUrl}
					onkeydown={handleKeydown}
					placeholder="Enter game URL (e.g., /games/slots?contract=123456)"
					class="url-input"
				/>
				<button onclick={loadCustomUrl} class="load-btn" disabled={!customUrl.trim()}>
					Load
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.game-selector {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		background: white;
		border-bottom: 1px solid #e5e7eb;
		flex-shrink: 0;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.section-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
		margin: 0;
	}

	.section-description {
		font-size: 0.75rem;
		color: #6b7280;
		margin: 0.25rem 0 0.5rem 0;
	}

	.game-type-buttons {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.game-type-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		background: #f9fafb;
		border: 2px solid #d1d5db;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.2s ease;
		flex: 1;
		min-width: 100px;
		position: relative;
	}

	.game-type-btn:hover {
		background: #f3f4f6;
		border-color: #9ca3af;
	}

	.game-type-btn.active {
		background: #3b82f6;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
	}

	.game-type-btn.active .game-type-name {
		color: white;
		font-weight: 700;
	}

	.game-type-btn.active::after {
		content: '✓';
		position: absolute;
		top: 0.25rem;
		right: 0.5rem;
		color: white;
		font-size: 0.875rem;
		font-weight: bold;
	}


	.game-type-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: #111827;
		transition: color 0.2s ease;
	}

	.url-input-group {
		display: flex;
		gap: 0.5rem;
	}

	.url-input {
		flex: 1;
		padding: 0.5rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-family: 'Courier New', monospace;
	}

	.url-input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.load-btn {
		padding: 0.5rem 1rem;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.load-btn:hover:not(:disabled) {
		background: #2563eb;
	}

	.load-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
