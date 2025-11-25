<script lang="ts">
	import type { GameType } from '$lib/testing/messageTemplates';

	interface Props {
		gameType: GameType | null;
		onGridComplete: (grid: string[][]) => void;
		onCancel: () => void;
	}

	let { gameType, onGridComplete, onCancel }: Props = $props();

	// Grid state: 5 reels × 3 rows (column-major format)
	let grid = $state<string[][]>([
		['A', 'A', 'A'], // Reel 0
		['A', 'A', 'A'], // Reel 1
		['A', 'A', 'A'], // Reel 2
		['A', 'A', 'A'], // Reel 3
		['A', 'A', 'A'] // Reel 4
	]);

	// Symbol lists based on game type
	const SYMBOLS_5REEL = ['A', 'B', 'C', 'D', '_'];
	const SYMBOLS_W2W = [
		'0',
		'1',
		'2',
		'3',
		'4', // High symbols
		'5',
		'6',
		'7',
		'8',
		'9',
		'A', // Low symbols
		'B',
		'C',
		'D', // Wilds
		'E',
		'F' // Scatters (HOV, BONUS)
	];

	const symbols = $derived(gameType === 'w2w' ? SYMBOLS_W2W : SYMBOLS_5REEL);

	// Symbol display names for tooltips
	const symbolNames: Record<string, string> = {
		// W2W
		'0': 'Buffalo',
		'1': 'Eagle',
		'2': 'Cougar',
		'3': 'Elk',
		'4': 'Wolf',
		'5': 'A',
		'6': 'K',
		'7': 'Q',
		'8': 'J',
		'9': '10',
		A: '9',
		B: 'Wild1',
		C: 'Wild2',
		D: 'Wild3',
		E: 'HOV (Jackpot)',
		F: 'Bonus',
		// 5reel
		_: 'Blank'
	};

	function updateCell(reelIndex: number, rowIndex: number, symbol: string) {
		grid[reelIndex][rowIndex] = symbol;
	}

	function randomizeGrid() {
		grid = grid.map((reel) =>
			reel.map(() => symbols[Math.floor(Math.random() * symbols.length)])
		);
	}

	function resetGrid() {
		grid = Array(5)
			.fill(null)
			.map(() => Array(3).fill(symbols[0]));
	}

	function handleComplete() {
		// Serialize to plain JavaScript arrays (removes Svelte Proxy)
		const gridCopy = JSON.parse(JSON.stringify(grid));
		onGridComplete(gridCopy);
	}
</script>

<div class="grid-editor-overlay" onclick={(e) => e.target === e.currentTarget && onCancel()}>
	<div class="grid-editor-modal" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h3>Custom Grid Editor</h3>
			<p class="subtitle">Configure a 5×3 grid (5 reels, 3 rows each)</p>
		</div>

		<div class="grid-container">
			<!-- Reel labels -->
			<div class="reel-labels">
				<div class="reel-label spacer"></div>
				{#each Array(5) as _, reelIdx}
					<div class="reel-label">Reel {reelIdx + 1}</div>
				{/each}
			</div>

			<!-- Grid cells -->
			<div class="grid-cells">
				{#each Array(3) as _, rowIdx}
					<div class="grid-row" data-row={rowIdx}>
						<span class="row-label">Row {rowIdx + 1}</span>
						{#each grid as reel, reelIdx}
							<div class="grid-cell">
								<select
									value={reel[rowIdx]}
									onchange={(e) => updateCell(reelIdx, rowIdx, e.currentTarget.value)}
									class="symbol-select"
									title={symbolNames[reel[rowIdx]] || reel[rowIdx]}
								>
									{#each symbols as symbol}
										<option value={symbol}>
											{symbol}
											{#if symbolNames[symbol]}
												({symbolNames[symbol]})
											{/if}
										</option>
									{/each}
								</select>
								<div class="symbol-display">{reel[rowIdx]}</div>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</div>

		<div class="modal-actions">
			<button onclick={randomizeGrid} class="btn-secondary">🎲 Randomize</button>
			<button onclick={resetGrid} class="btn-secondary">🔄 Reset</button>
			<button onclick={onCancel} class="btn-secondary">Cancel</button>
			<button onclick={handleComplete} class="btn-primary">Use This Grid</button>
		</div>
	</div>
</div>

<style>
	.grid-editor-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
	}

	.grid-editor-modal {
		background: white;
		border-radius: 1rem;
		padding: 2rem;
		max-width: 90vw;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow:
			0 20px 60px rgba(0, 0, 0, 0.3),
			0 10px 20px rgba(0, 0, 0, 0.2);
	}

	.modal-header {
		margin-bottom: 1.5rem;
	}

	.modal-header h3 {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0 0 0.5rem 0;
		color: #111827;
	}

	.subtitle {
		color: #6b7280;
		margin: 0;
		font-size: 0.875rem;
	}

	.grid-container {
		margin-bottom: 1.5rem;
	}

	.reel-labels {
		display: grid;
		grid-template-columns: 80px repeat(5, 1fr);
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.reel-label {
		text-align: center;
		font-weight: 600;
		font-size: 0.875rem;
		color: #374151;
	}

	.reel-label.spacer {
		visibility: hidden;
	}

	.grid-cells {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.grid-row {
		display: grid;
		grid-template-columns: 80px repeat(5, 1fr);
		gap: 0.5rem;
		align-items: center;
	}

	.row-label {
		font-weight: 600;
		font-size: 0.875rem;
		color: #374151;
		text-align: right;
		padding-right: 0.5rem;
	}

	.grid-cell {
		position: relative;
		min-height: 60px;
	}

	.symbol-select {
		width: 100%;
		height: 100%;
		padding: 0.5rem;
		border: 2px solid #d1d5db;
		border-radius: 0.5rem;
		font-family: monospace;
		font-size: 0.875rem;
		background: white;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.symbol-select:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.symbol-select:hover {
		border-color: #9ca3af;
	}

	.symbol-display {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 1.75rem;
		font-weight: 700;
		pointer-events: none;
		color: #111827;
		text-shadow:
			0 2px 4px rgba(0, 0, 0, 0.1),
			0 1px 2px rgba(255, 255, 255, 0.8);
	}

	.modal-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		padding-top: 1rem;
		border-top: 1px solid #e5e7eb;
	}

	.btn-primary,
	.btn-secondary {
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
		border: none;
		font-size: 0.875rem;
	}

	.btn-primary {
		background: #3b82f6;
		color: white;
	}

	.btn-primary:hover {
		background: #2563eb;
		transform: translateY(-1px);
		box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
	}

	.btn-secondary {
		background: #f3f4f6;
		color: #374151;
	}

	.btn-secondary:hover {
		background: #e5e7eb;
	}
</style>
