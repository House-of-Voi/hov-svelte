<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import ChainBadge from '$lib/components/ui/ChainBadge.svelte';
	import type { PlayerListItem, PaginatedResponse } from '$lib/types/admin';

	const PAGE_LIMIT = 50;

	let players = $state<PlayerListItem[]>([]);
	let pagination = $state({
		page: 1,
		limit: PAGE_LIMIT,
		total: 0,
		total_pages: 0
	});
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Filter states
	let search = $state('');
	let gameAccessFilter = $state('all');
	let waitlistFilter = $state('all');

	// Selection state
	let selectedPlayers = $state(new Set<string>());

	// Reactive query params
	let currentPage = $state(1);
	const filtersKey = $derived(() => `${search}|${gameAccessFilter}|${waitlistFilter}`);
	let lastFiltersKey = '';

	async function fetchPlayers({
		page,
		searchTerm,
		gameAccess,
		waitlistStatus
	}: {
		page: number;
		searchTerm: string;
		gameAccess: string;
		waitlistStatus: string;
	}) {
		try {
			loading = true;
			error = null;

			const params = new URLSearchParams({
				page: page.toString(),
				limit: PAGE_LIMIT.toString()
			});

			if (searchTerm) params.append('search', searchTerm);
			if (gameAccess !== 'all') params.append('game_access', gameAccess);
			if (waitlistStatus !== 'all') params.append('on_waitlist', waitlistStatus);

			const response = await fetch(`/api/admin/players?${params}`);
			const data = await response.json();

			if (!data.success) {
				throw new Error(data.error || 'Failed to fetch players');
			}

			const result = data.data as PaginatedResponse<PlayerListItem>;
			players = result.data;
			pagination = result.pagination;
		} catch (err) {
			console.error('Error fetching players:', err);
			error = err instanceof Error ? err.message : 'Failed to load players';
		} finally {
			loading = false;
		}
	}

	async function handleBulkAction(action: string) {
		if (selectedPlayers.size === 0) {
			alert('No players selected');
			return;
		}

		const playerIds = Array.from(selectedPlayers);

		try {
			const response = await fetch(`/api/admin/players/bulk?action=${action}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ player_ids: playerIds })
			});

			const data = await response.json();

			if (data.success) {
				alert(data.message);
				selectedPlayers = new Set();
				await fetchPlayers({
					page: currentPage,
					searchTerm: search,
					gameAccess: gameAccessFilter,
					waitlistStatus: waitlistFilter
				});
			} else {
				alert(data.error || 'Action failed');
			}
		} catch (err) {
			console.error('Bulk action error:', err);
			alert('Failed to perform bulk action');
		}
	}

	function togglePlayerSelection(playerId: string) {
		if (selectedPlayers.has(playerId)) {
			selectedPlayers.delete(playerId);
		} else {
			selectedPlayers.add(playerId);
		}
		selectedPlayers = selectedPlayers; // Trigger reactivity
	}

	function toggleSelectAll() {
		if (selectedPlayers.size === players.length) {
			selectedPlayers = new Set();
		} else {
			selectedPlayers = new Set(players.map((p) => p.id));
		}
	}

	function formatNumberCompact(num: number): string {
		if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
		if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
		return num.toString();
	}

	$effect(() => {
		const page = currentPage;
		const searchTerm = search;
		const gameAccess = gameAccessFilter;
		const waitlistStatus = waitlistFilter;
		const key = filtersKey;
		const filtersChanged = key !== lastFiltersKey;

		if (filtersChanged) {
			lastFiltersKey = key;
			if (page !== 1) {
				currentPage = 1;
				return;
			}
		} else {
			lastFiltersKey = key;
		}

		fetchPlayers({
			page,
			searchTerm,
			gameAccess,
			waitlistStatus
		});
	});
</script>

<div class="space-y-4">
	<!-- Filters -->
	<Card>
		<CardContent>
			<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
				<input
					type="text"
					placeholder="Search by email or name..."
					bind:value={search}
					class="px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
				/>
				<select
					bind:value={gameAccessFilter}
					class="px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
				>
					<option value="all">All Players</option>
					<option value="true">Has Access</option>
					<option value="false">No Access</option>
				</select>
				<select
					bind:value={waitlistFilter}
					class="px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
				>
					<option value="all">All Status</option>
					<option value="true">On Waitlist</option>
					<option value="false">Not on Waitlist</option>
				</select>
				<button
					onclick={() =>
						fetchPlayers({
							page: currentPage,
							searchTerm: search,
							gameAccess: gameAccessFilter,
							waitlistStatus: waitlistFilter
						})}
					class="px-4 py-2 bg-primary-600 dark:bg-primary-500 text-white rounded-lg font-bold uppercase tracking-wide hover:bg-primary-700 dark:hover:bg-primary-600 transition-all"
				>
					Refresh
				</button>
			</div>
		</CardContent>
	</Card>

	<!-- Bulk Actions -->
	{#if selectedPlayers.size > 0}
		<Card>
			<CardContent>
				<div class="flex items-center justify-between">
					<span class="text-primary-600 dark:text-primary-400 font-bold">
						{selectedPlayers.size} player(s) selected
					</span>
					<div class="space-x-2">
						<button
							onclick={() => handleBulkAction('grant-access')}
							class="px-4 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700"
						>
							Grant Access
						</button>
						<button
							onclick={() => handleBulkAction('revoke-access')}
							class="px-4 py-2 bg-ruby-600 text-white rounded-lg font-bold hover:bg-ruby-700"
						>
							Revoke
						</button>
						<button
							onclick={() => (selectedPlayers = new Set())}
							class="px-4 py-2 bg-neutral-700 text-white rounded-lg font-bold hover:bg-neutral-600"
						>
							Clear
						</button>
					</div>
				</div>
			</CardContent>
		</Card>
	{/if}

	<!-- Table -->
	<Card>
		<CardContent>
			{#if error}
				<div class="text-error-600 dark:text-error-400 p-4">{error}</div>
			{:else if loading}
				<div class="p-8 text-center text-neutral-500">Loading players...</div>
			{:else if players.length === 0}
				<div class="p-8 text-center text-neutral-500">No players found</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full">
						<thead class="border-b border-neutral-200 dark:border-neutral-700">
							<tr>
								<th class="px-4 py-3 text-left">
									<input
										type="checkbox"
										checked={selectedPlayers.size === players.length && players.length > 0}
										onchange={toggleSelectAll}
										class="rounded border-neutral-300 dark:border-neutral-700"
									/>
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider"
								>
									Player
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider"
								>
									Accounts
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider"
								>
									Access
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider"
								>
									Stats
								</th>
								<th
									class="px-6 py-3 text-right text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider"
								>
									Actions
								</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-neutral-200 dark:divide-neutral-700">
							{#each players as player (player.id)}
								<tr
									class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
								>
									<td class="px-4 py-4">
										<input
											type="checkbox"
											checked={selectedPlayers.has(player.id)}
											onchange={() => togglePlayerSelection(player.id)}
											class="rounded border-neutral-300 dark:border-neutral-700"
										/>
									</td>
									<td class="px-6 py-4">
										<div>
											<div class="font-semibold text-neutral-800 dark:text-neutral-200">
												{player.display_name || 'No name'}
											</div>
											<div class="text-sm text-neutral-600 dark:text-neutral-500">
												{player.primary_email}
											</div>
										</div>
									</td>
									<td class="px-6 py-4">
										<div class="space-y-1">
											{#each player.accounts as account, idx (idx)}
												<div class="flex items-center gap-2">
													<ChainBadge
														chain={account.chain as 'base' | 'voi' | 'solana'}
													/>
													<span
														class="text-xs text-neutral-600 dark:text-neutral-400 font-mono"
													>
														{account.address.slice(0, 6)}...{account.address.slice(
															-4
														)}
													</span>
													{#if account.is_primary}
														<span class="text-xs text-primary-600 dark:text-primary-400"
															>★</span
														>
													{/if}
												</div>
											{/each}
										</div>
									</td>
									<td class="px-6 py-4">
										{#if player.game_access_granted}
											<span
												class="px-2 py-1 text-xs font-bold rounded-full bg-success-100 dark:bg-success-500/20 text-success-600 dark:text-success-400 border border-success-300 dark:border-success-500/30"
											>
												GRANTED
											</span>
										{:else if player.waitlist_position !== null}
											<span
												class="px-2 py-1 text-xs font-bold rounded-full bg-warning-100 dark:bg-warning-900/30 text-warning-800 dark:text-warning-400 border border-warning-300 dark:border-warning-700"
											>
												WAITLIST #{player.waitlist_position}
											</span>
										{:else}
											<span
												class="px-2 py-1 text-xs font-bold rounded-full bg-neutral-200 dark:bg-neutral-700/50 text-neutral-700 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-600/30"
											>
												NO ACCESS
											</span>
										{/if}
									</td>
									<td class="px-6 py-4 text-sm text-neutral-600 dark:text-neutral-400">
										<div>{player.total_plays || 0} plays</div>
										<div class="text-xs">
											{formatNumberCompact(parseFloat(player.total_wagered || '0'))} wagered
										</div>
									</td>
									<td class="px-6 py-4 text-right">
										<a
											href="/admin/players/{player.id}"
											class="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-bold text-sm uppercase tracking-wide"
										>
											View →
										</a>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!-- Pagination -->
				<div
					class="px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between"
				>
					<div class="text-sm text-neutral-500">
						Showing {(pagination.page - 1) * pagination.limit + 1} to
						{Math.min(pagination.page * pagination.limit, pagination.total)} of
						{pagination.total} players
					</div>
					<div class="flex gap-2">
						<button
							onclick={() => (currentPage = currentPage - 1)}
							disabled={pagination.page === 1}
							class="px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm font-bold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all uppercase tracking-wide"
						>
							Prev
						</button>
						<span class="px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300">
							Page {pagination.page} of {pagination.total_pages}
						</span>
						<button
							onclick={() => (currentPage = currentPage + 1)}
							disabled={pagination.page >= pagination.total_pages}
							class="px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm font-bold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all uppercase tracking-wide"
						>
							Next
						</button>
					</div>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>
