<script lang="ts">
	import type { GameType } from '$lib/testing/messageTemplates';

	interface Props {
		gameType: GameType | null;
		onAction: (action: TestAction) => void;
	}

	export type TestAction =
		| { type: 'random-win' }
		| { type: 'big-win' }
		| { type: 'jackpot' }
		| { type: 'bonus-spins' }
		| { type: 'loss' }
		| { type: 'update-balance'; balance: number }
		| { type: 'custom-outcome'; winnings: number; winLevel: string; bonusSpins?: number };

	let { gameType, onAction }: Props = $props();

	let customWinnings = $state(1000); // normalized VOI
	let customWinLevel = $state('medium');
	let customBonusSpins = $state(0);
	let newBalance = $state(100); // normalized VOI
	let showCustomForm = $state(false);
</script>

<div class="quick-actions">
	<h3 class="title">Quick Test Actions</h3>
	<p class="description">Spin in the game, then click a button below to send the outcome</p>

	<div class="action-grid">
		<button onclick={() => onAction({ type: 'random-win' })} class="action-btn win">
			<span class="icon">🎰</span>
			<span class="label">Send Random Win</span>
		</button>

		<button onclick={() => onAction({ type: 'big-win' })} class="action-btn big-win">
			<span class="icon">💰</span>
			<span class="label">Send Big Win</span>
		</button>

		{#if gameType === 'w2w'}
			<button onclick={() => onAction({ type: 'jackpot' })} class="action-btn jackpot">
				<span class="icon">🎉</span>
				<span class="label">Send Jackpot</span>
			</button>

			<button onclick={() => onAction({ type: 'bonus-spins' })} class="action-btn bonus">
				<span class="icon">🎁</span>
				<span class="label">Send Bonus Spins</span>
			</button>
		{/if}

		<button onclick={() => onAction({ type: 'loss' })} class="action-btn loss">
			<span class="icon">❌</span>
			<span class="label">Send Loss</span>
		</button>
	</div>

	<div class="balance-update">
		<h4 class="section-title">Update Balance</h4>
		<div class="balance-input-group">
			<input
				type="number"
				step="0.01"
				bind:value={newBalance}
				placeholder="Enter balance (VOI)"
				class="balance-input"
			/>
			<button onclick={() => onAction({ type: 'update-balance', balance: newBalance })} class="update-btn">
				Apply
			</button>
		</div>
	</div>

	<div class="custom-outcome">
		<button onclick={() => (showCustomForm = !showCustomForm)} class="toggle-custom">
			{showCustomForm ? '▼' : '▶'} Custom Outcome (Advanced)
		</button>

		{#if showCustomForm}
			<div class="custom-form">
				<div class="form-row">
					<label for="winnings">Winnings:</label>
					<input id="winnings" type="number" bind:value={customWinnings} class="input" />
				</div>

				<div class="form-row">
					<label for="winLevel">Win Level:</label>
					<select id="winLevel" bind:value={customWinLevel} class="select">
						<option value="none">None</option>
						<option value="small">Small</option>
						<option value="medium">Medium</option>
						<option value="large">Large</option>
						<option value="jackpot">Jackpot</option>
					</select>
				</div>

				{#if gameType === 'w2w'}
					<div class="form-row">
						<label for="bonusSpins">Bonus Spins:</label>
						<input id="bonusSpins" type="number" bind:value={customBonusSpins} class="input" />
					</div>
				{/if}

				<button
					onclick={() =>
						onAction({
							type: 'custom-outcome',
							winnings: customWinnings,
							winLevel: customWinLevel,
							bonusSpins: customBonusSpins
						})}
					class="send-custom-btn"
				>
					Send Custom Outcome
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.quick-actions {
		padding: 1rem;
		background: white;
		overflow-y: auto;
		height: 100%;
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

	.action-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.action-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		background: white;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	.action-btn.win {
		border-color: #10b981;
		background: #f0fdf4;
	}

	.action-btn.win:hover {
		background: #dcfce7;
	}

	.action-btn.big-win {
		border-color: #f59e0b;
		background: #fffbeb;
	}

	.action-btn.big-win:hover {
		background: #fef3c7;
	}

	.action-btn.jackpot {
		border-color: #8b5cf6;
		background: #faf5ff;
	}

	.action-btn.jackpot:hover {
		background: #f3e8ff;
	}

	.action-btn.bonus {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.action-btn.bonus:hover {
		background: #dbeafe;
	}

	.action-btn.loss {
		border-color: #6b7280;
		background: #f9fafb;
	}

	.action-btn.loss:hover {
		background: #f3f4f6;
	}

	.icon {
		font-size: 2rem;
	}

	.label {
		font-size: 0.875rem;
		font-weight: 600;
		color: #111827;
		text-align: center;
	}

	.balance-update {
		padding: 1rem;
		background: #f9fafb;
		border-radius: 0.5rem;
		margin-bottom: 1rem;
	}

	.section-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
		margin: 0 0 0.5rem 0;
	}

	.balance-input-group {
		display: flex;
		gap: 0.5rem;
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

	.update-btn {
		padding: 0.5rem 1rem;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
	}

	.update-btn:hover {
		background: #2563eb;
	}

	.custom-outcome {
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.toggle-custom {
		width: 100%;
		padding: 0.75rem 1rem;
		background: #f9fafb;
		border: none;
		text-align: left;
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
	}

	.toggle-custom:hover {
		background: #f3f4f6;
	}

	.custom-form {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.form-row {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.form-row label {
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
	}

	.input,
	.select {
		padding: 0.5rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-size: 0.875rem;
	}

	.input:focus,
	.select:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.send-custom-btn {
		padding: 0.75rem 1.5rem;
		background: #8b5cf6;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
	}

	.send-custom-btn:hover {
		background: #7c3aed;
	}
</style>
