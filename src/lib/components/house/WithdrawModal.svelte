<script lang="ts">
	import type { SlotMachineConfig } from '$lib/types/database';
	import type { HousePositionWithMetadata } from '$lib/types/house';
	import type { GameAccountInfo, SessionInfo } from '$lib/auth/session';
	import { signTransactions } from '$lib/voi/wallet-utils';
	import { getAlgodClient, submitTransaction } from '$lib/voi/asa-utils';
	import { browser } from '$app/environment';
	import algosdk from 'algosdk';
	import { onMount } from 'svelte';
	import { getStoredGameAccountAddresses } from '$lib/auth/gameAccountStorage';
	import UnlockGameAccount from '$lib/components/gameAccounts/UnlockGameAccount.svelte';

	interface Props {
		contract: SlotMachineConfig;
		position: HousePositionWithMetadata;
		gameAccounts: GameAccountInfo[];
		session: SessionInfo;
		onClose: () => void;
		onSuccess: () => Promise<void>;
	}

	let { contract, position, gameAccounts, session, onClose, onSuccess }: Props = $props();

	let withdrawAmount = $state('');
	let isProcessing = $state(false);
	let error = $state('');
	let treasury = $state<any>(null);
	let unlockedAddresses = $state<Set<string>>(new Set());
	let unlockStatusChecked = $state(false);
	let unlockingAccount = $state<GameAccountInfo | null>(null);

	// Find if the position's address belongs to a game account
	const positionGameAccount = $derived(
		gameAccounts.find(a => a.voiAddress === position.address) || null
	);

	// Check if account is unlocked (or if it's an external wallet)
	// Don't show as locked until we've actually checked
	const isPositionUnlocked = $derived.by(() => {
		// If it's not a game account, assume it's an external wallet (always "unlocked")
		if (!positionGameAccount) return true;
		// If we haven't checked yet, assume unlocked to avoid flash
		if (!unlockStatusChecked) return true;
		return unlockedAddresses.has(position.address);
	});

	onMount(async () => {
		await Promise.all([loadTreasuryData(), refreshUnlockedAddresses()]);
	});

	async function refreshUnlockedAddresses() {
		if (browser) {
			const stored = getStoredGameAccountAddresses();
			unlockedAddresses = new Set(stored);
			unlockStatusChecked = true;
		}
	}

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
		sharesAmount > 0 && sharesBigInt <= position.shares && !isProcessing && isPositionUnlocked
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

	function handleUnlockClick() {
		if (positionGameAccount) {
			unlockingAccount = positionGameAccount;
		}
	}

	async function handleUnlockSuccess() {
		await refreshUnlockedAddresses();
		unlockingAccount = null;
	}

	function handleUnlockClose() {
		unlockingAccount = null;
	}

	async function handleWithdraw() {
		if (!canWithdraw) return;

		// Double-check unlock status for game accounts
		if (positionGameAccount) {
			const currentUnlocked = getStoredGameAccountAddresses();
			if (!currentUnlocked.includes(position.address)) {
				unlockingAccount = positionGameAccount;
				return;
			}
		}

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
			const signedTxns = await signTransactions([withdrawTxn], position.address, session);

			// Submit transaction
			const txId = await submitTransaction(signedTxns[0]);
			console.log('Withdrawal successful! TxID:', txId);

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

<div class="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onclick={handleBackdropClick}>
	<div class="bg-white dark:bg-neutral-800 border border-error-200 dark:border-error-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-in-bottom">
		<!-- Header -->
		<div class="flex justify-between items-start p-5 border-b border-neutral-200 dark:border-neutral-700">
			<div>
				<h2 class="text-lg font-bold text-neutral-900 dark:text-white mb-1">Withdraw from Pool</h2>
				<p class="text-sm text-neutral-500 dark:text-neutral-400">{contract.display_name}</p>
			</div>
			<button class="text-neutral-400 hover:text-error-500 p-1 transition-colors" onclick={onClose}>
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Body -->
		<div class="p-5 flex flex-col gap-5">
			<!-- Position Info -->
			<div class="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 flex flex-col gap-3">
				<div class="flex justify-between items-center">
					<span class="text-sm text-neutral-500 dark:text-neutral-400">Your Position</span>
					<span class="text-lg font-semibold text-neutral-900 dark:text-white">{formatVOI(position.voiValue)} <span class="text-sm text-neutral-400">VOI</span></span>
				</div>
				<div class="flex justify-between items-center">
					<span class="text-sm text-neutral-500 dark:text-neutral-400">Available Shares</span>
					<span class="text-lg font-semibold text-success-600 dark:text-success-400">{formatShares(maxShares, treasury?.decimals || 9)} <span class="text-sm text-success-500/70">YBT</span></span>
				</div>
				<div class="flex justify-between items-center">
					<span class="text-sm text-neutral-500 dark:text-neutral-400">Address</span>
					<span class="font-mono text-sm text-neutral-600 dark:text-neutral-400">{position.address.slice(0, 8)}...{position.address.slice(-6)}</span>
				</div>
				{#if positionGameAccount && !isPositionUnlocked}
					<div class="mt-2 p-3 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg flex items-center gap-2 text-sm text-warning-700 dark:text-warning-400">
						<span>🔒</span>
						<span>This account is locked.</span>
						<button type="button" class="ml-auto bg-warning-100 dark:bg-warning-900/30 border border-warning-300 dark:border-warning-700 text-warning-700 dark:text-warning-400 px-3 py-1.5 rounded text-xs font-semibold hover:bg-warning-200 dark:hover:bg-warning-900/50 transition-colors" onclick={handleUnlockClick}>Unlock</button>
					</div>
				{/if}
			</div>

			<!-- Quick Percentage Buttons -->
			<div class="flex flex-col gap-2">
				<div class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Quick Select</div>
				<div class="grid grid-cols-4 gap-2">
					<button class="quick-btn" onclick={() => setPercentage(25)} disabled={isProcessing || maxShares === 0}>25%</button>
					<button class="quick-btn" onclick={() => setPercentage(50)} disabled={isProcessing || maxShares === 0}>50%</button>
					<button class="quick-btn" onclick={() => setPercentage(75)} disabled={isProcessing || maxShares === 0}>75%</button>
					<button class="quick-btn" onclick={setMaxAmount} disabled={isProcessing || maxShares === 0}>MAX</button>
				</div>
			</div>

			<!-- Amount Input -->
			<div class="flex flex-col gap-2">
				<label for="withdraw-amount" class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Shares to Withdraw</label>
				<div class="relative">
					<input
						id="withdraw-amount"
						type="number"
						step={1 / 10 ** (treasury?.decimals || 9)}
						min="0"
						max={maxShares}
						bind:value={withdrawAmount}
						placeholder={"0." + "0".repeat(treasury?.decimals || 9)}
						disabled={isProcessing}
						class="input pr-16"
					/>
					<button
						class="absolute right-3 top-1/2 -translate-y-1/2 bg-error-100 dark:bg-error-900/30 border border-error-300 dark:border-error-700 rounded px-2 py-1 text-xs font-semibold text-error-600 dark:text-error-400 hover:bg-error-200 dark:hover:bg-error-900/50 disabled:opacity-50 transition-colors"
						onclick={setMaxAmount}
						disabled={isProcessing || maxShares === 0}
					>MAX</button>
				</div>
			</div>

			<!-- Preview -->
			{#if sharesAmount > 0}
				<div class="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4">
					<div class="text-xs text-neutral-500 dark:text-neutral-400 font-medium mb-3">Withdrawal Preview</div>
					<div class="flex justify-between items-center py-1 text-sm text-neutral-600 dark:text-neutral-400">
						<span>Shares:</span>
						<span class="text-neutral-900 dark:text-white font-medium">{formatShares(sharesAmount, treasury?.decimals || 9)} YBT</span>
					</div>
					<div class="flex justify-between items-center py-1 text-sm text-neutral-600 dark:text-neutral-400">
						<span>Percentage:</span>
						<span class="text-success-600 dark:text-success-400 font-medium">{withdrawPercentage.toFixed(2)}%</span>
					</div>
					<div class="flex justify-between items-center py-1 text-sm text-neutral-600 dark:text-neutral-400">
						<span>Transaction Fee:</span>
						<span class="text-neutral-900 dark:text-white font-medium">{formatVOI(transactionFee)} VOI</span>
					</div>
					<div class="flex justify-between items-center py-2 mt-2 border-t border-neutral-200 dark:border-neutral-700 text-sm font-semibold">
						<span class="text-neutral-700 dark:text-neutral-300">You'll receive:</span>
						<span class="text-primary-600 dark:text-primary-400">{formatVOI(voiAmount)} VOI</span>
					</div>
				</div>
			{/if}

			<!-- Error Display -->
			{#if error}
				<div class="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-xl p-3 flex items-center gap-2.5 text-error-600 dark:text-error-400 text-sm">
					<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
					</svg>
					<span>{error}</span>
				</div>
			{/if}

			<!-- Warning -->
			{#if sharesAmount > 0}
				<div class="bg-warning-50 dark:bg-warning-900/10 border border-warning-200 dark:border-warning-800 rounded-xl p-4 flex items-start gap-3 text-warning-700 dark:text-warning-400 text-sm">
					<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" class="flex-shrink-0 mt-0.5">
						<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
					</svg>
					<div>
						<div class="font-semibold mb-0.5">Withdrawal Notice</div>
						<p class="text-warning-600/80 dark:text-warning-500/80">
							Withdrawing shares will reduce your ownership percentage and future yield earnings.
						</p>
					</div>
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="grid grid-cols-2 gap-3">
				<button class="btn-ghost border border-neutral-200 dark:border-neutral-700" onclick={onClose} disabled={isProcessing}>Cancel</button>
				<button class="btn bg-error-500 hover:bg-error-600 text-white" onclick={handleWithdraw} disabled={!canWithdraw}>
					{#if isProcessing}
						<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
						<span>Withdrawing...</span>
					{:else}
						<span>Withdraw</span>
					{/if}
				</button>
			</div>

			<!-- Info -->
			<div class="bg-neutral-50 dark:bg-neutral-900/30 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 text-sm">
				<ul class="list-disc list-inside text-neutral-600 dark:text-neutral-400 space-y-1">
					<li>Withdrawal amounts are converted back to VOI</li>
					<li>Transaction fees apply to all withdrawals</li>
					<li>Withdrawals are processed immediately</li>
				</ul>
			</div>
		</div>
	</div>
</div>

<!-- Unlock Modal -->
{#if unlockingAccount}
	<UnlockGameAccount
		voiAddress={unlockingAccount.voiAddress}
		nickname={unlockingAccount.nickname}
		recoveryMethod={unlockingAccount.cdpRecoveryMethod}
		recoveryHint={unlockingAccount.cdpRecoveryHint}
		modal={true}
		open={true}
		onSuccess={handleUnlockSuccess}
		onClose={handleUnlockClose}
	/>
{/if}

<style>
	/* Quick select buttons */
	.quick-btn {
		@apply bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg py-2.5 text-neutral-700 dark:text-neutral-300 text-sm font-semibold cursor-pointer transition-all;
	}

	.quick-btn:hover:not(:disabled) {
		@apply bg-neutral-200 dark:bg-neutral-600 border-neutral-300 dark:border-neutral-500;
	}

	.quick-btn:disabled {
		@apply opacity-50 cursor-not-allowed;
	}

	/* Spinner animation */
	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}

	/* Mobile responsive */
	@media (max-width: 640px) {
		.grid-cols-4 {
			grid-template-columns: repeat(2, 1fr);
		}
		.grid-cols-2 {
			grid-template-columns: 1fr;
		}
	}
</style>
