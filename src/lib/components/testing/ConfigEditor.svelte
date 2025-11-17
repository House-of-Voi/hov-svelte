<script lang="ts">
	import type { GameType } from '$lib/testing/messageTemplates';

	interface Props {
		gameType: GameType | null;
		onConfigChange: (config: ConfigValues) => void;
		onConfigLoaded?: (config: unknown) => void;
	}

	let { gameType, onConfigChange, onConfigLoaded }: Props = $props();

	export interface ConfigValues {
		minBet: number;
		maxBet: number;
		rtpTarget: number;
		houseEdge: number;
		// W2W specific
		jackpotAmount?: number;
		bonusSpinMultiplier?: number;
		// 5reel specific
		maxPaylines?: number;
	}

	// Contract loading state
	let contractId = $state('');
	let loadingConfig = $state(false);
	let configError = $state('');
	let loadedFromContract = $state(false);

	// Default config values (all in normalized VOI)
	let config = $state<ConfigValues>({
		minBet: gameType === 'w2w' ? 40 : 0.01,
		maxBet: gameType === 'w2w' ? 60 : 100,
		rtpTarget: 96.5,
		houseEdge: 3.5,
		jackpotAmount: gameType === 'w2w' ? 10000 : undefined,
		bonusSpinMultiplier: gameType === 'w2w' ? 1.5 : undefined,
		maxPaylines: gameType === '5reel' ? 20 : undefined
	});

	// Update defaults when game type changes
	$effect(() => {
		if (gameType === 'w2w') {
			config.minBet = 40;
			config.maxBet = 60;
			config.jackpotAmount = 10000;
			config.bonusSpinMultiplier = 1.5;
			config.maxPaylines = undefined;
		} else if (gameType === '5reel') {
			config.minBet = 0.01;
			config.maxBet = 100;
			config.maxPaylines = 20;
			config.jackpotAmount = undefined;
			config.bonusSpinMultiplier = undefined;
		}
	});

	function applyConfig() {
		onConfigChange(config);
		loadedFromContract = false;
	}

	async function loadFromContract() {
		if (!contractId.trim()) {
			configError = 'Please enter a contract ID';
			return;
		}

		loadingConfig = true;
		configError = '';

		try {
			const response = await fetch(`/api/games/slot-configs?contractId=${contractId.trim()}`);

			if (!response.ok) {
				throw new Error(`Failed to load config: ${response.statusText}`);
			}

			const contractConfig = await response.json();
			console.log('[Config Editor] Loaded config for contract:', contractId, contractConfig);

			// Update local config with contract values
			// API returns min_bet/max_bet in microVOI, convert to normalized VOI
			if (contractConfig.min_bet !== undefined) {
				config.minBet = contractConfig.min_bet / 1_000_000;
			} else if (contractConfig.minBet !== undefined) {
				config.minBet = contractConfig.minBet / 1_000_000;
			}
			if (contractConfig.max_bet !== undefined) {
				config.maxBet = contractConfig.max_bet / 1_000_000;
			} else if (contractConfig.maxBet !== undefined) {
				config.maxBet = contractConfig.maxBet / 1_000_000;
			}
			if (contractConfig.rtp_target !== undefined) {
				config.rtpTarget = contractConfig.rtp_target;
			} else if (contractConfig.rtpTarget !== undefined) {
				config.rtpTarget = contractConfig.rtpTarget;
			}
			if (contractConfig.house_edge !== undefined) {
				config.houseEdge = contractConfig.house_edge;
			} else if (contractConfig.houseEdge !== undefined) {
				config.houseEdge = contractConfig.houseEdge;
			}
			if (contractConfig.jackpotAmount !== undefined)
				config.jackpotAmount = contractConfig.jackpotAmount;
			if (contractConfig.bonusSpinMultiplier !== undefined)
				config.bonusSpinMultiplier = contractConfig.bonusSpinMultiplier;
			if (contractConfig.max_paylines !== undefined) {
				config.maxPaylines = contractConfig.max_paylines;
			} else if (contractConfig.maxPaylines !== undefined) {
				config.maxPaylines = contractConfig.maxPaylines;
			}

			loadedFromContract = true;
			configError = '';

			// Notify parent and apply config
			onConfigLoaded?.(contractConfig);
			onConfigChange(config);
		} catch (error) {
			console.error('[Config Editor] Error loading contract config:', error);
			configError = error instanceof Error ? error.message : 'Failed to load config';
		} finally {
			loadingConfig = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			loadFromContract();
		}
	}
</script>

