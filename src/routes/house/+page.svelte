<script lang="ts">
	import WalletSelector from '$lib/components/house/WalletSelector.svelte';
	import PoolCard from '$lib/components/house/PoolCard.svelte';
	import { houseWallet } from '$lib/stores/houseWallet.svelte';
	import type { PageData } from './$types';
	import type { GameAccountInfo } from '$lib/auth/session';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();

	let portfolio = $state<any>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Track selected wallet source and account
	let selectedSource = $state<'game' | 'external'>('game');
	let selectedGameAccount = $state<GameAccountInfo | null>(null);

	// Load portfolio on mount
	onMount(async () => {
		await loadPortfolio();

		// Initialize selected game account to active or first account
		if (data.gameAccounts.length > 0) {
			const activeAccount = data.gameAccounts.find(a => a.id === data.activeGameAccountId);
			selectedGameAccount = activeAccount || data.gameAccounts[0];
		}
	});

	async function loadPortfolio() {
		loading = true;
		error = null;

		try {
			const response = await fetch('/api/house/portfolio');
			const result = await response.json();

			if (!response.ok) {
				throw new Error('Failed to load portfolio');
			}

			portfolio = result.portfolio;
		} catch (err) {
			console.error('Error loading portfolio:', err);
			error = err instanceof Error ? err.message : 'Failed to load portfolio';
		} finally {
			loading = false;
		}
	}

	function handleGameAccountSelect(account: GameAccountInfo) {
		selectedGameAccount = account;
		selectedSource = 'game';
	}

	function handleSourceChange(source: 'game' | 'external', address: string) {
		selectedSource = source;
		if (source === 'external') {
			selectedGameAccount = null;
		}
	}

	// Format microVOI to VOI with proper decimals
	function formatVOI(microVOI: bigint | number): string {
		const amount = typeof microVOI === 'bigint' ? Number(microVOI) : microVOI;
		const voi = amount / 1_000_000;
		return voi.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
	}

	// Calculate profit/loss percentage (placeholder until we have transaction history)
	function calculatePL(): { percentage: number; isProfit: boolean } {
		// TODO: Replace with actual P/L calculation from transaction history
		return { percentage: 0, isProfit: true };
	}

	const pl = $derived(calculatePL());
</script>

<svelte:head>
	<title>House Pools | House of Voi</title>
	<meta name="description" content="Invest in house pools and earn from game profits" />
</svelte:head>

