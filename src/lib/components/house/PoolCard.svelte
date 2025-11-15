<script lang="ts">
	import type { SlotMachineConfig } from '$lib/types/database';
	import type { HousePositionWithMetadata } from '$lib/types/house';
	import { onMount } from 'svelte';
	import DepositModal from './DepositModal.svelte';
	import WithdrawModal from './WithdrawModal.svelte';
	import TransactionHistoryModal from './TransactionHistoryModal.svelte';

	interface Props {
		contract: SlotMachineConfig;
		positions: HousePositionWithMetadata[];
		allAddresses: string[];
		onRefresh: () => Promise<void>;
	}

	let { contract, positions, allAddresses, onRefresh }: Props = $props();

	let treasuryData = $state<any>(null);
	let loading = $state(true);
	let showDepositModal = $state(false);
	let showWithdrawModal = $state(false);
	let showHistoryModal = $state(false);
	let selectedPosition: HousePositionWithMetadata | null = $state(null);
	let historyAddress = $state<string>('');

	onMount(async () => {
		await loadTreasuryData();
	});

	async function loadTreasuryData() {
		try {
			loading = true;
			const response = await fetch(`/api/house/treasury/${contract.contract_id}`);
			if (response.ok) {
				const data = await response.json();
				treasuryData = data.treasury;
			}
		} catch (err) {
			console.error('Error loading treasury data:', err);
		} finally {
			loading = false;
		}
	}

	function formatVOI(microVOI: bigint | number): string {
		const amount = typeof microVOI === 'bigint' ? Number(microVOI) : microVOI;
		const voi = amount / 1_000_000;
		if (voi >= 1000) {
			return `${(voi / 1000).toFixed(2)}K`;
		}
		return voi.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	function formatShares(shares: number): string {
		if (shares >= 1000) {
			return `${(shares / 1000).toFixed(2)}K`;
		}
		return shares.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	const totalPositionValue = $derived(
		positions.reduce((sum, p) => sum + Number(p.voiValue), 0)
	);

	const totalPositionShares = $derived(
		positions.reduce((sum, p) => sum + Number(p.formattedShares), 0)
	);

	const hasPositions = $derived(positions.length > 0);

	function handleDeposit(position?: HousePositionWithMetadata) {
		selectedPosition = position || null;
		showDepositModal = true;
	}

	function handleWithdraw(position: HousePositionWithMetadata) {
		selectedPosition = position;
		showWithdrawModal = true;
	}

	function handleViewHistory(address: string) {
		historyAddress = address;
		showHistoryModal = true;
	}

	async function handleTransactionComplete() {
		showDepositModal = false;
		showWithdrawModal = false;
		await loadTreasuryData();
		await onRefresh();
	}
</script>

<div class="pool-card">
	<div class="pool-header">
		<div class="pool-info">
			<h3 class="pool-name">{contract.display_name}</h3>
			<p class="pool-description">{contract.name}</p>
		</div>
		<div class="pool-badge">{contract.game_type}</div>
	</div>

	{#if loading}
		<div class="pool-loading">
			<div class="mini-spinner"></div>
		</div>
	{:else if treasuryData}
		<!-- Treasury Stats -->
		<div class="treasury-stats">
			<div class="stat">
				<span class="stat-label">Total Pool</span>
				<span class="stat-value">{formatVOI(treasuryData.balanceTotal)} VOI</span>
			</div>
			<div class="stat">
				<span class="stat-label">Share Price</span>
				<span class="stat-value">{formatVOI(treasuryData.sharePrice)} VOI</span>
			</div>
			<div class="stat">
				<span class="stat-label">Total Shares</span>
				<span class="stat-value">{formatShares(Number(treasuryData.totalSupply) / 1e9)}</span>
			</div>
		</div>

		<!-- User Positions -->
		<div class="positions-section">
			<div class="positions-header">
				<h4>Your Positions</h4>
				{#if hasPositions}
					<div class="total-position">
						<span class="position-value">{formatVOI(totalPositionValue)} VOI</span>
						<span class="position-shares">{formatShares(totalPositionShares)} shares</span>
					</div>
				{/if}
			</div>

			{#if hasPositions}
				<div class="positions-list">
					{#each positions as position}
						<div class="position-item">
							<div class="position-address">
								<span class="address-label">
									{position.address.slice(0, 8)}...{position.address.slice(-6)}
								</span>
								<span class="position-percent">{position.sharePercentage.toFixed(3)}%</span>
							</div>
							<div class="position-values">
								<span class="value">{formatVOI(position.voiValue)} VOI</span>
								<span class="shares">{formatShares(position.formattedShares)} shares</span>
							</div>
							<div class="position-actions">
								<button class="action-btn deposit" onclick={() => handleDeposit(position)}>
									Deposit
								</button>
								<button class="action-btn withdraw" onclick={() => handleWithdraw(position)}>
									Withdraw
								</button>
								<button class="action-btn history" onclick={() => handleViewHistory(position.address)}>
									History
								</button>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="no-positions">
					<p>No active positions</p>
					<button class="primary-btn" onclick={() => handleDeposit()}>Make First Deposit</button>
				</div>
			{/if}
		</div>

	{/if}
</div>

{#if showDepositModal}
	<DepositModal
		{contract}
		position={selectedPosition}
		{allAddresses}
		onClose={() => (showDepositModal = false)}
		onSuccess={handleTransactionComplete}
	/>
{/if}

{#if showWithdrawModal && selectedPosition}
	<WithdrawModal
		{contract}
		position={selectedPosition}
		onClose={() => (showWithdrawModal = false)}
		onSuccess={handleTransactionComplete}
	/>
{/if}

{#if showHistoryModal && historyAddress}
	<TransactionHistoryModal
		isOpen={showHistoryModal}
		onClose={() => (showHistoryModal = false)}
		contractId={contract.contract_id}
		contractName={contract.display_name}
		address={historyAddress}
	/>
{/if}

<style>
	.pool-card {
		background: rgba(255, 255, 255, 0.03);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 20px;
		padding: 1.5rem;
		transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
		overflow: hidden;
	}

	.pool-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 2px;
		background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.5), transparent);
		opacity: 0;
		transition: opacity 0.4s ease;
	}

	.pool-card:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(212, 175, 55, 0.3);
		transform: translateY(-4px);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
	}

	.pool-card:hover::before {
		opacity: 1;
	}

	/* Header */
	.pool-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.5rem;
	}

	.pool-info {
		flex: 1;
	}

	.pool-name {
		font-family: 'Syne', sans-serif;
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0 0 0.25rem 0;
		color: #ffffff;
		letter-spacing: -0.01em;
	}

	.pool-description {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.5);
		margin: 0;
	}

	.pool-badge {
		padding: 0.375rem 0.875rem;
		background: rgba(212, 175, 55, 0.1);
		border: 1px solid rgba(212, 175, 55, 0.3);
		border-radius: 20px;
		font-size: 0.75rem;
		font-weight: 600;
		color: #d4af37;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Loading */
	.pool-loading {
		display: flex;
		justify-content: center;
		padding: 2rem;
	}

	.mini-spinner {
		width: 24px;
		height: 24px;
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-top-color: #d4af37;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Treasury Stats */
	.treasury-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
		padding: 1rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 12px;
		margin-bottom: 1.5rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stat-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 500;
	}

	.stat-value {
		font-family: 'Syne', sans-serif;
		font-size: 1.125rem;
		font-weight: 600;
		color: #ffffff;
	}

	/* Positions Section */
	.positions-section {
		margin-bottom: 1rem;
	}

	.positions-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.positions-header h4 {
		font-family: 'Syne', sans-serif;
		font-size: 1rem;
		font-weight: 600;
		margin: 0;
		color: rgba(255, 255, 255, 0.9);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.total-position {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.125rem;
	}

	.position-value {
		font-family: 'Syne', sans-serif;
		font-size: 1.125rem;
		font-weight: 700;
		color: #d4af37;
	}

	.position-shares {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Positions List */
	.positions-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.position-item {
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		padding: 1rem;
		transition: all 0.3s ease;
	}

	.position-item:hover {
		background: rgba(0, 0, 0, 0.3);
		border-color: rgba(255, 255, 255, 0.1);
	}

	.position-address {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.address-label {
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.position-percent {
		font-size: 0.75rem;
		color: #10b981;
		font-weight: 600;
	}

	.position-values {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.position-values .value {
		font-family: 'Syne', sans-serif;
		font-size: 1rem;
		font-weight: 600;
		color: #ffffff;
	}

	.position-values .shares {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.position-actions {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.5rem;
	}

	.action-btn {
		padding: 0.5rem 1rem;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
		border: 1px solid;
	}

	.action-btn.deposit {
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%);
		border-color: rgba(16, 185, 129, 0.3);
		color: #10b981;
	}

	.action-btn.deposit:hover {
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%);
		border-color: rgba(16, 185, 129, 0.5);
		transform: translateY(-1px);
	}

	.action-btn.withdraw {
		background: rgba(255, 255, 255, 0.03);
		border-color: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.9);
	}

	.action-btn.withdraw:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.2);
		transform: translateY(-1px);
	}

	.action-btn.history {
		background: rgba(212, 175, 55, 0.05);
		border-color: rgba(212, 175, 55, 0.2);
		color: #d4af37;
	}

	.action-btn.history:hover {
		background: rgba(212, 175, 55, 0.1);
		border-color: rgba(212, 175, 55, 0.4);
		transform: translateY(-1px);
	}

	/* No Positions */
	.no-positions {
		text-align: center;
		padding: 2rem 1rem;
		background: rgba(0, 0, 0, 0.2);
		border: 1px dashed rgba(255, 255, 255, 0.1);
		border-radius: 12px;
	}

	.no-positions p {
		color: rgba(255, 255, 255, 0.5);
		margin: 0 0 1rem 0;
		font-size: 0.875rem;
	}

	.primary-btn {
		background: linear-gradient(135deg, #d4af37 0%, #f4d03f 100%);
		color: #0a0d1a;
		border: none;
		border-radius: 8px;
		padding: 0.75rem 1.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.primary-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(212, 175, 55, 0.4);
	}


	/* Responsive */
	@media (max-width: 640px) {
		.treasury-stats {
			grid-template-columns: 1fr;
		}

		.pool-header {
			flex-direction: column;
			gap: 0.75rem;
		}

		.pool-badge {
			align-self: flex-start;
		}
	}
</style>
