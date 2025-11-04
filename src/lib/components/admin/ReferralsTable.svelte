<script lang="ts">
	import { onMount } from 'svelte';
	import type { ReferralCodeItem, ReferralStats, PaginatedResponse } from '$lib/types/admin';

	const PAGE_LIMIT = 50;

	let referrals = $state<ReferralCodeItem[]>([]);
	let stats = $state<ReferralStats | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let statusFilter = $state<'all' | 'active' | 'pending' | 'converted' | 'deactivated'>('all');
	let pagination = $state({
		page: 1,
		limit: PAGE_LIMIT,
		total: 0,
		total_pages: 0
	});

	async function fetchStats() {
		try {
			const response = await fetch('/api/admin/referrals?stats_only=true');
			const data = await response.json();

			if (data.success) {
				stats = data.data as ReferralStats;
			}
		} catch (err) {
			console.error('Error fetching referral stats:', err);
		}
	}

	async function fetchReferrals(page = pagination.page) {
		try {
			loading = true;
			error = null;

			const params = new URLSearchParams({
				page: page.toString(),
				limit: pagination.limit.toString()
			});

			if (statusFilter !== 'all') {
				params.append('status', statusFilter);
			}

			const response = await fetch(`/api/admin/referrals?${params.toString()}`);
			const data = await response.json();

			if (data.success) {
				const result = data.data as PaginatedResponse<ReferralCodeItem>;
				referrals = result.data;
				pagination = result.pagination;
			} else {
				error = data.error || 'Failed to fetch referrals';
			}
		} catch (err) {
			console.error('Error fetching referrals:', err);
			error = 'Failed to load referrals';
		} finally {
			loading = false;
		}
	}

	function handleStatusChange(value: string) {
		statusFilter = value as typeof statusFilter;
		pagination = { ...pagination, page: 1 };
		fetchReferrals(1);
	}

	function goToPage(page: number) {
		if (page < 1 || page > pagination.total_pages || page === pagination.page) return;
		pagination = { ...pagination, page };
		fetchReferrals(page);
	}

	function getStatusBadge(referral: ReferralCodeItem) {
		if (referral.deactivated_at) {
			return {
				label: 'Deactivated',
				classes:
					'px-2 py-1 text-xs font-semibold rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-700'
			};
		}

		if (referral.converted_at) {
			return {
				label: 'Converted',
				classes:
					'px-2 py-1 text-xs font-semibold rounded-full bg-success-100 dark:bg-success-900/30 text-success-800 dark:text-success-400 border border-success-300 dark:border-success-700'
			};
		}

		if (referral.attributed_at) {
			return {
				label: 'Pending',
				classes:
					'px-2 py-1 text-xs font-semibold rounded-full bg-warning-100 dark:bg-warning-900/30 text-warning-800 dark:text-warning-400 border border-warning-300 dark:border-warning-700'
			};
		}

		return {
			label: 'Active',
			classes:
				'px-2 py-1 text-xs font-semibold rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-400 border border-primary-300 dark:border-primary-700'
		};
	}

	onMount(() => {
		fetchReferrals();
		fetchStats();
	});
</script>

