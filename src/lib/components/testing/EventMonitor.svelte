<script lang="ts">
	import type { LoggedMessage } from '$lib/testing/types';

	interface Props {
		messages: LoggedMessage[];
	}

	let { messages = [] }: Props = $props();

	// Show only messages FROM the game (what game sends to parent)
	let gameMessages = $derived(messages.filter((m) => m.direction === 'received'));

	// Check if there's a pending spin request (last message was SPIN_REQUEST)
	let hasPendingSpin = $derived(() => {
		const lastMessage = gameMessages[gameMessages.length - 1];
		return lastMessage?.messageType === 'SPIN_REQUEST';
	});

	// Get stats
	let stats = $derived(() => {
		const spinRequests = gameMessages.filter((m) => m.messageType === 'SPIN_REQUEST').length;
		const balanceRequests = gameMessages.filter((m) => m.messageType === 'GET_BALANCE').length;
		const creditBalanceRequests = gameMessages.filter((m) => m.messageType === 'GET_CREDIT_BALANCE').length;
		const errors = gameMessages.filter((m) => m.messageType === 'ERROR').length;

		return {
			spinRequests,
			balanceRequests,
			creditBalanceRequests,
			errors,
			total: gameMessages.length
		};
	});

	function formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			fractionalSecondDigits: 3
		});
	}

	function getEventIcon(type: string): string {
		switch (type) {
			case 'SPIN_REQUEST':
				return '🎰';
			case 'INIT':
				return '🚀';
			case 'GET_CONFIG':
				return '⚙️';
			case 'GET_BALANCE':
			case 'GET_CREDIT_BALANCE':
				return '💰';
			case 'EXIT':
				return '🚪';
			default:
				return '📨';
		}
	}

	function getEventDetails(msg: LoggedMessage): string[] {
		const message = msg.message as Record<string, unknown>;
		const payload = message.payload as Record<string, unknown> | undefined;

		if (!payload) return [];

		const details: string[] = [];

		// SPIN_REQUEST details
		if (msg.messageType === 'SPIN_REQUEST') {
			if ('betAmount' in payload) {
				details.push(`Bet: ${payload.betAmount} VOI`);
			} else if ('betPerLine' in payload && 'paylines' in payload) {
				details.push(`Bet Per Line: ${payload.betPerLine} VOI`);
				details.push(`Paylines: ${payload.paylines}`);
			}
			if ('spinId' in payload) {
				details.push(`Spin ID: ${payload.spinId}`);
			}
		}

		return details;
	}

	let expandedMessages = $state<Set<string>>(new Set());

	function toggleExpanded(id: string) {
		const newSet = new Set(expandedMessages);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		expandedMessages = newSet;
	}
</script>

<div class="event-monitor">
	<div class="header">
		<h3 class="title">Game Events Monitor</h3>
		<p class="description">Shows messages sent FROM the game</p>
	</div>

	{#if hasPendingSpin()}
		<div class="pending-spin-alert">
			<div class="alert-content">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<path d="M12 6v6l4 2" />
				</svg>
				<div>
					<strong>Spin Pending!</strong>
					<span>Go to Actions tab to send an outcome</span>
				</div>
			</div>
		</div>
	{/if}

	<div class="stats">
		<div class="stat-card">
			<div class="stat-value">{stats().spinRequests}</div>
			<div class="stat-label">Spin Requests</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">{stats().balanceRequests + stats().creditBalanceRequests}</div>
			<div class="stat-label">Balance Requests</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">{stats().total}</div>
			<div class="stat-label">Total Events</div>
		</div>
		{#if stats().errors > 0}
			<div class="stat-card error">
				<div class="stat-value">{stats().errors}</div>
				<div class="stat-label">Errors</div>
			</div>
		{/if}
	</div>

	<div class="events">
		{#each gameMessages.slice().reverse() as msg (msg.id)}
			<div class="event-card">
				<button class="event-header" onclick={() => toggleExpanded(msg.id)}>
					<div class="event-main">
						<span class="event-icon">{getEventIcon(msg.messageType)}</span>
						<div class="event-info">
							<div class="event-type">{msg.messageType}</div>
							{#each getEventDetails(msg) as detail}
								<div class="event-detail">{detail}</div>
							{/each}
						</div>
					</div>
					<div class="event-time">{formatTime(msg.timestamp)}</div>
				</button>

				{#if expandedMessages.has(msg.id)}
					<div class="event-json">
						<pre>{JSON.stringify(msg.message, null, 2)}</pre>
					</div>
				{/if}
			</div>
		{:else}
			<div class="empty-state">
				<svg
					width="48"
					height="48"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1"
				>
					<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
				</svg>
				<div class="empty-text">No events yet</div>
				<div class="empty-hint">Game messages will appear here when the game sends them</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.event-monitor {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: white;
	}

	.header {
		padding: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.title {
		font-size: 1rem;
		font-weight: 700;
		color: #111827;
		margin: 0 0 0.25rem 0;
	}

	.description {
		font-size: 0.875rem;
		color: #6b7280;
		margin: 0;
	}

	.pending-spin-alert {
		padding: 0.75rem 1rem;
		background: #fef3c7;
		border-bottom: 2px solid #f59e0b;
		animation: pulse-bg 2s ease-in-out infinite;
	}

	@keyframes pulse-bg {
		0%, 100% {
			background: #fef3c7;
		}
		50% {
			background: #fde68a;
		}
	}

	.alert-content {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: #92400e;
	}

	.alert-content svg {
		flex-shrink: 0;
	}

	.alert-content div {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.alert-content strong {
		font-size: 0.875rem;
		font-weight: 700;
	}

	.alert-content span {
		font-size: 0.75rem;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
		gap: 0.75rem;
		padding: 1rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.stat-card {
		text-align: center;
		padding: 0.75rem;
		background: white;
		border-radius: 0.375rem;
		border: 1px solid #e5e7eb;
	}

	.stat-card.error {
		background: #fee2e2;
		border-color: #fca5a5;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #111827;
	}

	.stat-card.error .stat-value {
		color: #991b1b;
	}

	.stat-label {
		font-size: 0.75rem;
		color: #6b7280;
		margin-top: 0.25rem;
	}

	.events {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.event-card {
		margin-bottom: 0.5rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		overflow: hidden;
		background: white;
	}

	.event-header {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: white;
		border: none;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.event-header:hover {
		background: #f9fafb;
	}

	.event-main {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.event-icon {
		font-size: 1.5rem;
	}

	.event-info {
		text-align: left;
	}

	.event-type {
		font-size: 0.875rem;
		font-weight: 700;
		color: #111827;
		font-family: 'Courier New', monospace;
	}

	.event-detail {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.event-time {
		font-size: 0.75rem;
		color: #9ca3af;
		font-family: 'Courier New', monospace;
	}

	.event-json {
		padding: 0.75rem 1rem;
		background: #fafafa;
		border-top: 1px solid #e5e7eb;
	}

	.event-json pre {
		margin: 0;
		font-family: 'Courier New', monospace;
		font-size: 0.75rem;
		color: #1f2937;
		overflow-x: auto;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		color: #9ca3af;
	}

	.empty-state svg {
		margin-bottom: 1rem;
	}

	.empty-text {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.empty-hint {
		font-size: 0.875rem;
		color: #d1d5db;
		text-align: center;
	}
</style>
