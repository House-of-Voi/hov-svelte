<script lang="ts">
	import type { Machine } from '$lib/types/database';
	import type { HousePositionWithMetadata } from '$lib/types/house';
	import type { GameAccountInfo, SessionInfo } from '$lib/auth/session';
	import { connectedWallets } from 'avm-wallet-svelte';
	import { ybtService } from '$lib/voi/house/ybt-service';
	import { onMount } from 'svelte';
	import { getStoredGameAccountAddresses } from '$lib/auth/gameAccountStorage';
	import { fetchVoiBalance } from '$lib/voi/balances';

	interface Props {
		contract: Machine;
		position: HousePositionWithMetadata | null;
		gameAccounts: GameAccountInfo[];
		activeGameAccountId?: string;
		unlockedAddresses: Set<string>;
		connectedExternalAddresses: Set<string>;
		session: SessionInfo;
		onClose: () => void;
		onSuccess: () => Promise<void>;
	}

	let { contract, position, gameAccounts, activeGameAccountId, unlockedAddresses, connectedExternalAddresses, session, onClose, onSuccess }: Props = $props();

	// Wallet selection state
	let selectedWalletKey = $state<string>('');
	let dropdownOpen = $state(false);

	let depositAmount = $state('');
	let isProcessing = $state(false);
	let error = $state('');
	let treasury = $state<any>(null);

	// Track balances
	let balances = $state<Map<string, number>>(new Map());
	let balancesLoading = $state(true);

	// Build list of available wallets (only unlocked game accounts + connected external wallets)
	interface WalletOption {
		key: string;
		type: 'game' | 'external';
		address: string;
		label: string;
		subLabel: string;
		icon: string;
	}

	const availableWallets = $derived.by(() => {
		const wallets: WalletOption[] = [];

		// Add unlocked game accounts (active account first)
		const unlockedGameAccounts = gameAccounts
			.filter(a => unlockedAddresses.has(a.voiAddress))
			.sort((a, b) => {
				if (a.id === activeGameAccountId) return -1;
				if (b.id === activeGameAccountId) return 1;
				return 0;
			});

		for (const account of unlockedGameAccounts) {
			wallets.push({
				key: `game:${account.id}`,
				type: 'game',
				address: account.voiAddress,
				label: account.nickname || shortAddress(account.voiAddress),
				subLabel: account.nickname ? shortAddress(account.voiAddress) : getAuthMethodLabel(account),
				icon: '🎮'
			});
		}

		// Add connected external wallets
		if ($connectedWallets) {
			for (const wallet of $connectedWallets) {
				if (wallet.address) {
					wallets.push({
						key: `external:${wallet.address}`,
						type: 'external',
						address: wallet.address,
						label: wallet.app || 'External Wallet',
						subLabel: shortAddress(wallet.address),
						icon: '🔗'
					});
				}
			}
		}

		return wallets;
	});

	const selectedWallet = $derived(availableWallets.find(w => w.key === selectedWalletKey) || null);
	const selectedAddress = $derived(selectedWallet?.address || '');
	const selectedBalance = $derived(balances.get(selectedAddress) || 0);

	// Initialize selection
	onMount(async () => {
		await loadData();
		await fetchAllBalances();

		// If a position was provided, try to select that wallet
		if (position) {
			const matchingWallet = availableWallets.find(w => w.address === position.address);
			if (matchingWallet) {
				selectedWalletKey = matchingWallet.key;
			} else if (availableWallets.length > 0) {
				selectedWalletKey = availableWallets[0].key;
			}
		} else if (availableWallets.length > 0) {
			// Default to first available (which is active account if unlocked)
			selectedWalletKey = availableWallets[0].key;
		}
	});

	async function fetchAllBalances() {
		balancesLoading = true;
		const newBalances = new Map<string, number>();

		// Fetch all balances in parallel
		const allAddresses = [
			...gameAccounts.filter(a => unlockedAddresses.has(a.voiAddress)).map(a => a.voiAddress),
			...($connectedWallets?.map(w => w.address).filter(Boolean) || [])
		];

		const results = await Promise.all(
			allAddresses.map(async (address) => {
				try {
					const result = await fetchVoiBalance(address);
					return { address, balance: result?.balance || 0 };
				} catch {
					return { address, balance: 0 };
				}
			})
		);

		for (const result of results) {
			newBalances.set(result.address, result.balance);
		}

		balances = newBalances;
		balancesLoading = false;
	}

	async function loadData() {
		try {
			const response = await fetch(`/api/house/treasury/${contract.game_contract_id}`);
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

	function getAuthMethodLabel(account: GameAccountInfo): string {
		switch (account.cdpRecoveryMethod) {
			case 'email': return 'Email';
			case 'sms': return 'SMS';
			case 'google': return 'Google';
			case 'mnemonic': return 'Mnemonic';
			default: return 'Game Account';
		}
	}

	const voiAmount = $derived(parseFloat(depositAmount) || 0);
	const microVoiAmount = $derived(BigInt(Math.floor(voiAmount * 1_000_000)));
	const minDeposit = 0.1;
	const transactionFee = 4000;
	const reserveAmount = 1_000_000;
	const totalRequired = $derived(microVoiAmount + BigInt(transactionFee));
	const canDeposit = $derived(
		voiAmount >= minDeposit &&
		selectedBalance >= Number(totalRequired) + reserveAmount &&
		!isProcessing &&
		selectedAddress
	);

	function formatVOI(microVOI: bigint | number): string {
		const amount = typeof microVOI === 'bigint' ? Number(microVOI) : microVOI;
		const voi = amount / 1_000_000;
		return voi.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
	}

	function setMaxAmount() {
		const maxVoi = selectedBalance / 1_000_000;
		const feesVoi = transactionFee / 1_000_000;
		const reserveVoi = reserveAmount / 1_000_000;
		const availableForDeposit = Math.max(0, maxVoi - feesVoi - reserveVoi);
		depositAmount = availableForDeposit.toFixed(6);
	}

	function selectWallet(wallet: WalletOption) {
		selectedWalletKey = wallet.key;
		dropdownOpen = false;
	}

	async function handleDeposit() {
		if (!canDeposit || !selectedWallet) return;

		// Double-check unlock status for game accounts
		if (selectedWallet.type === 'game') {
			const currentUnlocked = getStoredGameAccountAddresses();
			if (!currentUnlocked.includes(selectedWallet.address)) {
				error = 'Account is locked. Please unlock it first.';
				return;
			}
		}

		isProcessing = true;
		error = '';

		try {
			const result = await ybtService.deposit(
				{
					contractId: contract.game_contract_id!,
					ybtAppId: contract.treasury_contract_id!,
					amount: microVoiAmount,
					address: selectedAddress,
					walletSource: selectedWallet.type === 'game' ? 'cdp' : 'external'
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

	function closeDropdown() {
		dropdownOpen = false;
	}
</script>

<svelte:window onclick={closeDropdown} />

<div class="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onclick={handleBackdropClick}>
	<div class="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-in-bottom" onclick={(e) => e.stopPropagation()}>
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
			<!-- Wallet Selection Dropdown -->
			<div>
				<label class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2 block">From Wallet</label>

				{#if availableWallets.length === 0}
					<div class="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-xl p-4 text-sm text-warning-700 dark:text-warning-400">
						No wallets available. Please unlock a game account or connect an external wallet.
					</div>
				{:else}
					<div class="relative">
						<button
							type="button"
							onclick={(e) => { e.stopPropagation(); dropdownOpen = !dropdownOpen; }}
							class="w-full flex items-center gap-3 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors text-left"
						>
							{#if selectedWallet}
								<span class="text-lg">{selectedWallet.icon}</span>
								<div class="flex-1 min-w-0">
									<span class="block font-medium text-neutral-900 dark:text-white text-sm truncate">{selectedWallet.label}</span>
									<span class="block text-xs text-neutral-500 dark:text-neutral-400 font-mono">{selectedWallet.subLabel}</span>
								</div>
								<div class="text-right mr-2">
									<span class="block text-sm font-semibold text-success-600 dark:text-success-400">
										{balancesLoading ? '...' : formatVOI(selectedBalance)}
									</span>
									<span class="block text-xs text-neutral-400">VOI</span>
								</div>
							{:else}
								<span class="text-neutral-500">Select a wallet</span>
							{/if}
							<svg class="w-5 h-5 text-neutral-400 flex-shrink-0 transition-transform {dropdownOpen ? 'rotate-180' : ''}" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
							</svg>
						</button>

						{#if dropdownOpen}
							<div class="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
								{#each availableWallets as wallet (wallet.key)}
									{@const walletBalance = balances.get(wallet.address) || 0}
									{@const isSelected = wallet.key === selectedWalletKey}
									<button
										type="button"
										onclick={(e) => { e.stopPropagation(); selectWallet(wallet); }}
										class="w-full flex items-center gap-3 p-3 text-left transition-colors {isSelected ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/50'}"
									>
										<span class="text-lg">{wallet.icon}</span>
										<div class="flex-1 min-w-0">
											<span class="block font-medium text-neutral-900 dark:text-white text-sm truncate">{wallet.label}</span>
											<span class="block text-xs text-neutral-500 dark:text-neutral-400 font-mono">{wallet.subLabel}</span>
										</div>
										<div class="text-right">
											<span class="block text-sm font-semibold text-success-600 dark:text-success-400">
												{balancesLoading ? '...' : formatVOI(walletBalance)}
											</span>
											<span class="block text-xs text-neutral-400">VOI</span>
										</div>
										{#if isSelected}
											<span class="text-primary-500">✓</span>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>
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
						max={selectedBalance / 1_000_000}
						bind:value={depositAmount}
						placeholder="0.000000"
						disabled={isProcessing || !selectedAddress}
						class="input pr-16"
					/>
					<button
						class="absolute right-3 top-1/2 -translate-y-1/2 bg-primary-100 dark:bg-primary-900/30 border border-primary-300 dark:border-primary-700 rounded px-2 py-1 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-900/50 disabled:opacity-50 transition-colors"
						onclick={setMaxAmount}
						disabled={isProcessing || !selectedAddress}
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
