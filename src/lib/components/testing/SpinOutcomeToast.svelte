<script lang="ts">
	import type { GameType } from '$lib/testing/messageTemplates';
	import GridEditor from './GridEditor.svelte';

	interface Props {
		spinId: string;
		gameType: GameType | null;
		onSelectOutcome: (outcome: OutcomeOption) => void;
		onDismiss: () => void;
	}

	let { spinId, gameType, onSelectOutcome, onDismiss }: Props = $props();

	export type OutcomeOption =
		| { type: 'random-win' }
		| { type: 'big-win' }
		| { type: 'jackpot' }
		| { type: 'bonus-spins' }
		| { type: 'loss' }
		| { type: 'custom-grid'; grid: string[][] };

	let showGridEditor = $state(false);

	function handleOutcome(outcome: OutcomeOption) {
		onSelectOutcome(outcome);
		onDismiss();
	}
</script>

<div class="toast-overlay" onclick={(e) => e.target === e.currentTarget && onDismiss()}>
	<div class="toast" onclick={(e) => e.stopPropagation()}>
		<div class="toast-header">
			<div class="toast-title">
				<span class="toast-icon">🎰</span>
				<span>Spin Submitted</span>
			</div>
			<button onclick={onDismiss} class="close-btn" title="Dismiss">×</button>
		</div>
		<div class="toast-body">
			<div class="spin-id">Spin ID: <code>{spinId}</code></div>
			<div class="outcome-grid">
				<button onclick={() => handleOutcome({ type: 'random-win' })} class="outcome-btn win">
					<span class="outcome-icon">🎰</span>
					<span class="outcome-label">Random Win</span>
				</button>

				<button onclick={() => handleOutcome({ type: 'big-win' })} class="outcome-btn big-win">
					<span class="outcome-icon">💰</span>
					<span class="outcome-label">Big Win</span>
				</button>

				{#if gameType === 'w2w'}
					<button onclick={() => handleOutcome({ type: 'jackpot' })} class="outcome-btn jackpot">
						<span class="outcome-icon">🎉</span>
						<span class="outcome-label">Jackpot</span>
					</button>

					<button onclick={() => handleOutcome({ type: 'bonus-spins' })} class="outcome-btn bonus">
						<span class="outcome-icon">🎁</span>
						<span class="outcome-label">Bonus Spins</span>
					</button>
				{/if}

				<button onclick={() => handleOutcome({ type: 'loss' })} class="outcome-btn loss">
					<span class="outcome-icon">❌</span>
					<span class="outcome-label">Loss</span>
				</button>

				<button onclick={() => (showGridEditor = true)} class="outcome-btn grid-editor">
					<span class="outcome-icon">🎯</span>
					<span class="outcome-label">Custom Grid</span>
				</button>
			</div>

			{#if showGridEditor}
				<GridEditor
					{gameType}
					onGridComplete={(grid) => {
						showGridEditor = false;
						handleOutcome({ type: 'custom-grid', grid });
					}}
					onCancel={() => {
						showGridEditor = false;
					}}
				/>
			{/if}
		</div>
	</div>
</div>

<style>
	.toast-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		border-radius: 0.75rem;
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.toast {
		background: white;
		border-radius: 0.75rem;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
		max-width: 500px;
		width: 90%;
		max-height: 90vh;
		overflow-y: auto;
		animation: slideUp 0.3s ease;
	}

	@keyframes slideUp {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.toast-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.toast-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1rem;
		font-weight: 700;
		color: #111827;
	}

	.toast-icon {
		font-size: 1.25rem;
	}

	.close-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f3f4f6;
		border: none;
		border-radius: 0.375rem;
		font-size: 1.5rem;
		line-height: 1;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.close-btn:hover {
		background: #e5e7eb;
		color: #111827;
	}

	.toast-body {
		padding: 1.5rem;
	}

	.spin-id {
		font-size: 0.75rem;
		color: #6b7280;
		margin-bottom: 1rem;
		padding: 0.5rem;
		background: #f9fafb;
		border-radius: 0.375rem;
	}

	.spin-id code {
		font-family: 'Courier New', monospace;
		color: #111827;
		font-weight: 600;
	}

	.outcome-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.outcome-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 0.75rem;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		background: white;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.outcome-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	.outcome-btn.win {
		border-color: #10b981;
		background: #f0fdf4;
	}

	.outcome-btn.big-win {
		border-color: #f59e0b;
		background: #fffbeb;
	}

	.outcome-btn.jackpot {
		border-color: #8b5cf6;
		background: #faf5ff;
	}

	.outcome-btn.bonus {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.outcome-btn.loss {
		border-color: #6b7280;
		background: #f9fafb;
	}

	.outcome-btn.grid-editor {
		border-color: #10b981;
		background: #ecfdf5;
	}

	.outcome-icon {
		font-size: 1.5rem;
	}

	.outcome-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: #111827;
		text-align: center;
	}
</style>

