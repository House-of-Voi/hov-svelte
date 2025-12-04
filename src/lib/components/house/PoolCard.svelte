<script lang="ts">
	import type { SlotMachineConfig } from '$lib/types/database';
	import type { HousePositionWithMetadata } from '$lib/types/house';
	import type { GameAccountInfo, SessionInfo } from '$lib/auth/session';
	import { onMount } from 'svelte';
	import DepositModal from './DepositModal.svelte';
	import WithdrawModal from './WithdrawModal.svelte';
	import TransactionHistoryModal from './TransactionHistoryModal.svelte';

	interface Props {
		contract: SlotMachineConfig;
		positions: HousePositionWithMetadata[];
		gameAccounts: GameAccountInfo[];
		selectedSource: 'game' | 'external';
		selectedGameAccount: GameAccountInfo | null;
		session: SessionInfo;
		onRefresh: () => Promise<void>;
	}

	let { contract, positions, gameAccounts, selectedSource, selectedGameAccount, session, onRefresh }: Props = $props();

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

<div class="card-interactive p-5 md:p-6 relative overflow-hidden group">
	<div class="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

	<div class="flex justify-between items-start mb-5">
		<div class="flex-1">
			<h3 class="text-lg md:text-xl font-bold text-neutral-900 dark:text-white mb-1">{contract.display_name}</h3>
			<p class="text-sm text-neutral-500 dark:text-neutral-400">{contract.name}</p>
		</div>
		<span class="badge-primary">{contract.game_type}</span>
	</div>

	{#if loading}
		<div class="flex justify-center py-8">
			<div class="w-6 h-6 border-2 border-neutral-200 dark:border-neutral-700 border-t-primary-500 rounded-full animate-spin"></div>
		</div>
	{:else if treasuryData}
		<!-- Treasury Stats -->
		<div class="grid grid-cols-3 gap-3 p-3 md:p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl mb-5">
			<div class="flex flex-col gap-0.5">
				<span class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide font-medium">Total Pool</span>
				<span class="text-sm md:text-base font-semibold text-neutral-900 dark:text-white">{formatVOI(treasuryData.balanceTotal)} VOI</span>
			</div>
			<div class="flex flex-col gap-0.5">
				<span class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide font-medium">Share Price</span>
				<span class="text-sm md:text-base font-semibold text-neutral-900 dark:text-white">{formatVOI(treasuryData.sharePrice)} VOI</span>
			</div>
			<div class="flex flex-col gap-0.5">
				<span class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide font-medium">Total Shares</span>
				<span class="text-sm md:text-base font-semibold text-neutral-900 dark:text-white">{formatShares(Number(treasuryData.totalSupply) / 1e9)}</span>
			</div>
		</div>

		<!-- User Positions -->
		<div>
			<div class="flex justify-between items-center mb-3">
				<h4 class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">Your Positions</h4>
				{#if hasPositions}
					<div class="flex flex-col items-end gap-0.5">
						<span class="text-base md:text-lg font-bold text-primary-600 dark:text-primary-400">{formatVOI(totalPositionValue)} VOI</span>
						<span class="text-xs text-neutral-500 dark:text-neutral-400">{formatShares(totalPositionShares)} shares</span>
					</div>
				{/if}
			</div>

			{#if hasPositions}
				<div class="flex flex-col gap-3">
					{#each positions as position}
						<div class="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-xl p-3 md:p-4 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors">
							<div class="flex justify-between items-center mb-2">
								<span class="font-mono text-xs text-neutral-600 dark:text-neutral-400">
									{position.address.slice(0, 8)}...{position.address.slice(-6)}
								</span>
								<span class="text-xs font-semibold text-success-600 dark:text-success-400">{position.sharePercentage.toFixed(3)}%</span>
							</div>
							<div class="flex justify-between items-center mb-3">
								<span class="text-sm md:text-base font-semibold text-neutral-900 dark:text-white">{formatVOI(position.voiValue)} VOI</span>
								<span class="text-sm text-neutral-500 dark:text-neutral-400">{formatShares(position.formattedShares)} shares</span>
							</div>
							<div class="grid grid-cols-3 gap-2">
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
				<div class="text-center py-6 px-4 bg-neutral-50 dark:bg-neutral-800/30 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl">
					<p class="text-neutral-500 dark:text-neutral-400 text-sm mb-3">No active positions</p>
					<button class="btn-primary text-sm py-2 px-4" onclick={() => handleDeposit()}>Make First Deposit</button>
				</div>
			{/if}
		</div>

	{/if}
</div>

{#if showDepositModal}
	<DepositModal
		{contract}
		position={selectedPosition}
		{gameAccounts}
		{selectedSource}
		{selectedGameAccount}
		{session}
		onClose={() => (showDepositModal = false)}
		onSuccess={handleTransactionComplete}
	/>
{/if}

{#if showWithdrawModal && selectedPosition}
	<WithdrawModal
		{contract}
		position={selectedPosition}
		{gameAccounts}
		{session}
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
	/* Action Buttons */
	.action-btn {
		@apply py-2 px-3 rounded-lg text-xs md:text-sm font-semibold cursor-pointer transition-all duration-200 border;
	}

	.action-btn.deposit {
		@apply bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800 text-success-600 dark:text-success-400;
	}

	.action-btn.deposit:hover {
		@apply bg-success-100 dark:bg-success-900/30 border-success-300 dark:border-success-700 -translate-y-0.5;
	}

	.action-btn.withdraw {
		@apply bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300;
	}

	.action-btn.withdraw:hover {
		@apply bg-neutral-100 dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 -translate-y-0.5;
	}

	.action-btn.history {
		@apply bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400;
	}

	.action-btn.history:hover {
		@apply bg-primary-100 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 -translate-y-0.5;
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

	/* Responsive adjustments */
	@media (max-width: 640px) {
		.action-btn {
			@apply py-1.5 px-2;
		}
	}
</style>
