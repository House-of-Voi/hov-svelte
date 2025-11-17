<script lang="ts">
	import type { LoggedMessage, MessageDirection } from '$lib/testing/types';

	interface Props {
		messages: LoggedMessage[];
		onClear: () => void;
	}

	let { messages = [], onClear }: Props = $props();

	let filterDirection = $state<MessageDirection | 'all'>('all');
	let filterType = $state<string>('all');
	let expandedMessages = $state<Set<string>>(new Set());

	// Get unique message types
	let messageTypes = $derived(() => {
		const types = new Set(messages.map((m) => m.messageType));
		return Array.from(types).sort();
	});

	// Filtered messages
	let filteredMessages = $derived(() => {
		return messages.filter((msg) => {
			if (filterDirection !== 'all' && msg.direction !== filterDirection) {
				return false;
			}
			if (filterType !== 'all' && msg.messageType !== filterType) {
				return false;
			}
			return true;
		});
	});

	function toggleExpanded(id: string) {
		const newSet = new Set(expandedMessages);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		expandedMessages = newSet;
	}

	function formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			fractionalSecondDigits: 3
		});
	}

	function exportLog() {
		const dataStr = JSON.stringify(messages, null, 2);
		const dataBlob = new Blob([dataStr], { type: 'application/json' });
		const url = URL.createObjectURL(dataBlob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `postmessage-log-${Date.now()}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}

	function copyMessage(message: unknown) {
		const json = JSON.stringify(message, null, 2);
		navigator.clipboard.writeText(json).then(() => {
			// Could add a toast notification here
		});
	}
</script>

<div class="message-log">
	<!-- Header -->
	<div class="log-header">
		<div class="log-title">
			Message Log <span class="count">({filteredMessages().length})</span>
		</div>
		<div class="header-actions">
			<button onclick={exportLog} class="action-btn" title="Export log as JSON">
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
				</svg>
			</button>
			<button onclick={onClear} class="action-btn" title="Clear log">
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Filters -->
	<div class="filters">
		<div class="filter-group">
			<label for="filter-direction">Direction</label>
			<select id="filter-direction" bind:value={filterDirection} class="filter-select">
				<option value="all">All</option>
				<option value="sent">Sent</option>
				<option value="received">Received</option>
			</select>
		</div>

		<div class="filter-group">
			<label for="filter-type">Type</label>
			<select id="filter-type" bind:value={filterType} class="filter-select">
				<option value="all">All</option>
				{#each messageTypes() as type}
					<option value={type}>{type}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- Messages -->
	<div class="messages">
		{#each filteredMessages() as msg (msg.id)}
			<div class="message-item" class:expanded={expandedMessages.has(msg.id)}>
				<button class="message-header" onclick={() => toggleExpanded(msg.id)}>
					<div class="message-info">
						<span class="direction-badge" class:sent={msg.direction === 'sent'}>
							{msg.direction === 'sent' ? '→' : '←'}
						</span>
						<span class="message-type">{msg.messageType}</span>
						<span class="timestamp">{formatTime(msg.timestamp)}</span>
					</div>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						class="chevron"
					>
						<path d="M6 9l6 6 6-6" />
					</svg>
				</button>

				{#if expandedMessages.has(msg.id)}
					<div class="message-content">
						<div class="content-actions">
							<button onclick={() => copyMessage(msg.message)} class="copy-btn" title="Copy to clipboard">
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
									<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
								</svg>
								Copy
							</button>
						</div>
						<pre class="json-content">{JSON.stringify(msg.message, null, 2)}</pre>
					</div>
				{/if}
			</div>
		{:else}
			<div class="empty-state">No messages logged yet</div>
		{/each}
	</div>
</div>

<style>
	.message-log {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: white;
	}

	.log-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.log-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: #111827;
	}

	.count {
		color: #6b7280;
		font-weight: 400;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
	}

	.action-btn {
		padding: 0.5rem;
		background: transparent;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.15s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #6b7280;
	}

	.action-btn:hover {
		background: #f9fafb;
		border-color: #9ca3af;
		color: #374151;
	}

	.filters {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
	}

	.filter-group label {
		font-size: 0.75rem;
		font-weight: 500;
		color: #6b7280;
	}

	.filter-select {
		padding: 0.375rem 0.5rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		background: white;
	}

	.messages {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.message-item {
		margin-bottom: 0.5rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		overflow: hidden;
		transition: all 0.15s ease;
	}

	.message-item:hover {
		border-color: #d1d5db;
	}

	.message-item.expanded {
		border-color: #3b82f6;
	}

	.message-header {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		background: white;
		border: none;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.message-header:hover {
		background: #f9fafb;
	}

	.message-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.direction-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: #dbeafe;
		color: #1e40af;
		border-radius: 0.25rem;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.direction-badge.sent {
		background: #dcfce7;
		color: #15803d;
	}

	.message-type {
		font-size: 0.875rem;
		font-weight: 600;
		color: #111827;
		font-family: 'Courier New', monospace;
	}

	.timestamp {
		font-size: 0.75rem;
		color: #9ca3af;
		font-family: 'Courier New', monospace;
	}

	.chevron {
		transition: transform 0.15s ease;
		color: #9ca3af;
	}

	.message-item.expanded .chevron {
		transform: rotate(180deg);
	}

	.message-content {
		padding: 0 0.75rem 0.75rem;
		background: #fafafa;
	}

	.content-actions {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 0.5rem;
	}

	.copy-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.15s ease;
		color: #6b7280;
	}

	.copy-btn:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.json-content {
		margin: 0;
		padding: 0.75rem;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		overflow-x: auto;
		font-family: 'Courier New', monospace;
		font-size: 0.75rem;
		color: #1f2937;
	}

	.empty-state {
		padding: 2rem;
		text-align: center;
		color: #9ca3af;
		font-size: 0.875rem;
	}
</style>
