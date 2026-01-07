<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { notificationStore } from '$lib/stores/notificationStore.svelte';
	import type { Token, ChainType, TokenStandard } from '$lib/types/token';

	interface ApiResult<T> {
		success: boolean;
		data?: T;
		error?: string;
		message?: string;
	}

	interface PaginatedResponse<T> {
		data: T[];
		pagination: {
			page: number;
			limit: number;
			total: number;
			total_pages: number;
		};
	}

	const PAGE_SIZE = 20;

	let tokens = $state<Token[]>([]);
	let page = $state(1);
	let pagination = $state({
		page: 1,
		limit: PAGE_SIZE,
		total: 0,
		total_pages: 0
	});

	// Filters
	let chainFilter = $state<ChainType | 'all'>('all');
	let standardFilter = $state<TokenStandard | 'all'>('all');
	let statusFilter = $state<'all' | 'active' | 'inactive'>('all');

	let loading = $state(true);
	let refreshing = $state(false);
	let error = $state<string | null>(null);

	let currentFetchController: AbortController | null = null;

	const fetchTokens = async (background = false) => {
		if (currentFetchController) {
			currentFetchController.abort();
		}
		currentFetchController = new AbortController();

		try {
			if (background) {
				refreshing = true;
			} else {
				loading = true;
				error = null;
			}

			const params = new URLSearchParams({
				page: page.toString(),
				limit: PAGE_SIZE.toString()
			});

			if (chainFilter !== 'all') params.set('chain', chainFilter);
			if (standardFilter !== 'all') params.set('token_standard', standardFilter);
			if (statusFilter === 'active') params.set('is_active', 'true');
			if (statusFilter === 'inactive') params.set('is_active', 'false');

			const response = await fetch(`/api/admin/tokens?${params.toString()}`, {
				cache: 'no-store',
				signal: currentFetchController.signal
			});
			const body: ApiResult<PaginatedResponse<Token>> = await response.json();

			if (body.success && body.data) {
				tokens = body.data.data;
				pagination = body.data.pagination;
			} else {
				error = body.error || 'Failed to fetch tokens';
			}
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				return;
			}
			console.error('Error fetching tokens:', err);
			error = 'Failed to load tokens';
		} finally {
			currentFetchController = null;
			if (background) {
				refreshing = false;
			} else {
				loading = false;
			}
		}
	};

	const handleToggleFlag = async (token: Token, flag: 'is_displayable' | 'is_game_enabled' | 'is_treasury_enabled' | 'is_active') => {
		const originalValue = token[flag];
		const tokenIndex = tokens.findIndex((t) => t.id === token.id);

		// Optimistic update
		if (tokenIndex !== -1) {
			tokens[tokenIndex] = { ...tokens[tokenIndex], [flag]: !originalValue };
			tokens = [...tokens];
		}

		try {
			const response = await fetch(`/api/admin/tokens/${token.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [flag]: !originalValue })
			});

			const result: ApiResult<Token> = await response.json();

			if (result.success) {
				const flagLabel = flag.replace('is_', '').replace('_', ' ');
				notificationStore.success(`Token ${flagLabel} ${!originalValue ? 'enabled' : 'disabled'}`);
				fetchTokens(true);
			} else {
				// Rollback
				if (tokenIndex !== -1) {
					tokens[tokenIndex] = { ...tokens[tokenIndex], [flag]: originalValue };
					tokens = [...tokens];
				}
				notificationStore.error(result.error || 'Failed to update token');
			}
		} catch (err) {
			// Rollback
			if (tokenIndex !== -1) {
				tokens[tokenIndex] = { ...tokens[tokenIndex], [flag]: originalValue };
				tokens = [...tokens];
			}
			console.error('Error updating token:', err);
			notificationStore.error('Failed to update token');
		}
	};

	const getDisplaySymbol = (token: Token) => token.display_symbol || token.symbol;
	const getDisplayName = (token: Token) => token.display_name || token.name;

	const getStandardLabel = (standard: TokenStandard) => {
		const labels: Record<TokenStandard, string> = {
			native: 'Native',
			voi_asa: 'ASA',
			voi_arc200: 'ARC200',
			base_erc20: 'ERC20',
			solana_spl: 'SPL'
		};
		return labels[standard] || standard;
	};

	const paginatedLabel = $derived(
		pagination.total === 0
			? 'No tokens'
			: `Showing ${(pagination.page - 1) * pagination.limit + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total}`
	);

	onMount(() => {
		fetchTokens();
	});
</script>

<svelte:head>
	<title>Tokens - Admin - House of Voi</title>
</svelte:head>

<div class="space-y-8 max-w-7xl mx-auto">
	<!-- Header -->
	<div class="flex items-center justify-between flex-wrap gap-4">
		<div>
			<h1 class="text-4xl font-semibold text-neutral-950 dark:text-white uppercase">Tokens</h1>
			<p class="text-neutral-700 dark:text-neutral-300 mt-2">
				Manage supported tokens across chains
			</p>
		</div>
		<div class="flex gap-2 flex-wrap">
			<button
				onclick={() => fetchTokens(true)}
				disabled={refreshing}
				class="px-4 py-2 text-sm border-2 rounded-lg font-medium transition-colors {refreshing
					? 'border-neutral-300 dark:border-neutral-700 text-neutral-400 dark:text-neutral-500 cursor-not-allowed'
					: 'border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950'}"
			>
				{refreshing ? 'Refreshing...' : 'Refresh'}
			</button>
			<a href="/admin/tokens/new">
				<Button variant="primary" size="sm">Add Token</Button>
			</a>
		</div>
	</div>

	<!-- Filters -->
	<Card>
		<CardContent>
			<div class="grid md:grid-cols-4 gap-4">
				<div>
					<select
						bind:value={chainFilter}
						onchange={() => {
							page = 1;
							fetchTokens();
						}}
						class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
					>
						<option value="all">All Chains</option>
						<option value="voi">VOI</option>
						<option value="base">Base</option>
						<option value="solana">Solana</option>
					</select>
				</div>
				<div>
					<select
						bind:value={standardFilter}
						onchange={() => {
							page = 1;
							fetchTokens();
						}}
						class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
					>
						<option value="all">All Standards</option>
						<option value="native">Native</option>
						<option value="voi_asa">ASA</option>
						<option value="voi_arc200">ARC200</option>
						<option value="base_erc20">ERC20</option>
						<option value="solana_spl">SPL</option>
					</select>
				</div>
				<div>
					<select
						bind:value={statusFilter}
						onchange={() => {
							page = 1;
							fetchTokens();
						}}
						class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
					>
						<option value="all">All Status</option>
						<option value="active">Active</option>
						<option value="inactive">Inactive</option>
					</select>
				</div>
				<div class="flex items-center justify-end text-xs text-neutral-600 dark:text-neutral-400">
					{paginatedLabel}
				</div>
			</div>
		</CardContent>
	</Card>

	<!-- Results -->
	{#if error}
		<Card>
			<CardContent>
				<div class="p-4 text-error-600 dark:text-error-400">{error}</div>
			</CardContent>
		</Card>
	{:else if loading}
		<Card>
			<CardContent>
				<div class="p-8 text-center text-neutral-500">Loading tokens...</div>
			</CardContent>
		</Card>
	{:else if tokens.length === 0}
		<Card>
			<CardContent>
				<div class="p-8 text-center">
					<div class="text-neutral-500 mb-4">No tokens match your filters.</div>
					<a href="/admin/tokens/new">
						<Button variant="primary" size="sm">Add Token</Button>
					</a>
				</div>
			</CardContent>
		</Card>
	{:else}
		<div class="space-y-4">
			{#each tokens as token (token.id)}
				<Card glow={token.is_active && token.is_game_enabled}>
					<CardContent class="p-6">
						<div class="grid lg:grid-cols-12 gap-6">
							<!-- Token Info -->
							<div class="lg:col-span-4 space-y-3">
								<div class="flex items-start gap-4">
									{#if token.icon_url}
										<img src={token.icon_url} alt="" class="w-10 h-10 rounded-full" />
									{:else}
										<div class="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold">
											{getDisplaySymbol(token).charAt(0)}
										</div>
									{/if}
									<div class="flex-1">
										<div class="flex items-center gap-2 flex-wrap">
											<h3 class="text-xl font-black text-neutral-900 dark:text-neutral-100 uppercase">
												{getDisplaySymbol(token)}
											</h3>
											{#if !token.is_active}
												<span class="px-2 py-0.5 text-xs rounded bg-neutral-500/20 text-neutral-500 font-medium">
													Inactive
												</span>
											{/if}
										</div>
										<p class="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
											{getDisplayName(token)}
										</p>
									</div>
								</div>

								<div class="flex flex-wrap gap-2">
									<span class="px-2 py-1 text-xs rounded border font-medium bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/30 uppercase">
										{token.chain}
									</span>
									<span class="px-2 py-1 text-xs rounded border font-medium bg-primary-500/10 text-primary-600 dark:text-primary-400 border-primary-500/30">
										{getStandardLabel(token.token_standard)}
									</span>
								</div>
							</div>

							<!-- Token Details -->
							<div class="lg:col-span-4">
								<dl class="space-y-2 text-sm">
									{#if token.contract_id}
										<div class="flex justify-between py-1 border-b border-neutral-200 dark:border-neutral-700">
											<dt class="text-neutral-500 dark:text-neutral-400">Contract ID:</dt>
											<dd class="text-neutral-700 dark:text-neutral-300 font-mono">{token.contract_id}</dd>
										</div>
									{/if}
									<div class="flex justify-between py-1 border-b border-neutral-200 dark:border-neutral-700">
										<dt class="text-neutral-500 dark:text-neutral-400">Decimals:</dt>
										<dd class="text-neutral-700 dark:text-neutral-300">{token.decimals}</dd>
									</div>
									<div class="flex justify-between py-1 border-b border-neutral-200 dark:border-neutral-700">
										<dt class="text-neutral-500 dark:text-neutral-400">Symbol:</dt>
										<dd class="text-neutral-700 dark:text-neutral-300">{token.symbol}</dd>
									</div>
									{#if token.display_symbol && token.display_symbol !== token.symbol}
										<div class="flex justify-between py-1">
											<dt class="text-neutral-500 dark:text-neutral-400">Display As:</dt>
											<dd class="text-neutral-700 dark:text-neutral-300">{token.display_symbol}</dd>
										</div>
									{/if}
								</dl>
							</div>

							<!-- Flags & Actions -->
							<div class="lg:col-span-4 space-y-3">
								<div class="space-y-2">
									<label class="flex items-center gap-2 cursor-pointer">
										<input
											type="checkbox"
											checked={token.is_displayable}
											onchange={() => handleToggleFlag(token, 'is_displayable')}
											class="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
										/>
										<span class="text-sm text-neutral-700 dark:text-neutral-300">Show in wallet</span>
									</label>
									<label class="flex items-center gap-2 cursor-pointer">
										<input
											type="checkbox"
											checked={token.is_game_enabled}
											onchange={() => handleToggleFlag(token, 'is_game_enabled')}
											class="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
										/>
										<span class="text-sm text-neutral-700 dark:text-neutral-300">Enable for games</span>
									</label>
									<label class="flex items-center gap-2 cursor-pointer">
										<input
											type="checkbox"
											checked={token.is_treasury_enabled}
											onchange={() => handleToggleFlag(token, 'is_treasury_enabled')}
											class="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
										/>
										<span class="text-sm text-neutral-700 dark:text-neutral-300">Enable for treasury</span>
									</label>
								</div>

								<div class="flex flex-col gap-2 pt-2">
									<a href="/admin/tokens/{token.id}">
										<Button variant="outline" size="sm" class="w-full">Edit Token</Button>
									</a>
									{#if token.token_standard !== 'native'}
										<Button
											variant={token.is_active ? 'outline' : 'primary'}
											size="sm"
											onclick={() => handleToggleFlag(token, 'is_active')}
											class="w-full"
										>
											{token.is_active ? 'Deactivate' : 'Activate'}
										</Button>
									{/if}
								</div>

								<div class="text-xs text-neutral-500 dark:text-neutral-400 text-center">
									Added {new Date(token.created_at).toLocaleDateString()}
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}

	<!-- Pagination -->
	{#if pagination.total_pages > 1}
		<nav class="flex items-center justify-between">
			<span class="text-sm text-neutral-600 dark:text-neutral-400">{paginatedLabel}</span>
			<div class="flex gap-2">
				<button
					onclick={() => {
						page = Math.max(page - 1, 1);
						fetchTokens();
					}}
					disabled={page === 1}
					class="px-3 py-2 text-sm rounded-lg border {page === 1
						? 'border-neutral-300 dark:border-neutral-700 text-neutral-400 cursor-not-allowed'
						: 'border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950'}"
				>
					Previous
				</button>
				<button
					onclick={() => {
						page = Math.min(page + 1, pagination.total_pages);
						fetchTokens();
					}}
					disabled={page >= pagination.total_pages}
					class="px-3 py-2 text-sm rounded-lg border {page >= pagination.total_pages
						? 'border-neutral-300 dark:border-neutral-700 text-neutral-400 cursor-not-allowed'
						: 'border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950'}"
				>
					Next
				</button>
			</div>
		</nav>
	{/if}
</div>
