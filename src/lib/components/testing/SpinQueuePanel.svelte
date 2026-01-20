<script lang="ts">
	import type { QueuedSpinItem } from '$lib/game-engine/bridge/types';

	interface Props {
		queue: QueuedSpinItem[];
		selectedSpinId?: string | null;
		onClearQueue?: () => void;
		onSelectSpin?: (spinId: string) => void;
	}

	let { queue = [], selectedSpinId = null, onClearQueue, onSelectSpin }: Props = $props();

	// Derived stats
	let pendingCount = $derived(queue.filter(s => s.status === 'pending' || s.status === 'submitted').length);
	let completedCount = $derived(queue.filter(s => s.status === 'completed').length);
	let failedCount = $derived(queue.filter(s => s.status === 'failed').length);
	let reservedBalance = $derived(
		queue
			.filter(s => s.status === 'pending' || s.status === 'submitted')
			.reduce((sum, s) => sum + s.betAmount, 0)
	);

	function getStatusColor(status: QueuedSpinItem['status']): string {
		switch (status) {
			case 'pending': return '#f59e0b'; // amber
			case 'submitted': return '#3b82f6'; // blue
			case 'completed': return '#10b981'; // green
			case 'failed': return '#ef4444'; // red
			default: return '#6b7280';
		}
	}

	function getStatusIcon(status: QueuedSpinItem['status']): string {
		switch (status) {
			case 'pending': return '⏳';
			case 'submitted': return '📤';
			case 'completed': return '✓';
			case 'failed': return '✗';
			default: return '?';
		}
	}

	function formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString('en-US', {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function formatSpinId(id: string): string {
		if (id.length > 12) {
			return id.slice(0, 6) + '...' + id.slice(-4);
		}
		return id;
	}
</script>

<div class="queue-panel">
	<!-- Stats Header -->
	<div class="queue-stats">
		<div class="stat-group">
			<div class="stat">
				<span class="stat-label">Pending</span>
				<span class="stat-value pending">{pendingCount}</span>
			</div>
			<div class="stat">
				<span class="stat-label">Completed</span>
				<span class="stat-value completed">{completedCount}</span>
			</div>
			<div class="stat">
				<span class="stat-label">Failed</span>
				<span class="stat-value failed">{failedCount}</span>
			</div>
		</div>
		<div class="reserved-balance">
			<span class="reserved-label">Reserved:</span>
			<span class="reserved-value">{reservedBalance.toFixed(2)} VOI</span>
		</div>
	</div>

	<!-- Queue Actions -->
	<div class="queue-actions">
		<span class="queue-count">{queue.length} spin{queue.length !== 1 ? 's' : ''} in queue</span>
		{#if onClearQueue && queue.length > 0}
			<button class="clear-btn" onclick={onClearQueue}>
				Clear Queue
			</button>
		{/if}
	</div>

	<!-- Queue List -->
	<div class="queue-list">
		{#if queue.length === 0}
			<div class="empty-queue">
				<div class="empty-icon">
					<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
					</svg>
				</div>
				<span>No spins in queue</span>
				<span class="empty-hint">Spins will appear here when the game sends SPIN_REQUEST</span>
			</div>
		{:else}
			{#each queue.toReversed() as spin (spin.spinId)}
				<div
					class="queue-item"
					class:pending={spin.status === 'pending'}
					class:submitted={spin.status === 'submitted'}
					class:completed={spin.status === 'completed'}
					class:failed={spin.status === 'failed'}
					class:selected={selectedSpinId === spin.spinId}
				>
					<div class="item-header">
						<span class="status-badge" style="background-color: {getStatusColor(spin.status)}">
							{getStatusIcon(spin.status)} {spin.status}
						</span>
						<div class="header-right">
							{#if (spin.status === 'pending' || spin.status === 'submitted') && onSelectSpin}
								<button
									class="respond-btn"
									class:active={selectedSpinId === spin.spinId}
									onclick={() => onSelectSpin(spin.spinId)}
								>
									{selectedSpinId === spin.spinId ? 'Selecting...' : 'Respond'}
								</button>
							{/if}
							<span class="spin-time">{formatTime(spin.timestamp)}</span>
						</div>
					</div>
					<div class="item-details">
						<div class="detail-row">
							<span class="detail-label">Spin ID:</span>
							<span class="detail-value mono" title={spin.spinId}>{formatSpinId(spin.spinId)}</span>
						</div>
						<div class="detail-row">
							<span class="detail-label">Bet:</span>
							<span class="detail-value">{spin.betAmount.toFixed(2)} VOI</span>
						</div>
						{#if spin.mode !== undefined}
							<div class="detail-row">
								<span class="detail-label">Mode:</span>
								<span class="detail-value">{spin.mode}</span>
							</div>
						{/if}
						{#if spin.paylines !== undefined}
							<div class="detail-row">
								<span class="detail-label">Paylines:</span>
								<span class="detail-value">{spin.paylines}</span>
							</div>
						{/if}
					</div>
					{#if spin.outcome}
						<div class="item-outcome" class:win={spin.outcome.isWin}>
							<div class="outcome-header">
								{#if spin.outcome.isWin}
									<span class="win-badge">{spin.outcome.winLevel?.toUpperCase() || 'WIN'}</span>
								{:else}
									<span class="loss-badge">LOSS</span>
								{/if}
								<span class="outcome-amount" class:positive={spin.outcome.winnings > 0}>
									{spin.outcome.winnings > 0 ? '+' : ''}{spin.outcome.winnings.toFixed(2)} VOI
								</span>
							</div>
							{#if spin.outcome.jackpotHit}
								<div class="jackpot-indicator">JACKPOT!</div>
							{/if}
							{#if spin.outcome.bonusSpinsAwarded && spin.outcome.bonusSpinsAwarded > 0}
								<div class="bonus-indicator">+{spin.outcome.bonusSpinsAwarded} Bonus Spins</div>
							{/if}
						</div>
					{/if}
					{#if spin.error}
						<div class="item-error">
							<span class="error-label">Error:</span>
							<span class="error-message">{spin.error}</span>
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.queue-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: white;
		overflow: hidden;
	}

	.queue-stats {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.stat-group {
		display: flex;
		gap: 1rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.125rem;
	}

	.stat-label {
		font-size: 0.625rem;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.stat-value {
		font-size: 1rem;
		font-weight: 700;
		font-family: 'Courier New', monospace;
	}

	.stat-value.pending {
		color: #f59e0b;
	}

	.stat-value.completed {
		color: #10b981;
	}

	.stat-value.failed {
		color: #ef4444;
	}

	.reserved-balance {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.125rem;
	}

	.reserved-label {
		font-size: 0.625rem;
		color: #6b7280;
		text-transform: uppercase;
	}

	.reserved-value {
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
		font-family: 'Courier New', monospace;
	}

	.queue-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1rem;
		background: white;
		border-bottom: 1px solid #e5e7eb;
	}

	.queue-count {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.clear-btn {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		background: #fee2e2;
		color: #dc2626;
		border: 1px solid #fecaca;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.clear-btn:hover {
		background: #fecaca;
	}

	.queue-list {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.empty-queue {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #9ca3af;
		text-align: center;
		padding: 2rem;
		gap: 0.5rem;
	}

	.empty-icon {
		opacity: 0.5;
	}

	.empty-hint {
		font-size: 0.75rem;
		color: #d1d5db;
	}

	.queue-item {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		margin-bottom: 0.5rem;
		overflow: hidden;
		transition: border-color 0.15s ease;
	}

	.queue-item.pending {
		border-left: 3px solid #f59e0b;
	}

	.queue-item.submitted {
		border-left: 3px solid #3b82f6;
	}

	.queue-item.completed {
		border-left: 3px solid #10b981;
	}

	.queue-item.failed {
		border-left: 3px solid #ef4444;
	}

	.queue-item.selected {
		border-color: #667eea;
		box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
	}

	.queue-item.pending:hover {
		border-color: #d1d5db;
	}

	.item-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0.75rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.respond-btn {
		padding: 0.25rem 0.5rem;
		font-size: 0.625rem;
		font-weight: 600;
		background: #667eea;
		color: white;
		border: none;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.15s ease;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.respond-btn:hover {
		background: #5a67d8;
	}

	.respond-btn.active {
		background: #f59e0b;
		animation: pulse-btn 1.5s ease-in-out infinite;
	}

	@keyframes pulse-btn {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.5rem;
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		color: white;
		border-radius: 9999px;
	}

	.spin-time {
		font-size: 0.625rem;
		color: #9ca3af;
		font-family: 'Courier New', monospace;
	}

	.item-details {
		padding: 0.5rem 0.75rem;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		padding: 0.125rem 0;
	}

	.detail-label {
		color: #6b7280;
	}

	.detail-value {
		color: #374151;
		font-weight: 500;
	}

	.detail-value.mono {
		font-family: 'Courier New', monospace;
	}

	.item-outcome {
		padding: 0.5rem 0.75rem;
		background: #f3f4f6;
		border-top: 1px solid #e5e7eb;
	}

	.item-outcome.win {
		background: #ecfdf5;
	}

	.outcome-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.win-badge {
		display: inline-block;
		padding: 0.125rem 0.375rem;
		font-size: 0.625rem;
		font-weight: 700;
		background: #10b981;
		color: white;
		border-radius: 0.25rem;
	}

	.loss-badge {
		display: inline-block;
		padding: 0.125rem 0.375rem;
		font-size: 0.625rem;
		font-weight: 700;
		background: #9ca3af;
		color: white;
		border-radius: 0.25rem;
	}

	.outcome-amount {
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
		font-family: 'Courier New', monospace;
	}

	.outcome-amount.positive {
		color: #059669;
	}

	.jackpot-indicator {
		margin-top: 0.375rem;
		padding: 0.25rem 0.5rem;
		background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
		color: white;
		font-size: 0.75rem;
		font-weight: 700;
		text-align: center;
		border-radius: 0.25rem;
		animation: pulse 1.5s ease-in-out infinite;
	}

	.bonus-indicator {
		margin-top: 0.375rem;
		padding: 0.25rem 0.5rem;
		background: #8b5cf6;
		color: white;
		font-size: 0.75rem;
		font-weight: 600;
		text-align: center;
		border-radius: 0.25rem;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.8; }
	}

	.item-error {
		padding: 0.5rem 0.75rem;
		background: #fef2f2;
		border-top: 1px solid #fecaca;
	}

	.error-label {
		font-size: 0.625rem;
		color: #dc2626;
		font-weight: 600;
		text-transform: uppercase;
	}

	.error-message {
		display: block;
		font-size: 0.75rem;
		color: #b91c1c;
		margin-top: 0.25rem;
	}
</style>
