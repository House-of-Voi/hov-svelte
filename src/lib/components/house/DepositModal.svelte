<script lang="ts">
	import type { SlotMachineConfig } from '$lib/types/database';
	import type { HousePositionWithMetadata } from '$lib/types/house';
	import type { GameAccountInfo, SessionInfo } from '$lib/auth/session';
	import { houseWallet } from '$lib/stores/houseWallet.svelte';
	import { ybtService } from '$lib/voi/house/ybt-service';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { getStoredGameAccountAddresses } from '$lib/auth/gameAccountStorage';
	import { fetchVoiBalance } from '$lib/voi/balances';
	import UnlockGameAccount from '$lib/components/gameAccounts/UnlockGameAccount.svelte';

	interface Props {
		contract: SlotMachineConfig;
		position: HousePositionWithMetadata | null;
		gameAccounts: GameAccountInfo[];
		selectedSource: 'game' | 'external';
		selectedGameAccount: GameAccountInfo | null;
		session: SessionInfo;
		onClose: () => void;
		onSuccess: () => Promise<void>;
	}

	let { contract, position, gameAccounts, selectedSource, selectedGameAccount, session, onClose, onSuccess }: Props = $props();

	let depositAmount = $state('');
	let isProcessing = $state(false);
	let error = $state('');
	let treasury = $state<any>(null);
	let unlockingAccount = $state<GameAccountInfo | null>(null);

	// Track unlocked addresses and balance
	let unlockedAddresses = $state<Set<string>>(new Set());
	let balance = $state(0);
	let balanceLoading = $state(true);

	// Get selected address
	const selectedAddress = $derived.by(() => {
		if (selectedSource === 'game' && selectedGameAccount) {
			return selectedGameAccount.voiAddress;
		}
		if (selectedSource === 'external' && houseWallet.externalWallet) {
			return houseWallet.externalWallet.address;
		}
		return '';
	});

	// Check if selected account is unlocked
	const isSelectedUnlocked = $derived.by(() => {
		if (selectedSource === 'external') return true;
		if (!selectedGameAccount) return false;
		return unlockedAddresses.has(selectedGameAccount.voiAddress);
	});

	onMount(async () => {
		await Promise.all([loadData(), refreshUnlockedAddresses(), fetchBalance()]);
	});

	async function refreshUnlockedAddresses() {
		if (browser) {
			const stored = getStoredGameAccountAddresses();
			unlockedAddresses = new Set(stored);
		}
	}

	async function fetchBalance() {
		balanceLoading = true;
		try {
			if (selectedSource === 'game' && selectedGameAccount) {
				const result = await fetchVoiBalance(selectedGameAccount.voiAddress);
				balance = result?.balance || 0;
			} else if (selectedSource === 'external') {
				balance = Number(houseWallet.externalBalance);
			}
		} catch (err) {
			console.error('Failed to fetch balance:', err);
			balance = 0;
		} finally {
			balanceLoading = false;
		}
	}

	async function loadData() {
		try {
			const response = await fetch(`/api/house/treasury/${contract.contract_id}`);
			if (!response.ok) throw new Error('Failed to load treasury data');

			const data = await response.json();
			treasury = {
				...data.treasury,
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

	// Helpers
	function shortAddress(address: string): string {
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	function displayName(account: GameAccountInfo): string {
		return account.nickname || shortAddress(account.voiAddress);
	}

	const voiAmount = $derived(parseFloat(depositAmount) || 0);
	const microVoiAmount = $derived(BigInt(Math.floor(voiAmount * 1_000_000)));
	const minDeposit = 0.1;
	const transactionFee = 4000;
	const reserveAmount = 1_000_000;
	const totalRequired = $derived(microVoiAmount + BigInt(transactionFee));
	const canDeposit = $derived(
		voiAmount >= minDeposit &&
		balance >= Number(totalRequired) + reserveAmount &&
		!isProcessing &&
		selectedAddress &&
		isSelectedUnlocked
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

	function handleUnlockClick() {
		if (selectedGameAccount) {
			unlockingAccount = selectedGameAccount;
		}
	}

	async function handleUnlockSuccess() {
		await refreshUnlockedAddresses();
		unlockingAccount = null;
	}

	function handleUnlockClose() {
		unlockingAccount = null;
	}

	async function handleDeposit() {
		if (!canDeposit) return;

		// Double-check unlock status for game accounts
		if (selectedSource === 'game' && selectedGameAccount) {
			const currentUnlocked = getStoredGameAccountAddresses();
			if (!currentUnlocked.includes(selectedGameAccount.voiAddress)) {
				unlockingAccount = selectedGameAccount;
				return;
			}
		}

		isProcessing = true;
		error = '';

		try {
			const result = await ybtService.deposit(
				{
					contractId: contract.contract_id,
					ybtAppId: contract.ybt_app_id!,
					amount: microVoiAmount,
					address: selectedAddress,
					walletSource: selectedSource === 'game' ? 'cdp' : 'external'
				},
				session
			);

			if (!result.success) {
				throw new Error(result.error || 'Deposit failed');
			}

			console.log('Deposit successful! TxID:', result.txHash);
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

<div class="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onclick={handleBackdropClick}>
	<div class="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-in-bottom">
		<!-- Header -->
		<div class="flex justify-between items-start p-5 border-b border-neutral-200 dark:border-neutral-700">
			<div>
				<h2 class="text-lg font-bold text-neutral-900 dark:text-white mb-1">Deposit to Pool</h2>
				<p class="text-sm text-neutral-500 dark:text-neutral-400">{contract.display_name}</p>
			</div>
			<button class="text-neutral-400 hover:text-primary-500 p-1 transition-colors" onclick={onClose}>
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Body -->
		<div class="p-5 flex flex-col gap-5">
			<!-- Selected Account Info -->
			<div class="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl p-4">
				<div class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">Depositing from</div>
				<div class="flex items-center gap-3">
					{#if selectedSource === 'game' && selectedGameAccount}
						<span class="text-2xl">{isSelectedUnlocked ? '🔓' : '🔒'}</span>
						<div class="flex-1 min-w-0">
							<span class="block font-semibold text-neutral-900 dark:text-white">{displayName(selectedGameAccount)}</span>
							<span class="block font-mono text-xs text-neutral-500 dark:text-neutral-400">{shortAddress(selectedGameAccount.voiAddress)}</span>
						</div>
					{:else if selectedSource === 'external' && houseWallet.externalWallet}
						<span class="text-2xl">🔗</span>
						<div class="flex-1 min-w-0">
							<span class="block font-semibold text-neutral-900 dark:text-white">External Wallet</span>
							<span class="block font-mono text-xs text-neutral-500 dark:text-neutral-400">{shortAddress(houseWallet.externalWallet.address)}</span>
						</div>
					{:else}
						<span class="text-neutral-500">No wallet selected</span>
					{/if}
					<div class="text-lg font-semibold text-success-600 dark:text-success-400">
						{#if balanceLoading}
							<span class="text-neutral-400">...</span>
						{:else}
							{formatVOI(balance)} <span class="text-xs text-success-500/70">VOI</span>
						{/if}
					</div>
				</div>
				{#if selectedSource === 'game' && selectedGameAccount && !isSelectedUnlocked}
					<button class="mt-3 w-full bg-warning-100 dark:bg-warning-900/30 border border-warning-300 dark:border-warning-700 text-warning-700 dark:text-warning-400 py-2.5 px-4 rounded-lg text-sm font-semibold hover:bg-warning-200 dark:hover:bg-warning-900/40 transition-colors" onclick={handleUnlockClick}>
						Unlock to deposit
					</button>
				{/if}
			</div>

			<!-- Amount Input -->
			<div class="flex flex-col gap-2">
				<label for="deposit-amount" class="text-sm font-medium text-neutral-700 dark:text-neutral-300 flex justify-between items-center">
					Deposit Amount (VOI)
					<span class="text-xs text-neutral-500 dark:text-neutral-400 font-normal">Min: {minDeposit} VOI</span>
				</label>
				<div class="relative">
					<input
						id="deposit-amount"
						type="number"
						step="0.000001"
						min={minDeposit}
						max={balance / 1_000_000}
						bind:value={depositAmount}
						placeholder="0.000000"
						disabled={isProcessing || !isSelectedUnlocked}
						class="input pr-16"
					/>
					<button
						class="absolute right-3 top-1/2 -translate-y-1/2 bg-primary-100 dark:bg-primary-900/30 border border-primary-300 dark:border-primary-700 rounded px-2 py-1 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-900/50 disabled:opacity-50 transition-colors"
						onclick={setMaxAmount}
						disabled={isProcessing || !isSelectedUnlocked}
					>MAX</button>
				</div>
			</div>

			<!-- Preview -->
			{#if voiAmount > 0}
				<div class="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4">
					<div class="text-xs text-neutral-500 dark:text-neutral-400 font-medium mb-3">Transaction Preview</div>
					<div class="flex justify-between items-center py-1 text-sm text-neutral-600 dark:text-neutral-400">
						<span>Deposit Amount:</span>
						<span class="text-neutral-900 dark:text-white font-medium">{formatVOI(microVoiAmount)} VOI</span>
					</div>
					<div class="flex justify-between items-center py-1 text-sm text-neutral-600 dark:text-neutral-400">
						<span>Transaction Fee:</span>
						<span class="text-neutral-900 dark:text-white font-medium">{formatVOI(transactionFee)} VOI</span>
					</div>
					<div class="flex justify-between items-center py-2 mt-2 border-t border-neutral-200 dark:border-neutral-700 text-sm font-semibold">
						<span class="text-neutral-700 dark:text-neutral-300">Total Required:</span>
						<span class="text-primary-600 dark:text-primary-400">{formatVOI(totalRequired)} VOI</span>
					</div>
					{#if treasury}
						<div class="flex justify-between items-center py-1 text-sm text-neutral-600 dark:text-neutral-400">
							<span>Share Price:</span>
							<span class="text-neutral-900 dark:text-white font-medium">{formatVOI(treasury.sharePrice)} VOI/share</span>
						</div>
					{/if}
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

			<!-- Action Buttons -->
			<div class="grid grid-cols-2 gap-3">
				<button class="btn-ghost border border-neutral-200 dark:border-neutral-700" onclick={onClose} disabled={isProcessing}>Cancel</button>
				<button class="btn-primary" onclick={handleDeposit} disabled={!canDeposit}>
					{#if isProcessing}
						<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
						<span>Depositing...</span>
					{:else}
						<span>Deposit</span>
					{/if}
				</button>
			</div>

			<!-- Risk Warning -->
			<div class="bg-warning-50 dark:bg-warning-900/10 border border-warning-200 dark:border-warning-800 rounded-xl p-4 text-sm">
				<div class="font-semibold text-warning-700 dark:text-warning-400 mb-1">Risk Disclaimer</div>
				<p class="text-warning-600/80 dark:text-warning-500/80 leading-relaxed">
					As a house contributor, you share in both profits and losses. You earn when the house
					wins, but can lose funds when players win. Only invest what you can afford to lose.
				</p>
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
	/* Spinner animation */
	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}

	/* Mobile responsive */
	@media (max-width: 640px) {
		.grid-cols-2 {
			grid-template-columns: 1fr;
		}
	}
</style>
