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
		activeGameAccountId?: string;
		unlockedAddresses: Set<string>;
		connectedExternalAddresses: Set<string>;
		session: SessionInfo;
		onRefresh: () => Promise<void>;
	}

	let { contract, positions, gameAccounts, activeGameAccountId, unlockedAddresses, connectedExternalAddresses, session, onRefresh }: Props = $props();

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
		if (voi >= 1_000_000) {
			return `${(voi / 1_000_000).toFixed(3)}M`;
		}
		if (voi >= 1000) {
			return `${(voi / 1000).toFixed(2)}K`;
		}
		return voi.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	const totalPositionValue = $derived(
		positions.reduce((sum, p) => sum + Number(p.voiValue), 0)
	);

	const totalOwnershipPercentage = $derived(
		positions.reduce((sum, p) => sum + p.sharePercentage, 0)
	);

	const hasPositions = $derived(positions.length > 0);

	// Check if a position's address can be acted upon (unlocked game account or connected external wallet)
	function isPositionActionable(position: HousePositionWithMetadata): boolean {
		// Check if it's a connected external wallet
		if (connectedExternalAddresses.has(position.address)) {
			return true;
		}
		// Check if it's an unlocked game account
		return unlockedAddresses.has(position.address);
	}


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
		<!-- Pool Overview Stats -->
		<div class="grid grid-cols-3 gap-3 p-3 md:p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl mb-5">
			<div class="flex flex-col gap-0.5">
				<span class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide font-medium">Total Pool</span>
				<span class="text-sm md:text-base font-semibold text-neutral-900 dark:text-white">{formatVOI(treasuryData.balanceTotal)} VOI</span>
			</div>
			<div class="flex flex-col gap-0.5">
				<span class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide font-medium">Your Value</span>
				<span class="text-sm md:text-base font-semibold text-primary-600 dark:text-primary-400">{formatVOI(totalPositionValue)} VOI</span>
			</div>
			<div class="flex flex-col gap-0.5">
				<span class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide font-medium">Your Share</span>
				<span class="text-sm md:text-base font-semibold text-success-600 dark:text-success-400">{totalOwnershipPercentage.toFixed(2)}%</span>
			</div>
		</div>

		<!-- Pool Actions -->
		<div class="flex gap-2 mb-5">
			<button
				class="action-btn deposit flex-1"
				onclick={() => handleDeposit()}
			>
				<svg class="w-4 h-4 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 5v14M5 12h14"/>
				</svg>
				Deposit
			</button>
			<button
				class="action-btn withdraw flex-1"
				onclick={() => showWithdrawModal = true}
				disabled={!hasPositions}
			>
				<svg class="w-4 h-4 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M5 12h14"/>
				</svg>
				Withdraw
			</button>
		</div>

		<!-- User Positions -->
		<div>
			<div class="flex justify-between items-center mb-3">
				<h4 class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">Your Positions ({positions.length})</h4>
			</div>

			{#if hasPositions}
				<div class="flex flex-col gap-2">
					{#each positions as position}
						{@const actionable = isPositionActionable(position)}
						<div class="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-xl p-3 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors {!actionable ? 'opacity-60' : ''}">
							<div class="flex items-center gap-3">
								<!-- Position Info -->
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 mb-1">
										<span class="font-mono text-xs text-neutral-600 dark:text-neutral-400">
											{position.address.slice(0, 6)}...{position.address.slice(-4)}
										</span>
										{#if !actionable}
											<span class="text-xs px-1.5 py-0.5 rounded bg-warning-100 dark:bg-warning-900/30 text-warning-600 dark:text-warning-400">Locked</span>
										{/if}
									</div>
									<div class="flex items-center gap-3">
										<span class="text-sm font-semibold text-neutral-900 dark:text-white">{formatVOI(position.voiValue)} VOI</span>
										<span class="text-xs font-medium text-success-600 dark:text-success-400">{position.sharePercentage.toFixed(2)}%</span>
									</div>
								</div>

								<!-- Action Icons -->
								<div class="flex items-center gap-1">
									<button
										class="icon-btn add"
										onclick={() => handleDeposit(position)}
										disabled={!actionable}
										title="Add to position"
									>
										<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M12 5v14M5 12h14"/>
										</svg>
									</button>
									<button
										class="icon-btn remove"
										onclick={() => handleWithdraw(position)}
										disabled={!actionable}
										title="Withdraw from position"
									>
										<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M5 12h14"/>
										</svg>
									</button>
									<button
										class="icon-btn history"
										onclick={() => handleViewHistory(position.address)}
										title="View history"
									>
										<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<circle cx="12" cy="12" r="10"/>
											<path d="M12 6v6l4 2"/>
										</svg>
									</button>
								</div>
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
		{activeGameAccountId}
		{unlockedAddresses}
		{connectedExternalAddresses}
		{session}
		onClose={() => (showDepositModal = false)}
		onSuccess={handleTransactionComplete}
	/>
{/if}

{#if showWithdrawModal}
	<WithdrawModal
		{contract}
		position={selectedPosition}
		{positions}
		{gameAccounts}
		{activeGameAccountId}
		{unlockedAddresses}
		{connectedExternalAddresses}
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

	.action-btn:disabled {
		@apply opacity-50 cursor-not-allowed;
	}

	.action-btn:disabled:hover {
		@apply transform-none;
	}

	.action-btn.deposit {
		@apply bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800 text-success-600 dark:text-success-400;
	}

	.action-btn.deposit:hover:not(:disabled) {
		@apply bg-success-100 dark:bg-success-900/30 border-success-300 dark:border-success-700 -translate-y-0.5;
	}

	.action-btn.withdraw {
		@apply bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300;
	}

	.action-btn.withdraw:hover:not(:disabled) {
		@apply bg-neutral-100 dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 -translate-y-0.5;
	}

	.action-btn.history {
		@apply bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400;
	}

	.action-btn.history:hover:not(:disabled) {
		@apply bg-primary-100 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 -translate-y-0.5;
	}

	/* Icon Buttons for position rows */
	.icon-btn {
		@apply w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 border cursor-pointer;
	}

	.icon-btn:disabled {
		@apply opacity-40 cursor-not-allowed;
	}

	.icon-btn.add {
		@apply bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800 text-success-600 dark:text-success-400;
	}

	.icon-btn.add:hover:not(:disabled) {
		@apply bg-success-100 dark:bg-success-900/30 border-success-300 dark:border-success-700;
	}

	.icon-btn.remove {
		@apply bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400;
	}

	.icon-btn.remove:hover:not(:disabled) {
		@apply bg-neutral-100 dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600;
	}

	.icon-btn.history {
		@apply bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400;
	}

	.icon-btn.history:hover:not(:disabled) {
		@apply bg-primary-100 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700;
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
