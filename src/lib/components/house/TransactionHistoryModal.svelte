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
	<div class="modal-backdrop" onclick={handleBackdropClick}>
		<div class="modal-container">
			<!-- Header -->
			<div class="modal-header">
				<div>
					<h2>Transaction History</h2>
					<p class="subtitle">{contractName}</p>
					<p class="address">{address.slice(0, 12)}...{address.slice(-8)}</p>
				</div>
				<button class="close-button" onclick={onClose}>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<!-- Body -->
			<div class="modal-body">
				{#if loading}
					<div class="loading">
						<div class="spinner"></div>
						<p>Loading transaction history...</p>
					</div>
				{:else if error}
					<div class="error">
						<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
								clip-rule="evenodd"
							/>
						</svg>
						<span>{error}</span>
					</div>
				{:else}
					<!-- Profit/Loss Summary -->
					{#if profitLoss}
						<div class="pl-summary {profitLoss.isProfit ? 'profit' : 'loss'}">
							<div class="pl-title">Performance Summary</div>
							<div class="pl-grid">
								<div class="pl-item">
									<span class="pl-label">Total Deposited:</span>
									<span class="pl-value">{formatVOI(profitLoss.totalDeposited)} VOI</span>
								</div>
								<div class="pl-item">
									<span class="pl-label">Total Withdrawn:</span>
									<span class="pl-value">{formatVOI(profitLoss.totalWithdrawn)} VOI</span>
								</div>
								<div class="pl-item">
									<span class="pl-label">Current Value:</span>
									<span class="pl-value">{formatVOI(profitLoss.currentValue)} VOI</span>
								</div>
								<div class="pl-item highlight">
									<span class="pl-label">Profit/Loss:</span>
									<span class="pl-value {profitLoss.isProfit ? 'profit' : 'loss'}">
										{profitLoss.isProfit ? '+' : ''}{formatVOI(profitLoss.amount)} VOI
										({profitLoss.isProfit ? '+' : ''}{profitLoss.percentage.toFixed(2)}%)
									</span>
								</div>
							</div>
						</div>
					{/if}

					<!-- Transaction List -->
					{#if transactions.length > 0}
						<div class="transactions-section">
							<h3>Transaction History</h3>
							<div class="transactions-list">
								{#each transactions as tx}
									<div class="transaction-item">
										<div class="tx-header">
											<div class="tx-type {tx.type}">
												{tx.type === 'deposit' ? '↓ Deposit' : '↑ Withdraw'}
											</div>
											<div class="tx-date">{formatDate(tx.timestamp)}</div>
										</div>
										<div class="tx-details">
											<div class="tx-detail">
												<span>VOI Amount:</span>
												<span class="tx-amount {tx.type}">{formatVOI(tx.voiAmount)} VOI</span>
											</div>
											<div class="tx-detail">
												<span>Shares:</span>
												<span>{(Number(tx.sharesAmount) / 1e9).toFixed(6)} YBT</span>
											</div>
										</div>
										<a
											href={`https://voi.observer/explorer/transaction/${tx.txHash}`}
											target="_blank"
											rel="noopener noreferrer"
											class="tx-link"
										>
											{formatTxHash(tx.txHash)}
											<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M10 3.5L4.5 9M10 3.5H6.5M10 3.5V7"
												/>
											</svg>
										</a>
									</div>
								{/each}
							</div>
						</div>
					{:else}
						<div class="empty-state">
							<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
								/>
							</svg>
							<p>No transaction history yet</p>
							<span>Deposit or withdraw to start building your history</span>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.85);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		z-index: 100;
		animation: fade-in 0.2s ease-out;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal-container {
		background: #121728;
		border: 1px solid rgba(212, 175, 55, 0.2);
		border-radius: 24px;
		max-width: 700px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
		animation: slide-up 0.3s ease-out;
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

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 2rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.modal-header h2 {
		font-family: 'Syne', sans-serif;
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0 0 0.5rem 0;
		color: #ffffff;
	}

	.subtitle {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.6);
		margin: 0 0 0.25rem 0;
	}

	.address {
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 0.75rem;
		color: rgba(212, 175, 55, 0.8);
		margin: 0;
	}

	.close-button {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		padding: 0.5rem;
		transition: color 0.3s ease;
	}

	.close-button:hover {
		color: #d4af37;
	}

	.modal-body {
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Loading */
	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 3rem;
	}

	.spinner {
		width: 40px;
		height: 40px;
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

	.loading p {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.875rem;
		margin: 0;
	}

	/* Error */
	.error {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 12px;
		color: #ef4444;
		font-size: 0.875rem;
	}

	/* P/L Summary */
	.pl-summary {
		background: rgba(0, 0, 0, 0.3);
		border-radius: 16px;
		padding: 1.5rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.pl-summary.profit {
		border-color: rgba(16, 185, 129, 0.3);
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(0, 0, 0, 0.3) 100%);
	}

	.pl-summary.loss {
		border-color: rgba(239, 68, 68, 0.3);
		background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(0, 0, 0, 0.3) 100%);
	}

	.pl-title {
		font-family: 'Syne', sans-serif;
		font-size: 1rem;
		font-weight: 600;
		color: #ffffff;
		margin-bottom: 1rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.pl-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
	}

	.pl-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.pl-item.highlight {
		grid-column: 1 / -1;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.pl-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.pl-value {
		font-family: 'Syne', sans-serif;
		font-size: 1.125rem;
		font-weight: 600;
		color: #ffffff;
	}

	.pl-item.highlight .pl-value {
		font-size: 1.5rem;
	}

	.pl-value.profit {
		color: #10b981;
	}

	.pl-value.loss {
		color: #ef4444;
	}

	/* Transactions Section */
	.transactions-section h3 {
		font-family: 'Syne', sans-serif;
		font-size: 1rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
		color: rgba(255, 255, 255, 0.9);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.transactions-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.transaction-item {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		padding: 1rem;
		transition: all 0.3s ease;
	}

	.transaction-item:hover {
		background: rgba(255, 255, 255, 0.04);
		border-color: rgba(255, 255, 255, 0.1);
	}

	.tx-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.tx-type {
		padding: 0.25rem 0.75rem;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.tx-type.deposit {
		background: rgba(16, 185, 129, 0.15);
		color: #10b981;
	}

	.tx-type.withdraw {
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
	}

	.tx-date {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.tx-details {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.tx-detail {
		display: flex;
		justify-content: space-between;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.tx-amount {
		font-weight: 600;
		font-family: 'Syne', sans-serif;
	}

	.tx-amount.deposit {
		color: #10b981;
	}

	.tx-amount.withdraw {
		color: #ef4444;
	}

	.tx-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: rgba(212, 175, 55, 0.8);
		text-decoration: none;
		transition: color 0.3s ease;
		font-family: 'Monaco', 'Courier New', monospace;
	}

	.tx-link:hover {
		color: #d4af37;
	}

	/* Empty State */
	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: rgba(255, 255, 255, 0.4);
	}

	.empty-state svg {
		margin-bottom: 1rem;
		opacity: 0.3;
	}

	.empty-state p {
		margin: 0 0 0.5rem 0;
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.6);
		font-weight: 500;
	}

	.empty-state span {
		font-size: 0.875rem;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.modal-container {
			margin: 0;
			border-radius: 20px 20px 0 0;
			align-self: flex-end;
			max-height: 95vh;
		}

		.modal-header,
		.modal-body {
			padding: 1.5rem;
		}

		.pl-grid {
			grid-template-columns: 1fr;
		}

		.pl-item.highlight {
			grid-column: 1;
		}
	}
</style>