<div class="min-h-screen bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-50 relative overflow-x-hidden">
	<!-- Animated gradient background -->
	<div class="gradient-mesh"></div>

	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 relative z-10">
		<!-- Header with portfolio overview -->
		<header class="mb-8 md:mb-12 animate-slide-in-bottom">
			<div class="flex flex-col gap-6 md:gap-8">
				<div class="mb-2">
					<h1 class="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-gradient mb-2">House Pools</h1>
					<p class="text-lg md:text-xl text-neutral-500 dark:text-neutral-400 font-medium">Invest in the house. Earn from every game played.</p>
				</div>

				{#if !loading && portfolio}
					<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
						<div class="card-glow p-4 md:p-6">
							<div class="text-xs md:text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1 md:mb-2">Total Value</div>
							<div class="text-xl md:text-2xl lg:text-3xl font-bold text-neutral-900 dark:text-white">{formatVOI(portfolio.totalValue).split('.')[0]} <span class="text-base md:text-lg text-neutral-400 dark:text-neutral-500 font-semibold ml-1">VOI</span></div>
						</div>
						<div class="card p-4 md:p-6">
							<div class="text-xs md:text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1 md:mb-2">Total Shares</div>
							<div class="text-xl md:text-2xl lg:text-3xl font-bold text-neutral-900 dark:text-white">{(portfolio.formattedTotalShares || '0').toLocaleString()}</div>
						</div>
						<div class="card p-4 md:p-6">
							<div class="text-xs md:text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1 md:mb-2">Profit/Loss</div>
							<div class="text-xl md:text-2xl lg:text-3xl font-bold {pl.isProfit ? 'text-success-500' : 'text-error-500'}">
								{pl.isProfit ? '+' : ''}{pl.percentage.toFixed(2)}%
							</div>
						</div>
						<div class="card p-4 md:p-6">
							<div class="text-xs md:text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1 md:mb-2">Active Positions</div>
							<div class="text-xl md:text-2xl lg:text-3xl font-bold text-neutral-900 dark:text-white">{portfolio.positions.length}</div>
						</div>
					</div>
				{/if}
			</div>
		</header>

		<!-- Wallet Selector -->
		<section class="mb-8 md:mb-12 relative z-10 animate-slide-in-bottom stagger-1">
			<WalletSelector
				gameAccounts={data.gameAccounts}
				activeGameAccountId={data.activeGameAccountId}
				onGameAccountSelect={handleGameAccountSelect}
				onSourceChange={handleSourceChange}
			/>
		</section>

		<!-- Main Content -->
		<div class="animate-slide-in-bottom stagger-2">
			{#if loading}
				<div class="flex flex-col items-center justify-center py-24 gap-6">
					<div class="w-12 h-12 border-3 border-neutral-200 dark:border-neutral-700 border-t-primary-500 rounded-full animate-spin"></div>
					<p class="text-neutral-500 dark:text-neutral-400 text-lg">Loading your portfolio...</p>
				</div>
			{:else if error}
				<div class="card border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-900/20 p-8 md:p-12 text-center">
					<div class="text-5xl mb-4">⚠</div>
					<h3 class="text-xl md:text-2xl font-bold text-error-600 dark:text-error-400 mb-2">Unable to load portfolio</h3>
					<p class="text-neutral-600 dark:text-neutral-400 mb-6">{error}</p>
					<button class="btn-primary" onclick={loadPortfolio}>Retry</button>
				</div>
			{:else}
				<!-- Pool Cards Section -->
				<section class="mb-8">
					<h2 class="text-xl md:text-2xl font-semibold text-neutral-900 dark:text-white mb-4 md:mb-6">Your Pools</h2>

					{#if data.contracts.length > 0}
						<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
							{#each data.contracts as contract}
								{@const positions = portfolio?.positions.filter(
									(p: any) => p.contractId === contract.contract_id
								) || []}
								<PoolCard
									{contract}
									{positions}
									gameAccounts={data.gameAccounts}
									{selectedSource}
									{selectedGameAccount}
									session={data.session}
									onRefresh={loadPortfolio}
								/>
							{/each}
						</div>
					{:else}
						<div class="card border-dashed p-12 md:p-16 text-center">
							<div class="text-neutral-300 dark:text-neutral-600 mb-6">
								<svg class="w-16 h-16 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="1.5"
										d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
									/>
								</svg>
							</div>
							<h3 class="text-lg md:text-xl font-semibold text-neutral-700 dark:text-neutral-300 mb-2">No house pools available</h3>
							<p class="text-neutral-500 dark:text-neutral-400">House pools will appear here once contracts are configured.</p>
						</div>
					{/if}
				</section>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Animated gradient mesh background */
	.gradient-mesh {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 0;
		pointer-events: none;
		opacity: 0.5;
		background:
			radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
			radial-gradient(circle at 80% 70%, rgba(16, 185, 129, 0.06) 0%, transparent 50%),
			radial-gradient(circle at 40% 80%, rgba(167, 139, 250, 0.05) 0%, transparent 50%);
		animation: mesh-shift 20s ease-in-out infinite alternate;
	}

	:global(.dark) .gradient-mesh {
		opacity: 0.8;
	}

	@keyframes mesh-shift {
		0% {
			background-position: 0% 0%, 100% 100%, 50% 50%;
		}
		100% {
			background-position: 100% 100%, 0% 0%, 30% 70%;
		}
	}

	/* Spinner animation */
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}
</style>
