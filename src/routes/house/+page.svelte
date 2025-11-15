<script lang="ts">
	import WalletSelector from '$lib/components/house/WalletSelector.svelte';
	import PoolCard from '$lib/components/house/PoolCard.svelte';
	import { houseWallet } from '$lib/stores/houseWallet.svelte';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();

	let portfolio = $state<any>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Load portfolio on mount
	onMount(async () => {
		await loadPortfolio();
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
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="house-page">
	<!-- Animated gradient background -->
	<div class="gradient-mesh"></div>

	<div class="content-wrapper">
		<!-- Header with portfolio overview -->
		<header class="page-header">
			<div class="header-content">
				<div class="title-section">
					<h1 class="page-title">House Pools</h1>
					<p class="page-subtitle">Invest in the house. Earn from every game played.</p>
				</div>

				{#if !loading && portfolio}
					<div class="portfolio-stats">
						<div class="stat-card primary">
							<div class="stat-label">Total Value</div>
							<div class="stat-value">{formatVOI(portfolio.totalValue).split('.')[0]} <span>VOI</span></div>
						</div>
						<div class="stat-card">
							<div class="stat-label">Total Shares</div>
							<div class="stat-value">{(portfolio.formattedTotalShares || '0').toLocaleString()}</div>
						</div>
						<div class="stat-card">
							<div class="stat-label">Profit/Loss</div>
							<div class="stat-value {pl.isProfit ? 'profit' : 'loss'}">
								{pl.isProfit ? '+' : ''}{pl.percentage.toFixed(2)}%
							</div>
						</div>
						<div class="stat-card">
							<div class="stat-label">Active Positions</div>
							<div class="stat-value">{portfolio.positions.length}</div>
						</div>
					</div>
				{/if}
			</div>
		</header>

		<!-- Wallet Selector -->
		<section class="wallet-section">
			<WalletSelector voiAddress={data.cdpAddress} />
		</section>

		<!-- Main Content -->
		<div class="main-content">
			{#if loading}
				<div class="loading-state">
					<div class="spinner"></div>
					<p>Loading your portfolio...</p>
				</div>
			{:else if error}
				<div class="error-state">
					<div class="error-icon">⚠</div>
					<h3>Unable to load portfolio</h3>
					<p>{error}</p>
					<button class="retry-button" onclick={loadPortfolio}>Retry</button>
				</div>
			{:else}
				<!-- Pool Cards Section -->
				<section class="pools-section">
					<h2 class="section-title">Your Pools</h2>

					{#if data.contracts.length > 0}
						<div class="pools-grid">
							{#each data.contracts as contract}
								{@const positions = portfolio?.positions.filter(
									(p: any) => p.contractId === contract.contract_id
								) || []}
								{@const allAddresses = [
									data.cdpAddress,
									...(data.linkedAddresses?.map((a) => a.address) || [])
								].filter(Boolean)}
								<PoolCard
									{contract}
									{positions}
									{allAddresses}
									onRefresh={loadPortfolio}
								/>
							{/each}
						</div>
					{:else}
						<div class="empty-state">
							<div class="empty-icon">
								<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="1.5"
										d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
									/>
								</svg>
							</div>
							<h3>No house pools available</h3>
							<p>House pools will appear here once contracts are configured.</p>
						</div>
					{/if}
				</section>
			{/if}
		</div>
	</div>
</div>

<style>
	:global(body) {
		font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
	}

	.house-page {
		position: relative;
		min-height: 100vh;
		background: #0a0d1a;
		color: #ffffff;
		overflow-x: hidden;
	}

	/* Animated gradient mesh background */
	.gradient-mesh {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 0;
		background:
			radial-gradient(circle at 20% 30%, rgba(212, 175, 55, 0.08) 0%, transparent 50%),
			radial-gradient(circle at 80% 70%, rgba(16, 185, 129, 0.06) 0%, transparent 50%),
			radial-gradient(circle at 40% 80%, rgba(99, 102, 241, 0.05) 0%, transparent 50%),
			linear-gradient(135deg, #0a0d1a 0%, #121728 100%);
		animation: mesh-shift 20s ease-in-out infinite alternate;
	}

	@keyframes mesh-shift {
		0% {
			background-position: 0% 0%, 100% 100%, 50% 50%;
		}
		100% {
			background-position: 100% 100%, 0% 0%, 30% 70%;
		}
	}

	.content-wrapper {
		position: relative;
		z-index: 1;
		max-width: 1400px;
		margin: 0 auto;
		padding: 3rem 2rem;
	}

	/* Header */
	.page-header {
		margin-bottom: 3rem;
		animation: slide-up 0.6s ease-out;
	}

	@keyframes slide-up {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.header-content {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.title-section {
		margin-bottom: 0.5rem;
	}

	.page-title {
		font-family: 'Syne', sans-serif;
		font-size: 4rem;
		font-weight: 800;
		letter-spacing: -0.03em;
		margin: 0 0 0.5rem 0;
		background: linear-gradient(135deg, #d4af37 0%, #f4d03f 50%, #d4af37 100%);
		background-size: 200% 200%;
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		animation: gold-shimmer 8s ease-in-out infinite;
	}

	@keyframes gold-shimmer {
		0%, 100% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
	}

	.page-subtitle {
		font-size: 1.25rem;
		color: rgba(255, 255, 255, 0.6);
		font-weight: 500;
		margin: 0;
	}

	/* Portfolio Stats */
	.portfolio-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		animation: fade-in 0.8s ease-out 0.2s backwards;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.stat-card {
		background: rgba(255, 255, 255, 0.03);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 16px;
		padding: 1.5rem;
		transition: all 0.3s ease;
	}

	.stat-card:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.12);
		transform: translateY(-2px);
	}

	.stat-card.primary {
		background: linear-gradient(135deg, rgba(212, 175, 55, 0.15) 0%, rgba(212, 175, 55, 0.05) 100%);
		border-color: rgba(212, 175, 55, 0.3);
	}

	.stat-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.5);
		margin-bottom: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.stat-value {
		font-family: 'Syne', sans-serif;
		font-size: 2rem;
		font-weight: 700;
		color: #ffffff;
		letter-spacing: -0.02em;
	}

	.stat-value span {
		font-size: 1.25rem;
		color: rgba(255, 255, 255, 0.5);
		font-weight: 600;
		margin-left: 0.25rem;
	}

	.stat-value.profit {
		color: #10b981;
	}

	.stat-value.loss {
		color: #ef4444;
	}

	/* Wallet Section */
	.wallet-section {
		margin-bottom: 3rem;
		animation: slide-up 0.6s ease-out 0.1s backwards;
	}

	/* Main Content */
	.main-content {
		animation: slide-up 0.6s ease-out 0.2s backwards;
	}

	/* Section Title */
	.section-title {
		font-family: 'Syne', sans-serif;
		font-size: 2rem;
		font-weight: 700;
		margin: 0 0 1.5rem 0;
		color: #ffffff;
		letter-spacing: -0.02em;
	}

	/* Pools Grid */
	.pools-section {
		margin-bottom: 3rem;
	}

	.pools-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
		gap: 1.5rem;
	}

	/* Loading State */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 6rem 2rem;
		gap: 1.5rem;
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 3px solid rgba(255, 255, 255, 0.1);
		border-top-color: #d4af37;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading-state p {
		color: rgba(255, 255, 255, 0.5);
		font-size: 1.125rem;
	}

	/* Error State */
	.error-state {
		background: rgba(239, 68, 68, 0.05);
		border: 1px solid rgba(239, 68, 68, 0.2);
		border-radius: 20px;
		padding: 3rem 2rem;
		text-align: center;
	}

	.error-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.error-state h3 {
		font-family: 'Syne', sans-serif;
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0 0 0.5rem 0;
		color: #ef4444;
	}

	.error-state p {
		color: rgba(255, 255, 255, 0.6);
		margin: 0 0 1.5rem 0;
	}

	.retry-button {
		background: linear-gradient(135deg, #d4af37 0%, #f4d03f 100%);
		color: #0a0d1a;
		border: none;
		border-radius: 12px;
		padding: 0.875rem 2rem;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.retry-button:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px rgba(212, 175, 55, 0.3);
	}

	/* Empty State */
	.empty-state {
		background: rgba(255, 255, 255, 0.02);
		border: 1px dashed rgba(255, 255, 255, 0.1);
		border-radius: 20px;
		padding: 4rem 2rem;
		text-align: center;
	}

	.empty-icon {
		color: rgba(255, 255, 255, 0.15);
		margin-bottom: 1.5rem;
	}

	.empty-state h3 {
		font-family: 'Syne', sans-serif;
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 0.5rem 0;
		color: rgba(255, 255, 255, 0.9);
	}

	.empty-state p {
		color: rgba(255, 255, 255, 0.4);
		margin: 0;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.content-wrapper {
			padding: 2rem 1rem;
		}

		.page-title {
			font-size: 2.5rem;
		}

		.page-subtitle {
			font-size: 1rem;
		}

		.portfolio-stats {
			grid-template-columns: repeat(2, 1fr);
		}

		.stat-value {
			font-size: 1.5rem;
		}

		.pools-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
