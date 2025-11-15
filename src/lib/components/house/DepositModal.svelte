<script lang="ts">
	import type { SlotMachineConfig } from '$lib/types/database';
	import type { HousePositionWithMetadata } from '$lib/types/house';
	import { houseWallet } from '$lib/stores/houseWallet.svelte';
	import { ybtService } from '$lib/voi/house/ybt-service';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	interface Props {
		contract: SlotMachineConfig;
		position: HousePositionWithMetadata | null;
		allAddresses: string[];
		onClose: () => void;
		onSuccess: () => Promise<void>;
	}

	let { contract, position, allAddresses, onClose, onSuccess }: Props = $props();

	let depositAmount = $state('');
	let isProcessing = $state(false);
	let error = $state('');
	let treasury = $state<any>(null);
	let selectedAddress = $state(position?.address || allAddresses[0] || '');

	// Get balance from houseWallet store based on selected address
	const balance = $derived.by(() => {
		// Check if selected address is the CDP wallet
		if (selectedAddress === houseWallet.cdpAddress) {
			return Number(houseWallet.cdpBalance);
		}
		// Check if it's the external wallet
		if (
			selectedAddress === houseWallet.externalWallet?.address &&
			houseWallet.isExternalConnected
		) {
			return Number(houseWallet.externalBalance);
		}
		// Default to 0 if address not found
		return 0;
	});

	onMount(async () => {
		await loadData();
		// Refresh balances when modal opens
		await refreshBalances();
	});

	async function loadData() {
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
			console.error('Error loading data:', err);
			error = 'Failed to load contract data';
		}
	}

	async function refreshBalances() {
		try {
			// Refresh both CDP and external wallet balances
			await houseWallet.refreshBalances();
			console.log('[DepositModal] Balances refreshed', {
				cdpBalance: houseWallet.cdpBalance.toString(),
				externalBalance: houseWallet.externalBalance.toString(),
				selectedAddress,
				derivedBalance: balance
			});
		} catch (err) {
			console.error('[DepositModal] Error refreshing balances:', err);
		}
	}

	const voiAmount = $derived(parseFloat(depositAmount) || 0);
	const microVoiAmount = $derived(BigInt(Math.floor(voiAmount * 1_000_000)));
	const minDeposit = $derived(0.1); // 0.1 VOI minimum
	const transactionFee = $derived(4000); // 4000 microVOI
	const reserveAmount = $derived(1_000_000); // 1 VOI reserve
	const totalRequired = $derived(microVoiAmount + BigInt(transactionFee));
	const canDeposit = $derived(
		voiAmount >= minDeposit &&
			balance >= Number(totalRequired) + reserveAmount &&
			!isProcessing &&
			selectedAddress
	);

	function formatVOI(microVOI: bigint | number): string {
		const amount = typeof microVOI === 'bigint' ? Number(microVOI) : microVOI;
		const voi = amount / 1_000_000;
		return voi.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
	}

	function setMaxAmount() {
		const maxVoi = balance / 1_000_000;
		const feesVoi = transactionFee / 1_000_000;
		const reserveVoi = reserveAmount / 1_000_000;
		const availableForDeposit = Math.max(0, maxVoi - feesVoi - reserveVoi);
		depositAmount = availableForDeposit.toFixed(6);
	}

	async function handleDeposit() {
		if (!canDeposit) return;

		isProcessing = true;
		error = '';

		try {
			const session = $page.data.session;

			// Use ybtService to handle deposit via ulujs ABI
			const result = await ybtService.deposit(
				{
					contractId: contract.contract_id,
					ybtAppId: contract.ybt_app_id!,
					amount: microVoiAmount,
					address: selectedAddress,
					walletSource: 'cdp' // Default to CDP, could be made dynamic
				},
				session
			);

			if (!result.success) {
				throw new Error(result.error || 'Deposit failed');
			}

			console.log('✅ Deposit successful! TxID:', result.txHash);
			console.log('Shares received:', result.shares.toString());

			await onSuccess();
			onClose();
		} catch (err) {
			console.error('Deposit error:', err);
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
				<h2>Deposit to Pool</h2>
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
			<!-- Balance Display -->
			<div class="balance-card">
				<div class="label">Available Balance</div>
				<div class="value">{formatVOI(balance)} <span class="unit">VOI</span></div>
			</div>

			<!-- Address Selector (if multiple addresses) -->
			{#if allAddresses.length > 1}
				<div class="input-group">
					<label for="address-select">Deposit From</label>
					<select id="address-select" bind:value={selectedAddress} disabled={isProcessing}>
						{#each allAddresses as addr}
							<option value={addr}>
								{addr.slice(0, 8)}...{addr.slice(-6)}
							</option>
						{/each}
					</select>
				</div>
			{/if}

			<!-- Amount Input -->
			<div class="input-group">
				<label for="deposit-amount">
					Deposit Amount (VOI)
					<span class="min-label">Min: {minDeposit} VOI</span>
				</label>
				<div class="input-wrapper">
					<input
						id="deposit-amount"
						type="number"
						step="0.000001"
						min={minDeposit}
						max={balance / 1_000_000}
						bind:value={depositAmount}
						placeholder="0.000000"
						disabled={isProcessing}
					/>
					<button class="max-button" onclick={setMaxAmount} disabled={isProcessing}>MAX</button>
				</div>
			</div>

			<!-- Preview -->
			{#if voiAmount > 0}
				<div class="preview-card">
					<div class="preview-title">Transaction Preview</div>
					<div class="preview-row">
						<span>Deposit Amount:</span>
						<span class="preview-value">{formatVOI(microVoiAmount)} VOI</span>
					</div>
					<div class="preview-row">
						<span>Transaction Fee:</span>
						<span class="preview-value">{formatVOI(transactionFee)} VOI</span>
					</div>
					<div class="preview-row total">
						<span>Total Required:</span>
						<span class="preview-value gold">{formatVOI(totalRequired)} VOI</span>
					</div>
					<div class="preview-row">
						<span>You'll receive:</span>
						<span class="preview-value green">YBT Shares</span>
					</div>
					{#if treasury}
						<div class="preview-row">
							<span>Share Price:</span>
							<span class="preview-value">{formatVOI(treasury.sharePrice)} VOI/share</span>
						</div>
					{/if}
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

			<!-- Action Buttons -->
			<div class="action-buttons">
				<button class="button secondary" onclick={onClose} disabled={isProcessing}>Cancel</button>
				<button class="button primary" onclick={handleDeposit} disabled={!canDeposit}>
					{#if isProcessing}
						<div class="button-spinner"></div>
						<span>Depositing...</span>
					{:else}
						<span>Deposit</span>
					{/if}
				</button>
			</div>

			<!-- Info Cards -->
			<div class="info-section">
				<div class="info-card benefits">
					<div class="info-title">Benefits</div>
					<ul>
						<li>YBT shares represent your portion of the house funds</li>
						<li>Earn yield based on your share percentage</li>
						<li>Withdraw your position at any time</li>
					</ul>
				</div>

				<div class="info-card risk">
					<div class="info-title">⚠ Risk Disclaimer</div>
					<p>
						As a house contributor, you share in both profits and losses. You earn when the house
						wins, but can lose funds when players win. Only invest what you can afford to lose.
					</p>
				</div>
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
		border: 1px solid rgba(212, 175, 55, 0.2);
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
		color: #d4af37;
	}

	.modal-body {
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Balance Card */
	.balance-card {
		background: rgba(212, 175, 55, 0.1);
		border: 1px solid rgba(212, 175, 55, 0.3);
		border-radius: 12px;
		padding: 1.25rem;
	}

	.balance-card .label {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.6);
		margin-bottom: 0.5rem;
	}

	.balance-card .value {
		font-family: 'Syne', sans-serif;
		font-size: 1.75rem;
		font-weight: 700;
		color: #d4af37;
	}

	.balance-card .unit {
		font-size: 1.125rem;
		color: rgba(212, 175, 55, 0.6);
		margin-left: 0.25rem;
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
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.min-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		font-weight: 400;
	}

	.input-wrapper {
		position: relative;
	}

	input,
	select {
		width: 100%;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1rem;
		color: #ffffff;
		font-size: 1rem;
		transition: all 0.3s ease;
	}

	input:focus,
	select:focus {
		outline: none;
		border-color: rgba(212, 175, 55, 0.5);
		background: rgba(255, 255, 255, 0.08);
	}

	input:disabled,
	select:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.max-button {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		background: rgba(212, 175, 55, 0.15);
		border: 1px solid rgba(212, 175, 55, 0.3);
		border-radius: 6px;
		padding: 0.375rem 0.875rem;
		color: #d4af37;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.max-button:hover:not(:disabled) {
		background: rgba(212, 175, 55, 0.25);
		border-color: rgba(212, 175, 55, 0.5);
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

	.preview-value.green {
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

	.button.primary {
		background: linear-gradient(135deg, #d4af37 0%, #f4d03f 100%);
		color: #0a0d1a;
	}

	.button.primary:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px rgba(212, 175, 55, 0.4);
	}

	.button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none !important;
	}

	.button-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(10, 13, 26, 0.3);
		border-top-color: #0a0d1a;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Info Section */
	.info-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.info-card {
		background: rgba(255, 255, 255, 0.02);
		border-radius: 12px;
		padding: 1rem;
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	.info-card.benefits {
		border: 1px solid rgba(16, 185, 129, 0.2);
	}

	.info-card.risk {
		border: 1px solid rgba(251, 191, 36, 0.3);
		background: rgba(251, 191, 36, 0.05);
	}

	.info-title {
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: rgba(255, 255, 255, 0.9);
	}

	.info-card.risk .info-title {
		color: #fbbf24;
	}

	.info-card ul {
		margin: 0;
		padding-left: 1.25rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.info-card p {
		margin: 0;
		color: rgba(255, 255, 255, 0.6);
	}

	.info-card.risk p {
		color: rgba(251, 191, 36, 0.9);
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
	}
</style>