{#if error}
	<div class="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg p-4 text-error-800 dark:text-error-400">
		{error}
	</div>
{:else}
	<div class="space-y-6">
		{#if stats}
			<div class="grid grid-cols-1 md:grid-cols-6 gap-4">
				<div class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
					<div class="text-sm text-neutral-600 dark:text-neutral-400">Total Codes</div>
					<div class="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{stats.total_codes}</div>
				</div>
				<div class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
					<div class="text-sm text-neutral-600 dark:text-neutral-400">Active</div>
					<div class="text-2xl font-bold text-primary-600 dark:text-primary-400">{stats.active_codes}</div>
				</div>
				<div class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
					<div class="text-sm text-neutral-600 dark:text-neutral-400">Pending</div>
					<div class="text-2xl font-bold text-warning-600 dark:text-warning-400">{stats.pending_codes}</div>
				</div>
				<div class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
					<div class="text-sm text-neutral-600 dark:text-neutral-400">Converted</div>
					<div class="text-2xl font-bold text-success-600 dark:text-success-400">{stats.converted_codes}</div>
				</div>
				<div class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
					<div class="text-sm text-neutral-600 dark:text-neutral-400">Conversion Rate</div>
					<div class="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{stats.conversion_rate.toFixed(1)}%</div>
				</div>
				<div class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
					<div class="text-sm text-neutral-600 dark:text-neutral-400">Credits Distributed</div>
					<div class="text-2xl font-bold text-accent-600 dark:text-accent-400">
						{parseFloat(stats.total_credits_distributed).toFixed(2)}
					</div>
				</div>
			</div>
		{/if}

		<div class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div>
					<select
						bind:value={statusFilter}
						onchange={(event) => handleStatusChange((event.target as HTMLSelectElement).value)}
						class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
					>
						<option value="all">All Status</option>
						<option value="active">Active</option>
						<option value="pending">Pending</option>
						<option value="converted">Converted</option>
						<option value="deactivated">Deactivated</option>
					</select>
				</div>
				<div class="md:col-span-2 flex items-center justify-end">
					<button
						onclick={() => fetchReferrals()}
						class="px-4 py-2 bg-primary-600 dark:bg-primary-500 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors font-medium"
					>
						Refresh
					</button>
				</div>
			</div>
		</div>

		<div class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
			{#if loading}
				<div class="p-8 text-center text-neutral-500 dark:text-neutral-400">Loading referrals...</div>
			{:else if referrals.length === 0}
				<div class="p-8 text-center text-neutral-500 dark:text-neutral-400">No referrals found</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700">
						<thead class="bg-neutral-50 dark:bg-neutral-900/50">
							<tr>
								<th class="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
									Code
								</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
									Referrer
								</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
									Referred User
								</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
									Status
								</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
									Plays
								</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
									Created
								</th>
							</tr>
						</thead>
						<tbody class="bg-white dark:bg-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-700">
							{#each referrals as referral (referral.id)}
								{@const status = getStatusBadge(referral)}
								<tr class="hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors">
									<td class="px-6 py-4 whitespace-nowrap">
										<code class="px-2 py-1 text-sm font-mono bg-neutral-100 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded">
											{referral.code}
										</code>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div>
											<div class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
												{referral.referrer_display_name || 'No name'}
											</div>
											<div class="text-sm text-neutral-500 dark:text-neutral-400">{referral.referrer_email}</div>
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										{#if referral.referred_profile_id}
											<div>
												<div class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
													{referral.referred_display_name || 'No name'}
												</div>
												<div class="text-sm text-neutral-500 dark:text-neutral-400">
													{referral.referred_email}
												</div>
											</div>
										{:else}
											<span class="text-sm text-neutral-400 dark:text-neutral-500">Not used yet</span>
										{/if}
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<span class={status.classes}>{status.label}</span>
									</td>
									<td class="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-400">
										{referral.referred_user_plays || 0}
									</td>
									<td class="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-400">
										{new Date(referral.created_at).toLocaleDateString()}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
					<div class="text-sm text-neutral-600 dark:text-neutral-400">
						Showing {(pagination.page - 1) * pagination.limit + 1}
						to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} referrals
					</div>
					<div class="flex gap-2 items-center">
						<button
							onclick={() => goToPage(pagination.page - 1)}
							disabled={pagination.page === 1}
							class="px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
						>
							Previous
						</button>
						<span class="px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300">
							Page {pagination.page} of {pagination.total_pages}
						</span>
						<button
							onclick={() => goToPage(pagination.page + 1)}
							disabled={pagination.page >= pagination.total_pages}
							class="px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
						>
							Next
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