<div class="config-editor">
	<h3 class="title">Game Configuration</h3>
	<p class="description">Edit and apply configuration to update the game</p>

	<div class="contract-loader">
		<div class="contract-input-group">
			<input
				type="text"
				bind:value={contractId}
				onkeydown={handleKeydown}
				placeholder="Contract ID (optional)"
				class="contract-input"
			/>
			<button
				onclick={loadFromContract}
				class="load-contract-btn"
				disabled={loadingConfig || !contractId.trim()}
				title="Load config from contract"
			>
				{loadingConfig ? '...' : 'Load'}
			</button>
			{#if loadedFromContract}
				<span class="loaded-badge" title="Config loaded from contract">✓</span>
			{/if}
		</div>
		{#if configError}
			<div class="config-error">{configError}</div>
		{/if}
	</div>

	<div class="config-form">
		<div class="form-group">
			<label for="minBet">Min Bet (VOI)</label>
			<input
				id="minBet"
				type="number"
				step="0.01"
				bind:value={config.minBet}
				oninput={() => (loadedFromContract = false)}
				class="input"
			/>
		</div>

		<div class="form-group">
			<label for="maxBet">Max Bet (VOI)</label>
			<input
				id="maxBet"
				type="number"
				step="0.01"
				bind:value={config.maxBet}
				oninput={() => (loadedFromContract = false)}
				class="input"
			/>
		</div>

		<div class="form-group">
			<label for="rtpTarget">RTP Target (%)</label>
			<input
				id="rtpTarget"
				type="number"
				step="0.1"
				bind:value={config.rtpTarget}
				oninput={() => (loadedFromContract = false)}
				class="input"
			/>
		</div>

		<div class="form-group">
			<label for="houseEdge">House Edge (%)</label>
			<input
				id="houseEdge"
				type="number"
				step="0.1"
				bind:value={config.houseEdge}
				oninput={() => (loadedFromContract = false)}
				class="input"
			/>
		</div>

		{#if gameType === 'w2w'}
			<div class="form-group">
				<label for="jackpotAmount">Jackpot Amount</label>
				<input
					id="jackpotAmount"
					type="number"
					bind:value={config.jackpotAmount}
					oninput={() => (loadedFromContract = false)}
					class="input"
				/>
			</div>

			<div class="form-group">
				<label for="bonusMultiplier">Bonus Spin Multiplier</label>
				<input
					id="bonusMultiplier"
					type="number"
					step="0.1"
					bind:value={config.bonusSpinMultiplier}
					oninput={() => (loadedFromContract = false)}
					class="input"
				/>
			</div>
		{/if}

		{#if gameType === '5reel'}
			<div class="form-group">
				<label for="maxPaylines">Max Paylines</label>
				<input
					id="maxPaylines"
					type="number"
					bind:value={config.maxPaylines}
					oninput={() => (loadedFromContract = false)}
					class="input"
				/>
			</div>
		{/if}
	</div>

	<button onclick={applyConfig} class="apply-btn">Apply Configuration to Game</button>
</div>

<style>
	.config-editor {
		flex: 1;
		min-height: 0;
		padding: 1rem;
		background: white;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	.title {
		font-size: 1rem;
		font-weight: 700;
		color: #111827;
		margin: 0 0 0.5rem 0;
	}

	.description {
		font-size: 0.875rem;
		color: #6b7280;
		margin: 0 0 1rem 0;
	}

	.config-form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.form-group label {
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
	}

	.input {
		padding: 0.5rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-size: 0.875rem;
	}

	.input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.apply-btn {
		width: 100%;
		padding: 0.75rem 1.5rem;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s ease;
		flex-shrink: 0;
		margin-top: auto;
	}

	.apply-btn:hover {
		background: #2563eb;
	}

	.contract-loader {
		margin-bottom: 0.75rem;
	}

	.loaded-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		font-size: 0.875rem;
		font-weight: 600;
		color: #059669;
		background: #d1fae5;
		border-radius: 0.25rem;
		flex-shrink: 0;
	}

	.contract-input-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.contract-input {
		flex: 1;
		padding: 0.5rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-family: 'Courier New', monospace;
	}

	.contract-input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.load-contract-btn {
		padding: 0.5rem 0.75rem;
		background: #8b5cf6;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s ease;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.load-contract-btn:hover:not(:disabled) {
		background: #7c3aed;
	}

	.load-contract-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.config-error {
		margin-top: 0.5rem;
		padding: 0.5rem;
		background: #fee2e2;
		color: #991b1b;
		border-radius: 0.375rem;
		font-size: 0.875rem;
	}
</style>
