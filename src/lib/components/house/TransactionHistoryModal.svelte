<script lang="ts">
	import { onMount } from 'svelte';
	import type { YBTTransaction, ProfitLoss } from '$lib/types/house';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		contractId: number;
		contractName: string;
		address: string;
	}

	let { isOpen, onClose, contractId, contractName, address }: Props = $props();

	let transactions = $state<YBTTransaction[]>([]);
	let profitLoss = $state<ProfitLoss | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Load transactions when modal opens
	$effect(() => {
		if (isOpen) {
			loadTransactions();
		}
	});

	async function loadTransactions() {
		loading = true;
		error = null;

		try {
			// Fetch for single address only
			const response = await fetch(
				`/api/house/transactions/${contractId}?addresses=${address}`
			);

			if (!response.ok) {
				throw new Error('Failed to fetch transaction history');
			}

			const data = await response.json();

			// Convert string values back to appropriate types
			transactions = data.transactions.map((txn: any) => ({
				...txn,
				voiAmount: BigInt(txn.voiAmount || 0),
				sharesAmount: BigInt(txn.sharesAmount || 0),
				timestamp: new Date(txn.timestamp)
			}));

			if (data.profitLoss) {
				profitLoss = {
					...data.profitLoss,
					amount: BigInt(data.profitLoss.amount || 0),
					totalDeposited: BigInt(data.profitLoss.totalDeposited || 0),
					totalWithdrawn: BigInt(data.profitLoss.totalWithdrawn || 0),
					currentValue: BigInt(data.profitLoss.currentValue || 0)
				};
			}
		} catch (err) {
			console.error('Error loading transactions:', err);
			error = 'Failed to load transaction history';
		} finally {
			loading = false;
		}
	}

	function formatVOI(microVOI: bigint | number): string {
		const amount = typeof microVOI === 'bigint' ? Number(microVOI) : microVOI;
		const voi = amount / 1_000_000;
		return voi.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
	}

	function formatDate(date: Date): string {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatTxHash(hash: string): string {
		return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onclick={handleBackdropClick}>
		<div class="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-in-bottom">
			<!-- Header -->
			<div class="flex justify-between items-start p-5 border-b border-neutral-200 dark:border-neutral-700">
				<div>
					<h2 class="text-lg font-bold text-neutral-900 dark:text-white mb-1">Transaction History</h2>
					<p class="text-sm text-neutral-500 dark:text-neutral-400 mb-0.5">{contractName}</p>
					<p class="font-mono text-xs text-primary-600 dark:text-primary-400">{address.slice(0, 12)}...{address.slice(-8)}</p>
				</div>
				<button class="text-neutral-400 hover:text-primary-500 p-1 transition-colors" onclick={onClose}>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Body -->
			<div class="p-5 flex flex-col gap-5">
				{#if loading}
					<div class="flex flex-col items-center gap-4 py-12">
						<div class="w-10 h-10 border-3 border-neutral-200 dark:border-neutral-700 border-t-primary-500 rounded-full animate-spin"></div>
						<p class="text-sm text-neutral-500 dark:text-neutral-400">Loading transaction history...</p>
					</div>
				{:else if error}
					<div class="flex items-center gap-3 p-4 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-xl text-error-600 dark:text-error-400 text-sm">
						<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
						</svg>
						<span>{error}</span>
					</div>
				{:else}
					<!-- Profit/Loss Summary -->
					{#if profitLoss}
						<div class="rounded-xl p-5 border {profitLoss.isProfit ? 'border-success-200 dark:border-success-800 bg-success-50 dark:bg-success-900/20' : 'border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-900/20'}">
							<div class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide mb-4">Performance Summary</div>
							<div class="grid grid-cols-2 gap-4">
								<div class="flex flex-col gap-0.5">
									<span class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Total Deposited:</span>
									<span class="text-base font-semibold text-neutral-900 dark:text-white">{formatVOI(profitLoss.totalDeposited)} VOI</span>
								</div>
								<div class="flex flex-col gap-0.5">
									<span class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Total Withdrawn:</span>
									<span class="text-base font-semibold text-neutral-900 dark:text-white">{formatVOI(profitLoss.totalWithdrawn)} VOI</span>
								</div>
								<div class="flex flex-col gap-0.5">
									<span class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Current Value:</span>
									<span class="text-base font-semibold text-neutral-900 dark:text-white">{formatVOI(profitLoss.currentValue)} VOI</span>
								</div>
								<div class="flex flex-col gap-0.5 col-span-2 pt-4 border-t border-neutral-200 dark:border-neutral-700">
									<span class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Profit/Loss:</span>
									<span class="text-xl font-bold {profitLoss.isProfit ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'}">
										{profitLoss.isProfit ? '+' : ''}{formatVOI(profitLoss.amount)} VOI
										({profitLoss.isProfit ? '+' : ''}{profitLoss.percentage.toFixed(2)}%)
									</span>
								</div>
							</div>
						</div>
					{/if}

					<!-- Transaction List -->
					{#if transactions.length > 0}
						<div>
							<h3 class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide mb-4">Transaction History</h3>
							<div class="flex flex-col gap-3">
								{#each transactions as tx}
									<div class="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors">
										<div class="flex justify-between items-center mb-3">
											<span class="px-2.5 py-1 rounded text-xs font-semibold uppercase {tx.type === 'deposit' ? 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400' : 'bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-400'}">
												{tx.type === 'deposit' ? '↓ Deposit' : '↑ Withdraw'}
											</span>
											<span class="text-xs text-neutral-500 dark:text-neutral-400">{formatDate(tx.timestamp)}</span>
										</div>
										<div class="flex flex-col gap-2 mb-3">
											<div class="flex justify-between text-sm">
												<span class="text-neutral-500 dark:text-neutral-400">VOI Amount:</span>
												<span class="font-semibold {tx.type === 'deposit' ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'}">{formatVOI(tx.voiAmount)} VOI</span>
											</div>
											<div class="flex justify-between text-sm">
												<span class="text-neutral-500 dark:text-neutral-400">Shares:</span>
												<span class="text-neutral-700 dark:text-neutral-300">{(Number(tx.sharesAmount) / 1e9).toFixed(6)} YBT</span>
											</div>
										</div>
										<a
											href={`https://voi.observer/explorer/transaction/${tx.txHash}`}
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1.5 text-xs font-mono text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
										>
											{formatTxHash(tx.txHash)}
											<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" d="M10 3.5L4.5 9M10 3.5H6.5M10 3.5V7" />
											</svg>
										</a>
									</div>
								{/each}
							</div>
						</div>
					{:else}
						<div class="text-center py-12">
							<svg class="w-12 h-12 mx-auto text-neutral-300 dark:text-neutral-600 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
							</svg>
							<p class="text-neutral-600 dark:text-neutral-400 font-medium mb-1">No transaction history yet</p>
							<span class="text-sm text-neutral-500 dark:text-neutral-500">Deposit or withdraw to start building your history</span>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Spinner animation */
	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.grid-cols-2 {
			grid-template-columns: 1fr;
		}
	}
</style>
