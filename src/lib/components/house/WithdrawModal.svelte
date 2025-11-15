<script lang="ts">
	import type { SlotMachineConfig } from '$lib/types/database';
	import type { HousePositionWithMetadata } from '$lib/types/house';
	import { signTransactions } from '$lib/voi/wallet-utils';
	import { getAlgodClient, submitTransaction } from '$lib/voi/asa-utils';
	import { page } from '$app/stores';
	import algosdk from 'algosdk';
	import { onMount } from 'svelte';

	interface Props {
		contract: SlotMachineConfig;
		position: HousePositionWithMetadata;
		onClose: () => void;
		onSuccess: () => Promise<void>;
	}

	let { contract, position, onClose, onSuccess }: Props = $props();

	let withdrawAmount = $state('');
	let isProcessing = $state(false);
	let error = $state('');
	let treasury = $state<any>(null);

	onMount(async () => {
		await loadTreasuryData();
	});

	async function loadTreasuryData() {
		try {
			// Load treasury data from API
			const response = await fetch(`/api/house/treasury/${contract.contract_id}`);
			if (!response.ok) throw new Error('Failed to load treasury data');

			const data = await response.json();
			treasury = {
				...data.treasury,
				// Convert string values back to BigInt
				balanceTotal: BigInt(data.treasury.balanceTotal),
				balanceAvailable: BigInt(data.treasury.balanceAvailable),
				balanceLocked: BigInt(data.treasury.balanceLocked),
				totalSupply: BigInt(data.treasury.totalSupply),
				sharePrice: BigInt(data.treasury.sharePrice)
			};
		} catch (err) {
			console.error('Error loading treasury data:', err);
		}
	}

	const sharesAmount = $derived(parseFloat(withdrawAmount) || 0);
	const sharesBigInt = $derived(
		treasury ? BigInt(Math.floor(sharesAmount * 10 ** treasury.decimals)) : 0n
	);
	const transactionFee = $derived(7000); // 7000 microVOI for withdraw (higher due to inner txn)
	const maxShares = $derived(position.formattedShares);
	const canWithdraw = $derived(
		sharesAmount > 0 && sharesBigInt <= position.shares && !isProcessing
	);

	// Calculate VOI amount user will receive (client-side calculation)
	const voiAmount = $derived(
		treasury && treasury.totalSupply > 0n
			? (sharesBigInt * treasury.balanceTotal) / treasury.totalSupply
			: 0n
	);

	const withdrawPercentage = $derived(maxShares > 0 ? (sharesAmount / maxShares) * 100 : 0);

	function formatVOI(microVOI: bigint | number): string {
		const amount = typeof microVOI === 'bigint' ? Number(microVOI) : microVOI;
		const voi = amount / 1_000_000;
		return voi.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
	}

	function formatShares(shares: number, decimals: number = 9): string {
		return shares.toLocaleString('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: decimals
		});
	}

	function setMaxAmount() {
		withdrawAmount = maxShares.toFixed(treasury?.decimals || 9);
	}

	function setPercentage(percent: number) {
		withdrawAmount = ((maxShares * percent) / 100).toFixed(treasury?.decimals || 9);
	}

	async function handleWithdraw() {
		if (!canWithdraw) return;

		isProcessing = true;
		error = '';

		try {
			const algodClient = getAlgodClient();
			const suggestedParams = await algodClient.getTransactionParams().do();

			// Build withdrawal transaction
			const withdrawTxn = algosdk.makeApplicationNoOpTxnFromObject({
				from: position.address,
				appIndex: contract.ybt_app_id!,
				appArgs: [
					new Uint8Array(Buffer.from('withdraw')),
					algosdk.encodeUint64(Number(sharesBigInt))
				],
				suggestedParams
			});

			// Sign with wallet-utils (handles both CDP stored keys and external wallets)
			const session = $page.data.session;
			const signedTxns = await signTransactions([withdrawTxn], position.address, session);

			// Submit transaction
			const txId = await submitTransaction(signedTxns[0]);
			console.log('✅ Withdrawal successful! TxID:', txId);

			// Wait for confirmation
			await algosdk.waitForConfirmation(algodClient, txId, 4);

			await onSuccess();
			onClose();
		} catch (err) {
			console.error('Withdraw error:', err);
			error = err instanceof Error ? err.message : 'An unexpected error occurred';
		} finally {
			isProcessing = false;
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}
</script>

<div class="modal-backdrop" onclick={handleBackdropClick}>
	<div class="modal-container">
		<!-- Header -->
		<div class="modal-header">
			<div>
				<h2>Withdraw from Pool</h2>
				<p class="pool-name">{contract.display_name}</p>
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
			<!-- Position Info -->
			<div class="position-card">
				<div class="position-row">
					<span class="label">Your Position</span>
					<span class="value">{formatVOI(position.voiValue)} <span class="unit">VOI</span></span>
				</div>
				<div class="position-row">
					<span class="label">Available Shares</span>
					<span class="value shares"
						>{formatShares(maxShares, treasury?.decimals || 9)} <span class="unit">YBT</span
						></span
					>
				</div>
				<div class="position-row">
					<span class="label">Address</span>
					<span class="address"
						>{position.address.slice(0, 8)}...{position.address.slice(-6)}</span
					>
				</div>
			</div>

			<!-- Quick Percentage Buttons -->
			<div class="quick-select">
				<div class="quick-select-label">Quick Select</div>
				<div class="quick-buttons">
					<button
						class="quick-btn"
						onclick={() => setPercentage(25)}
						disabled={isProcessing || maxShares === 0}
					>
						25%
					</button>
					<button
						class="quick-btn"
						onclick={() => setPercentage(50)}
						disabled={isProcessing || maxShares === 0}
					>
						50%
					</button>
					<button
						class="quick-btn"
						onclick={() => setPercentage(75)}
						disabled={isProcessing || maxShares === 0}
					>
						75%
					</button>
					<button class="quick-btn" onclick={setMaxAmount} disabled={isProcessing || maxShares === 0}>
						MAX
					</button>
				</div>
			</div>

			<!-- Amount Input -->
			<div class="input-group">
				<label for="withdraw-amount">Shares to Withdraw</label>
				<div class="input-wrapper">
					<input
						id="withdraw-amount"
						type="number"
						step={1 / 10 ** (treasury?.decimals || 9)}
						min="0"
						max={maxShares}
						bind:value={withdrawAmount}
						placeholder={"0." + "0".repeat(treasury?.decimals || 9)}
						disabled={isProcessing}
					/>
					<button class="max-button" onclick={setMaxAmount} disabled={isProcessing || maxShares === 0}>
						MAX
					</button>
				</div>
			</div>

			<!-- Preview -->
			{#if sharesAmount > 0}
				<div class="preview-card">
					<div class="preview-title">Withdrawal Preview</div>
					<div class="preview-row">
						<span>Shares:</span>
						<span class="preview-value"
							>{formatShares(sharesAmount, treasury?.decimals || 9)} YBT</span
						>
					</div>
					<div class="preview-row">
						<span>Percentage:</span>
						<span class="preview-value percentage">{withdrawPercentage.toFixed(2)}%</span>
					</div>
					<div class="preview-row">
						<span>Transaction Fee:</span>
						<span class="preview-value">{formatVOI(transactionFee)} VOI</span>
					</div>
					<div class="preview-row total">
						<span>You'll receive:</span>
						<span class="preview-value gold">{formatVOI(voiAmount)} VOI</span>
					</div>
				</div>
			{/if}

			<!-- Error Display -->
			{#if error}
				<div class="error-card">
					<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
						<path
							fill-rule="evenodd"
							d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
							clip-rule="evenodd"
						/>
					</svg>
					<span>{error}</span>
				</div>
			{/if}

			<!-- Warning -->
			{#if sharesAmount > 0}
				<div class="warning-card">
					<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
						<path
							fill-rule="evenodd"
							d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
							clip-rule="evenodd"
						/>
					</svg>
					<div>
						<div class="warning-title">Withdrawal Notice</div>
						<p>
							Withdrawing shares will reduce your ownership percentage and future yield earnings.
						</p>
					</div>
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="action-buttons">
				<button class="button secondary" onclick={onClose} disabled={isProcessing}>Cancel</button>
				<button class="button primary withdraw" onclick={handleWithdraw} disabled={!canWithdraw}>
					{#if isProcessing}
						<div class="button-spinner"></div>
						<span>Withdrawing...</span>
					{:else}
						<span>Withdraw</span>
					{/if}
				</button>
			</div>

			<!-- Info -->
			<div class="info-card">
				<ul>
					<li>Withdrawal amounts are converted back to VOI</li>
					<li>Transaction fees apply to all withdrawals</li>
					<li>Withdrawals are processed immediately</li>
				</ul>
			</div>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
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
		border: 1px solid rgba(239, 68, 68, 0.2);
		border-radius: 24px;
		max-width: 500px;
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
		margin: 0 0 0.25rem 0;
		color: #ffffff;
	}

	.pool-name {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.5);
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
		color: #ef4444;
	}

	.modal-body {
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Position Card */
	.position-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.position-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.position-row .label {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.position-row .value {
		font-family: 'Syne', sans-serif;
		font-size: 1.125rem;
		font-weight: 600;
		color: #ffffff;
	}

	.position-row .value.shares {
		color: #10b981;
	}

	.position-row .unit {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.5);
		margin-left: 0.25rem;
	}

	.position-row .address {
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.7);
	}

	/* Quick Select */
	.quick-select {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.quick-select-label {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.9);
		font-weight: 500;
	}

	.quick-buttons {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5rem;
	}

	.quick-btn {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 0.625rem;
		color: rgba(255, 255, 255, 0.9);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.quick-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.quick-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Input Groups */
	.input-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.input-group label {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
	}

	.input-wrapper {
		position: relative;
	}

	input {
		width: 100%;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1rem;
		color: #ffffff;
		font-size: 1rem;
		transition: all 0.3s ease;
	}

	input:focus {
		outline: none;
		border-color: rgba(239, 68, 68, 0.5);
		background: rgba(255, 255, 255, 0.08);
	}

	input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.max-button {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 6px;
		padding: 0.375rem 0.875rem;
		color: #ef4444;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.max-button:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.25);
		border-color: rgba(239, 68, 68, 0.5);
	}

	.max-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Preview Card */
	.preview-card {
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1.25rem;
	}

	.preview-title {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.6);
		margin-bottom: 1rem;
		font-weight: 500;
	}

	.preview-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.preview-row.total {
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		margin-top: 0.5rem;
		padding-top: 1rem;
		font-weight: 600;
	}

	.preview-value {
		color: #ffffff;
		font-weight: 500;
	}

	.preview-value.gold {
		color: #d4af37;
	}

	.preview-value.percentage {
		color: #10b981;
	}

	/* Error Card */
	.error-card {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 12px;
		padding: 1rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: #ef4444;
		font-size: 0.875rem;
	}

	/* Warning Card */
	.warning-card {
		background: rgba(251, 191, 36, 0.1);
		border: 1px solid rgba(251, 191, 36, 0.3);
		border-radius: 12px;
		padding: 1rem;
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		color: #fbbf24;
		font-size: 0.875rem;
	}

	.warning-title {
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	.warning-card p {
		margin: 0;
		color: rgba(251, 191, 36, 0.9);
	}

	/* Action Buttons */
	.action-buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-top: 0.5rem;
	}

	.button {
		padding: 1rem 1.5rem;
		border-radius: 12px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.button.secondary {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.9);
	}

	.button.secondary:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.button.primary.withdraw {
		background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
		color: #ffffff;
	}

	.button.primary.withdraw:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4);
	}

	.button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none !important;
	}

	.button-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #ffffff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Info Card */
	.info-card {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		padding: 1rem;
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	.info-card ul {
		margin: 0;
		padding-left: 1.25rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.info-card li {
		margin-bottom: 0.375rem;
	}

	.info-card li:last-child {
		margin-bottom: 0;
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

		.action-buttons {
			grid-template-columns: 1fr;
		}

		.quick-buttons {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
