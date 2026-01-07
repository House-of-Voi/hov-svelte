<script lang="ts">
	import type { SlotMachineConfig } from '$lib/types/database';
	import type { HousePositionWithMetadata } from '$lib/types/house';
	import type { GameAccountInfo, SessionInfo } from '$lib/auth/session';
	import { connectedWallets } from 'avm-wallet-svelte';
	import { signTransactions } from '$lib/voi/wallet-utils';
	import { getAlgodClient } from '$lib/voi/asa-utils';
	import algosdk from 'algosdk';
	import { CONTRACT } from 'ulujs';
	import { onMount } from 'svelte';
	import { getStoredGameAccountAddresses } from '$lib/auth/gameAccountStorage';
	import { APP_SPEC as YBTAppSpec } from '$lib/voi/house/YieldBearingTokenClient';

	interface Props {
		contract: SlotMachineConfig;
		position: HousePositionWithMetadata | null;
		positions: HousePositionWithMetadata[];
		gameAccounts: GameAccountInfo[];
		activeGameAccountId?: string;
		unlockedAddresses: Set<string>;
		connectedExternalAddresses: Set<string>;
		session: SessionInfo;
		onClose: () => void;
		onSuccess: () => Promise<void>;
	}

	let { contract, position, positions, gameAccounts, activeGameAccountId, unlockedAddresses, connectedExternalAddresses, session, onClose, onSuccess }: Props = $props();

	// Position selection state
	let selectedPositionAddress = $state<string>('');
	let dropdownOpen = $state(false);

	let withdrawAmount = $state('');
	let isProcessing = $state(false);
	let error = $state('');
	let treasury = $state<any>(null);

	// Build list of withdrawable positions (only unlocked game accounts + connected external wallets)
	interface PositionOption {
		address: string;
		type: 'game' | 'external';
		label: string;
		subLabel: string;
		icon: string;
		position: HousePositionWithMetadata;
	}

	const availablePositions = $derived.by(() => {
		const options: PositionOption[] = [];

		for (const pos of positions) {
			// Check if it's an unlocked game account
			const gameAccount = gameAccounts.find(a => a.voiAddress === pos.address);
			if (gameAccount && unlockedAddresses.has(pos.address)) {
				options.push({
					address: pos.address,
					type: 'game',
					label: gameAccount.nickname || shortAddress(pos.address),
					subLabel: gameAccount.nickname ? shortAddress(pos.address) : getAuthMethodLabel(gameAccount),
					icon: '🎮',
					position: pos
				});
			}
			// Check if it's a connected external wallet
			else if (connectedExternalAddresses.has(pos.address)) {
				const wallet = $connectedWallets?.find(w => w.address === pos.address);
				options.push({
					address: pos.address,
					type: 'external',
					label: wallet?.app || 'External Wallet',
					subLabel: shortAddress(pos.address),
					icon: '🔗',
					position: pos
				});
			}
		}

		// Sort with active account first
		options.sort((a, b) => {
			const aActive = gameAccounts.find(g => g.voiAddress === a.address)?.id === activeGameAccountId;
			const bActive = gameAccounts.find(g => g.voiAddress === b.address)?.id === activeGameAccountId;
			if (aActive && !bActive) return -1;
			if (bActive && !aActive) return 1;
			return 0;
		});

		return options;
	});

	const selectedOption = $derived(availablePositions.find(p => p.address === selectedPositionAddress) || null);
	const selectedPosition = $derived(selectedOption?.position || null);

	// Initialize selection
	onMount(async () => {
		await loadTreasuryData();

		// If a position was provided and it's actionable, select it
		if (position) {
			const matchingOption = availablePositions.find(p => p.address === position.address);
			if (matchingOption) {
				selectedPositionAddress = matchingOption.address;
			} else if (availablePositions.length > 0) {
				selectedPositionAddress = availablePositions[0].address;
			}
		} else if (availablePositions.length > 0) {
			selectedPositionAddress = availablePositions[0].address;
		}
	});

	async function loadTreasuryData() {
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
			console.error('Error loading treasury data:', err);
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

	const sharesAmount = $derived(parseFloat(withdrawAmount) || 0);
	const sharesBigInt = $derived(
		treasury ? BigInt(Math.floor(sharesAmount * 10 ** treasury.decimals)) : 0n
	);
	const transactionFee = 7000;
	const maxShares = $derived(selectedPosition?.formattedShares || 0);
	const canWithdraw = $derived(
		sharesAmount > 0 &&
		selectedPosition &&
		sharesBigInt <= selectedPosition.shares &&
		!isProcessing
	);

	const voiAmount = $derived(
		treasury && treasury.totalSupply > 0n
			? (sharesBigInt * treasury.balanceTotal) / treasury.totalSupply
			: 0n
	);

	const withdrawPercentage = $derived(maxShares > 0 ? (sharesAmount / maxShares) * 100 : 0);

	function formatVOI(microVOI: bigint | number): string {
		const amount = typeof microVOI === 'bigint' ? Number(microVOI) : microVOI;
		const voi = amount / 1_000_000;
		if (voi >= 1_000_000) {
			return `${(voi / 1_000_000).toFixed(3)}M`;
		}
		if (voi >= 1000) {
			return `${(voi / 1000).toFixed(2)}K`;
		}
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

	function selectPosition(option: PositionOption) {
		selectedPositionAddress = option.address;
		withdrawAmount = ''; // Reset amount when switching
		dropdownOpen = false;
	}

	async function handleWithdraw() {
		if (!canWithdraw || !selectedPosition || !selectedOption) return;

		// Double-check unlock status for game accounts
		if (selectedOption.type === 'game') {
			const currentUnlocked = getStoredGameAccountAddresses();
			if (!currentUnlocked.includes(selectedPosition.address)) {
				error = 'Account is locked. Please unlock it first.';
				return;
			}
		}

		isProcessing = true;
		error = '';

		try {
			const algodClient = getAlgodClient();

			// Create ulujs CONTRACT instance with YBT ABI
			const ybtABI = {
				name: "Yield Bearing Token",
				desc: "A yield bearing token contract",
				methods: YBTAppSpec.contract.methods,
				events: []
			};

			const ci = new CONTRACT(
				contract.ybt_app_id!,
				algodClient,
				undefined,
				ybtABI,
				{
					addr: selectedPosition.address,
					sk: new Uint8Array(0)
				}
			);

			// Set fee to cover inner transactions
			ci.setFee(7000);

			// Call withdraw using ulujs - it handles ABI encoding, boxes, etc automatically
			console.log('Calling withdraw with shares:', sharesBigInt.toString());
			const result = await ci.withdraw(sharesBigInt);

			if (!result.success) {
				throw new Error(`Withdrawal failed: ${result.error || 'Unknown error'}`);
			}

			if (!result.txns || result.txns.length === 0) {
				throw new Error('No transactions generated by ulujs');
			}

			console.log('ulujs generated transactions:', result.txns.length);

			// Decode base64 transaction strings to algosdk.Transaction[]
			const decodedTxns = result.txns.map((txnBlob: string) => {
				const binaryString = atob(txnBlob);
				const bytes = new Uint8Array(binaryString.length);
				for (let i = 0; i < binaryString.length; i++) {
					bytes[i] = binaryString.charCodeAt(i);
				}
				return algosdk.decodeUnsignedTransaction(bytes);
			});

			// Sign and send transactions
			const signedTxns = await signTransactions(decodedTxns, selectedPosition.address, session);
			const { txid } = await algodClient.sendRawTransaction(signedTxns).do();

			console.log('Withdrawal successful! TxID:', txid);

			await algosdk.waitForConfirmation(algodClient, txid, 4);

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

	function closeDropdown() {
		dropdownOpen = false;
	}
</script>

<svelte:window onclick={closeDropdown} />

<div class="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onclick={handleBackdropClick}>
	<div class="bg-white dark:bg-neutral-800 border border-error-200 dark:border-error-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-in-bottom" onclick={(e) => e.stopPropagation()}>
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
			<!-- Position Selection Dropdown -->
			<div>
				<label class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2 block">From Position</label>

				{#if availablePositions.length === 0}
					<div class="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-xl p-4 text-sm text-warning-700 dark:text-warning-400">
						No withdrawable positions. Please unlock a game account or connect an external wallet with a position.
					</div>
				{:else}
					<div class="relative">
						<button
							type="button"
							onclick={(e) => { e.stopPropagation(); dropdownOpen = !dropdownOpen; }}
							class="w-full flex items-center gap-3 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors text-left"
						>
							{#if selectedOption && selectedPosition}
								<span class="text-lg">{selectedOption.icon}</span>
								<div class="flex-1 min-w-0">
									<span class="block font-medium text-neutral-900 dark:text-white text-sm truncate">{selectedOption.label}</span>
									<span class="block text-xs text-neutral-500 dark:text-neutral-400 font-mono">{selectedOption.subLabel}</span>
								</div>
								<div class="text-right mr-2">
									<span class="block text-sm font-semibold text-success-600 dark:text-success-400">
										{formatVOI(selectedPosition.voiValue)}
									</span>
									<span class="block text-xs text-neutral-400">VOI</span>
								</div>
							{:else}
								<span class="text-neutral-500">Select a position</span>
							{/if}
							<svg class="w-5 h-5 text-neutral-400 flex-shrink-0 transition-transform {dropdownOpen ? 'rotate-180' : ''}" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
							</svg>
						</button>

						{#if dropdownOpen}
							<div class="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
								{#each availablePositions as option (option.address)}
									{@const isSelected = option.address === selectedPositionAddress}
									<button
										type="button"
										onclick={(e) => { e.stopPropagation(); selectPosition(option); }}
										class="w-full flex items-center gap-3 p-3 text-left transition-colors {isSelected ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/50'}"
									>
										<span class="text-lg">{option.icon}</span>
										<div class="flex-1 min-w-0">
											<span class="block font-medium text-neutral-900 dark:text-white text-sm truncate">{option.label}</span>
											<span class="block text-xs text-neutral-500 dark:text-neutral-400 font-mono">{option.subLabel}</span>
										</div>
										<div class="text-right">
											<span class="block text-sm font-semibold text-success-600 dark:text-success-400">
												{formatVOI(option.position.voiValue)}
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

			{#if selectedPosition}
				<!-- Position Stats -->
				<div class="grid grid-cols-2 gap-3">
					<div class="bg-neutral-50 dark:bg-neutral-900/50 rounded-xl p-3">
						<span class="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">Available Shares</span>
						<span class="block text-lg font-semibold text-success-600 dark:text-success-400">{formatShares(maxShares, treasury?.decimals || 9)}</span>
					</div>
					<div class="bg-neutral-50 dark:bg-neutral-900/50 rounded-xl p-3">
						<span class="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">Pool Share</span>
						<span class="block text-lg font-semibold text-neutral-900 dark:text-white">{selectedPosition.sharePercentage.toFixed(2)}%</span>
					</div>
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
				<button class="btn bg-error-500 hover:bg-error-600 text-white" onclick={handleWithdraw} disabled={!canWithdraw}>
					{#if isProcessing}
						<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
						<span>Withdrawing...</span>
					{:else}
						<span>Withdraw</span>
					{/if}
				</button>
			</div>
		</div>
	</div>
</div>

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
