<script lang="ts">
	import { goto } from '$app/navigation';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import DeleteUserModal from './DeleteUserModal.svelte';

	interface ReferralInfo {
		isActive: boolean;
		referrerName: string;
	}

	interface WaitlistUser {
		id: string;
		primary_email: string;
		display_name: string | null;
		waitlist_position: number | null;
		waitlist_joined_at: string | null;
		game_access_granted: boolean;
		created_at: string;
		referral: ReferralInfo | null;
	}

	interface Props {
		waitlistUsers: WaitlistUser[];
		approvedCount: number;
		totalWaitlistCount: number;
		showReferredOnly: boolean;
	}

	let {
		waitlistUsers,
		approvedCount,
		totalWaitlistCount,
		showReferredOnly
	}: Props = $props();

	let waitlist = $state([...waitlistUsers]);
	let loading = $state<string | null>(null);
	let status = $state<{ type: 'success' | 'error'; message: string } | null>(null);
	let deleteModalUser = $state<{ id: string; email: string; name?: string | null } | null>(null);
	let editingPosition = $state<string | null>(null);
	let editPositionValue = $state('');
	let selectedUsers = $state(new Set<string>());
	let bulkReorderPosition = $state('');
	let bulkReorderLoading = $state(false);

	$effect(() => {
		waitlist = [...waitlistUsers];
		selectedUsers = new Set();
	});

	const sortedUsers = $derived(
		[...waitlist].sort((a, b) => {
			if (a.waitlist_position === null && b.waitlist_position === null) return 0;
			if (a.waitlist_position === null) return 1;
			if (b.waitlist_position === null) return -1;
			return a.waitlist_position - b.waitlist_position;
		})
	);

	function clearStatusAfter(delayMs: number) {
		setTimeout(() => {
			status = null;
		}, delayMs);
	}

	function handleFilterChange(enabled: boolean) {
		const params = new URLSearchParams(window.location.search);

		if (enabled) {
			params.set('filter', 'referred');
		} else {
			params.delete('filter');
		}

		const query = params.toString();
		goto(`/admin/waitlist${query ? `?${query}` : ''}`);
	}

	async function handleGrantAccess(profileId: string, email: string) {
		loading = profileId;
		status = null;

		try {
			const response = await fetch('/api/admin/grant-access', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ profileId })
			});

			const result = await response.json();

			if (!response.ok || !result.ok) {
				throw new Error(result.error || 'Failed to grant access');
			}

			status = {
				type: 'success',
				message: `Access granted to ${email}. Refreshing...`
			};

			setTimeout(() => {
				window.location.reload();
			}, 1500);
		} catch (error) {
			console.error('Grant access error:', error);
			status = {
				type: 'error',
				message: error instanceof Error ? error.message : 'Failed to grant access'
			};
		} finally {
			loading = null;
		}
	}

	function handleDeleteSuccess() {
		deleteModalUser = null;
		status = {
			type: 'success',
			message: 'User deactivated successfully. Refreshing...'
		};

		setTimeout(() => {
			window.location.reload();
		}, 1500);
	}

	function handleStartEditPosition(userId: string, currentPosition: number | null) {
		editingPosition = userId;
		editPositionValue = currentPosition?.toString() ?? '';
	}

	function handleCancelEditPosition() {
		editingPosition = null;
		editPositionValue = '';
	}

	async function handleSavePosition(userId: string) {
		const newPosition = parseInt(editPositionValue, 10);

		if (Number.isNaN(newPosition) || newPosition <= 0) {
			status = { type: 'error', message: 'Position must be a positive number' };
			clearStatusAfter(3000);
			return;
		}

		loading = userId;
		status = null;

		try {
			const response = await fetch(`/api/admin/players/${userId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ waitlist_position: newPosition })
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to update position');
			}

			status = { type: 'success', message: 'Position updated successfully. Refreshing...' };
			editingPosition = null;

			setTimeout(() => {
				window.location.reload();
			}, 1500);
		} catch (error) {
			console.error('Update position error:', error);
			status = {
				type: 'error',
				message: error instanceof Error ? error.message : 'Failed to update position'
			};
		} finally {
			loading = null;
		}
	}

	function handleToggleSelect(userId: string) {
		const next = new Set(selectedUsers);
		if (next.has(userId)) {
			next.delete(userId);
		} else {
			next.add(userId);
		}
		selectedUsers = next;
	}

	function handleSelectAll() {
		if (selectedUsers.size === sortedUsers.length && sortedUsers.length > 0) {
			selectedUsers = new Set();
		} else {
			selectedUsers = new Set(sortedUsers.map((user) => user.id));
		}
	}

	async function handleBulkReorder() {
		if (selectedUsers.size === 0) {
			status = { type: 'error', message: 'Please select users to reorder' };
			clearStatusAfter(3000);
			return;
		}

		const startPosition = parseInt(bulkReorderPosition, 10);

		if (Number.isNaN(startPosition) || startPosition <= 0) {
			status = { type: 'error', message: 'Starting position must be a positive number' };
			clearStatusAfter(3000);
			return;
		}

		bulkReorderLoading = true;
		status = null;

		try {
			const updates = Array.from(selectedUsers).map((userId, index) => ({
				profileId: userId,
				newPosition: startPosition + index
			}));

			const response = await fetch('/api/admin/waitlist/reorder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ updates })
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to reorder users');
			}

			status = {
				type: 'success',
				message: `Successfully reordered ${result.updated_count} user(s). Refreshing...`
			};

			selectedUsers = new Set();
			bulkReorderPosition = '';

			setTimeout(() => {
				window.location.reload();
			}, 1500);
		} catch (error) {
			console.error('Bulk reorder error:', error);
			status = {
				type: 'error',
				message: error instanceof Error ? error.message : 'Failed to reorder users'
			};
		} finally {
			bulkReorderLoading = false;
		}
	}
</script>

<div class="space-y-8">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-4xl font-black text-warning-500 dark:text-warning-400 neon-text uppercase">
				Waitlist Management
			</h1>
			<p class="text-neutral-600 dark:text-neutral-400 mt-2">
				Approve users for game access
			</p>
		</div>
		<a href="/admin">
			<Button variant="ghost" size="sm">← Back to Admin</Button>
		</a>
	</div>

	{#if status}
		<div
			class="p-6 rounded-xl text-center font-semibold text-lg {status.type === 'success'
				? 'bg-success-100 dark:bg-success-500/20 text-success-600 dark:text-success-400 border-2 border-success-300 dark:border-success-500/30'
				: 'bg-error-100 dark:bg-error-500/20 text-error-600 dark:text-error-400 border-2 border-error-300 dark:border-error-500/30'}"
		>
			{status.message}
		</div>
	{/if}

	<div class="grid md:grid-cols-2 gap-6">
		<Card glow>
			<CardContent class="p-8 text-center">
				<div class="text-5xl font-black text-warning-500 dark:text-warning-400 mb-2">
					{showReferredOnly ? waitlistUsers.length : totalWaitlistCount}
				</div>
				<div class="text-neutral-600 dark:text-neutral-400 uppercase tracking-wider text-sm">
					{showReferredOnly ? 'Referred Users' : 'On Waitlist'}
				</div>
			</CardContent>
		</Card>

		<Card glow>
			<CardContent class="p-8 text-center">
				<div class="text-5xl font-black text-success-600 dark:text-success-400 mb-2">
					{approvedCount}
				</div>
				<div class="text-neutral-600 dark:text-neutral-400 uppercase tracking-wider text-sm">
					Approved Users
				</div>
			</CardContent>
		</Card>
	</div>

	{#if selectedUsers.size > 0}
		<Card>
			<CardContent class="p-6">
				<div class="flex items-center gap-4 flex-wrap">
					<span class="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
						{selectedUsers.size} user{selectedUsers.size !== 1 ? 's' : ''} selected
					</span>
					<div class="flex items-center gap-2 flex-1 min-w-[220px]">
						<label for="bulk-position" class="text-sm text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
							Move to position:
						</label>
						<input
							id="bulk-position"
							type="number"
							min="1"
							bind:value={bulkReorderPosition}
							placeholder="e.g., 1"
							class="w-24 px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-warning-500"
						/>
						<Button
							variant="primary"
							size="sm"
							onclick={handleBulkReorder}
							disabled={bulkReorderLoading || !bulkReorderPosition}
							loading={bulkReorderLoading}
						>
							Apply Reorder
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={() => (selectedUsers = new Set())}
							disabled={bulkReorderLoading}
						>
							Clear Selection
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	{/if}

	<Card>
		<CardHeader>
			<div class="flex items-center justify-between gap-4 flex-wrap">
				<h2 class="text-2xl font-bold text-warning-500 dark:text-warning-400 uppercase">
					Pending Approval
				</h2>
				<div class="flex items-center gap-3">
					<span class="text-sm text-neutral-600 dark:text-neutral-400">Referred Only</span>
					<button
						type="button"
						role="switch"
						aria-checked={showReferredOnly}
						onclick={() => handleFilterChange(!showReferredOnly)}
						class="{showReferredOnly
							? 'bg-warning-500'
							: 'bg-neutral-300 dark:bg-neutral-600'} relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-warning-500 focus:ring-offset-2 cursor-pointer"
					>
						<span class="sr-only">Show referred users only</span>
						<span
							class="{showReferredOnly ? 'translate-x-5' : 'translate-x-1'} inline-block h-3 w-3 transform rounded-full bg-white transition-transform shadow-sm"
						/>
					</button>
					{#if showReferredOnly}
						<span class="text-xs text-neutral-500 dark:text-neutral-500">
							({waitlistUsers.length}/{totalWaitlistCount})
						</span>
					{/if}
				</div>
			</div>
		</CardHeader>
		<CardContent>
			{#if waitlistUsers.length === 0}
				<div class="text-center py-12 text-neutral-600 dark:text-neutral-500">
					No users on waitlist
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-b border-warning-200 dark:border-warning-900/20">
								<th class="text-left py-3 px-4 w-12">
									<input
										type="checkbox"
										checked={selectedUsers.size === sortedUsers.length && sortedUsers.length > 0}
										onchange={() => handleSelectAll()}
										class="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-warning-500 focus:ring-warning-500 cursor-pointer"
										aria-label="Select all users"
									/>
								</th>
								<th class="text-left py-3 px-4 text-neutral-600 dark:text-neutral-400 font-semibold uppercase text-sm">
									User
								</th>
								<th class="text-left py-3 px-4 text-neutral-600 dark:text-neutral-400 font-semibold uppercase text-sm">
									Joined
								</th>
								<th class="text-left py-3 px-4 text-neutral-600 dark:text-neutral-400 font-semibold uppercase text-sm">
									Referral
								</th>
								<th class="text-left py-3 px-4 text-neutral-600 dark:text-neutral-400 font-semibold uppercase text-sm">
									Position
								</th>
								<th class="text-right py-3 px-4 text-neutral-600 dark:text-neutral-400 font-semibold uppercase text-sm">
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{#each sortedUsers as user (user.id)}
								<tr class="border-b border-warning-200/20 dark:border-warning-900/10 hover:bg-warning-50 dark:hover:bg-warning-500/5">
									<td class="py-4 px-4">
										<input
											type="checkbox"
											checked={selectedUsers.has(user.id)}
											onchange={() => handleToggleSelect(user.id)}
											class="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-warning-500 focus:ring-warning-500 cursor-pointer"
											aria-label={`Select ${user.display_name || user.primary_email}`}
										/>
									</td>
									<td class="py-4 px-4">
										<div class="flex items-center gap-2">
											{#if user.referral}
												<span
													class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-warning-100 dark:bg-warning-500/20 text-warning-700 dark:text-warning-400"
													title="Referred user"
												>
													⭐
												</span>
											{/if}
											<div>
												<div class="font-semibold text-neutral-800 dark:text-neutral-200">
													{user.display_name || user.primary_email}
												</div>
												{#if user.display_name}
													<div class="text-sm text-neutral-600 dark:text-neutral-500">
														{user.primary_email}
													</div>
												{/if}
											</div>
										</div>
									</td>
									<td class="py-4 px-4 text-neutral-600 dark:text-neutral-400">
										{#if user.waitlist_joined_at}
											{new Date(user.waitlist_joined_at).toLocaleDateString()}
										{:else}
											{new Date(user.created_at).toLocaleDateString()}
										{/if}
									</td>
									<td class="py-4 px-4">
										{#if user.referral}
											<div>
												<div class="text-sm text-neutral-700 dark:text-neutral-300">
													{user.referral.referrerName}
												</div>
												<div
													class="text-xs mt-1 {user.referral.isActive
														? 'text-success-600 dark:text-success-400'
														: 'text-warning-600 dark:text-warning-400'}"
												>
													{user.referral.isActive ? 'Active' : 'Inactive'}
												</div>
											</div>
										{:else}
											<span class="text-neutral-600 dark:text-neutral-500">No referral</span>
										{/if}
									</td>
									<td class="py-4 px-4">
										{#if editingPosition === user.id}
											<div class="flex items-center gap-2">
												<input
													type="number"
													min="1"
													bind:value={editPositionValue}
													class="w-20 px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-warning-500"
													onkeydown={(event) => {
														if (event.key === 'Enter') handleSavePosition(user.id);
														if (event.key === 'Escape') handleCancelEditPosition();
													}}
													autofocus
												/>
												<button
													onclick={() => handleSavePosition(user.id)}
													disabled={loading === user.id}
													class="text-success-600 dark:text-success-400 hover:text-success-700 dark:hover:text-success-300 disabled:opacity-50"
													title="Save"
												>
													✓
												</button>
												<button
													onclick={handleCancelEditPosition}
													disabled={loading === user.id}
													class="text-error-600 dark:text-error-400 hover:text-error-700 dark:hover:text-error-300 disabled:opacity-50"
													title="Cancel"
												>
													✕
												</button>
											</div>
										{:else}
											<button
												onclick={() => handleStartEditPosition(user.id, user.waitlist_position)}
												class="text-neutral-600 dark:text-neutral-400 hover:text-warning-600 dark:hover:text-warning-400 flex items-center gap-1 group"
												title="Click to edit position"
											>
												<span class="font-mono">{user.waitlist_position ?? '—'}</span>
												<span class="opacity-0 group-hover:opacity-100 text-xs">✎</span>
											</button>
										{/if}
									</td>
									<td class="py-4 px-4 text-right">
										<div class="flex items-center justify-end gap-2">
											<Button
												variant="primary"
												size="sm"
												onclick={() => handleGrantAccess(user.id, user.primary_email)}
												disabled={loading === user.id}
												loading={loading === user.id}
											>
												Grant Access
											</Button>
											<Button
												variant="outline"
												size="sm"
												onclick={() =>
													(deleteModalUser = {
														id: user.id,
														email: user.primary_email,
														name: user.display_name
													})}
												disabled={loading === user.id}
												class="text-error-600 dark:text-error-400 border-error-300 dark:border-error-700 hover:bg-error-50 dark:hover:bg-error-900/20"
											>
												Deactivate
											</Button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</CardContent>
	</Card>

	{#if deleteModalUser}
		<DeleteUserModal
			isOpen={true}
			onClose={() => (deleteModalUser = null)}
			userId={deleteModalUser.id}
			userEmail={deleteModalUser.email}
			userName={deleteModalUser.name}
			onSuccess={handleDeleteSuccess}
		/>
	{/if}
</div>
