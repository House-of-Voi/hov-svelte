<script lang="ts">
	import { Web3Wallet } from 'avm-wallet-svelte';
	import { houseWallet } from '$lib/stores/houseWallet.svelte';
	import algosdk from 'algosdk';
	import { browser } from '$app/environment';
	import { formatCurrency, truncateAddress } from '$lib/utils/format';
	import { PUBLIC_WALLETCONNECT_PROJECT_ID, PUBLIC_VOI_NODE_URL } from '$env/static/public';
	import { getStoredGameAccountAddresses } from '$lib/auth/gameAccountStorage';
	import { fetchVoiBalance } from '$lib/voi/balances';
	import UnlockGameAccount from '$lib/components/gameAccounts/UnlockGameAccount.svelte';
	import type { GameAccountInfo } from '$lib/auth/session';

	interface Props {
		gameAccounts: GameAccountInfo[];
		activeGameAccountId?: string;
		onGameAccountSelect?: (account: GameAccountInfo) => void;
		onSourceChange?: (source: 'game' | 'external', address: string) => void;
	}

	let { gameAccounts, activeGameAccountId, onGameAccountSelect, onSourceChange }: Props = $props();

	// Algorand client configuration for avm-wallet-svelte
	const algodClient = new algosdk.Algodv2(
		'',
		PUBLIC_VOI_NODE_URL || 'https://testnet-api.voi.nodly.io',
		''
	);

	// Available wallets for avm-wallet-svelte
	const availableWallets = ['Kibisis', 'Lute', 'VoiWallet', 'BiatecWallet', 'WalletConnect'];

	// WalletConnect project configuration
	const wcProject = {
		projectId: PUBLIC_WALLETCONNECT_PROJECT_ID || '',
		projectName: 'House of Voi',
		projectDescription: 'Manage your house pool contributions',
		projectUrl: 'https://houseofvoi.com',
		projectIcons: ['https://houseofvoi.com/icon.png']
	};

	// Persistence key
	const STORAGE_KEY = 'hov_house_wallet_selection';

	// Load persisted selection
	function loadPersistedSelection(): { source: 'game' | 'external'; gameAccountId: string | null } | null {
		if (!browser) return null;
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) return JSON.parse(stored);
		} catch (e) {
			console.warn('Failed to load persisted wallet selection:', e);
		}
		return null;
	}

	// Save selection to localStorage
	function persistSelection(source: 'game' | 'external', gameAccountId: string | null) {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ source, gameAccountId }));
		} catch (e) {
			console.warn('Failed to persist wallet selection:', e);
		}
	}

	// State - initialize from persisted or defaults
	const persisted = loadPersistedSelection();
	let selectedSource = $state<'game' | 'external'>(persisted?.source || 'game');
	let selectedGameAccountId = $state<string | null>(persisted?.gameAccountId || activeGameAccountId || null);
	let unlockedAddresses = $state<Set<string>>(new Set());
	let balances = $state<Map<string, number>>(new Map());
	let balancesLoading = $state(false);
	let unlockingAccount = $state<GameAccountInfo | null>(null);
	let dropdownOpen = $state(false);

	// Refresh unlocked status on mount and when accounts change
	$effect(() => {
		if (browser) {
			const stored = getStoredGameAccountAddresses();
			unlockedAddresses = new Set(stored);
		}
	});

	// Fetch balances on mount
	$effect(() => {
		if (browser && gameAccounts.length > 0) {
			fetchBalances();
		}
	});

	// Initialize selected game account - validate persisted selection exists
	$effect(() => {
		if (browser && gameAccounts.length > 0) {
			// If we have a persisted game account ID, verify it still exists
			if (selectedGameAccountId) {
				const exists = gameAccounts.find(a => a.id === selectedGameAccountId);
				if (!exists) {
					// Persisted account no longer exists, fall back to active or first
					const defaultAccount = gameAccounts.find(a => a.id === activeGameAccountId) || gameAccounts[0];
					selectedGameAccountId = defaultAccount.id;
					selectedSource = 'game';
					persistSelection('game', defaultAccount.id);
				}
			} else if (selectedSource === 'game') {
				// No game account selected but source is game, pick default
				const defaultAccount = gameAccounts.find(a => a.id === activeGameAccountId) || gameAccounts[0];
				selectedGameAccountId = defaultAccount.id;
				persistSelection('game', defaultAccount.id);
			}
		}
	});


	// Get selected game account
	const selectedGameAccount = $derived(
		gameAccounts.find(a => a.id === selectedGameAccountId) || null
	);

	// Sort game accounts with active account first
	const sortedGameAccounts = $derived(
		[...gameAccounts].sort((a, b) => {
			if (a.id === activeGameAccountId) return -1;
			if (b.id === activeGameAccountId) return 1;
			return 0;
		})
	);

	// Helpers
	function shortAddress(address: string): string {
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	function isUnlocked(account: GameAccountInfo): boolean {
		return unlockedAddresses.has(account.voiAddress);
	}

	function displayName(account: GameAccountInfo): string {
		return account.nickname || shortAddress(account.voiAddress);
	}

	function getAuthMethodIcon(account: GameAccountInfo): string {
		switch (account.cdpRecoveryMethod) {
			case 'email': return '📧';
			case 'sms': return '📱';
			case 'google': return '🔵';
			case 'mnemonic': return '🔑';
			default: return '🔐';
		}
	}

	async function fetchBalances() {
		balancesLoading = true;
		const newBalances = new Map<string, number>();

		const results = await Promise.all(
			gameAccounts.map(async (account) => {
				try {
					const balance = await fetchVoiBalance(account.voiAddress);
					if (balance) {
						return { address: account.voiAddress, balance: balance.balance };
					}
				} catch (err) {
					console.error('Failed to fetch balance for', account.voiAddress, err);
				}
				return { address: account.voiAddress, balance: 0 };
			})
		);

		for (const result of results) {
			newBalances.set(result.address, result.balance);
		}

		balances = newBalances;
		balancesLoading = false;
	}

	function handleGameAccountClick(account: GameAccountInfo) {
		if (!isUnlocked(account)) {
			unlockingAccount = account;
			return;
		}

		selectedGameAccountId = account.id;
		selectedSource = 'game';
		dropdownOpen = false;
		persistSelection('game', account.id);
		onGameAccountSelect?.(account);
		onSourceChange?.('game', account.voiAddress);
	}

	function handleExternalWalletSelect() {
		if (!houseWallet.isExternalConnected) return;

		selectedSource = 'external';
		selectedGameAccountId = null;
		dropdownOpen = false;
		persistSelection('external', null);
		if (houseWallet.externalWallet?.address) {
			onSourceChange?.('external', houseWallet.externalWallet.address);
		}
	}

	async function handleUnlockSuccess() {
		if (browser) {
			const stored = getStoredGameAccountAddresses();
			unlockedAddresses = new Set(stored);
		}

		if (unlockingAccount) {
			selectedGameAccountId = unlockingAccount.id;
			selectedSource = 'game';
			persistSelection('game', unlockingAccount.id);
			onGameAccountSelect?.(unlockingAccount);
			onSourceChange?.('game', unlockingAccount.voiAddress);
			unlockingAccount = null;
		}
	}

	function handleUnlockClose() {
		unlockingAccount = null;
	}

	function toggleDropdown() {
		dropdownOpen = !dropdownOpen;
	}

	function closeDropdown() {
		dropdownOpen = false;
	}


	// Get display info for current selection
	const currentSelectionDisplay = $derived.by(() => {
		if (selectedSource === 'external' && houseWallet.externalWallet) {
			return {
				icon: '🔗',
				name: 'External Wallet',
				address: shortAddress(houseWallet.externalWallet.address),
				balance: Number(houseWallet.externalBalance),
				isUnlocked: true
			};
		}
		if (selectedGameAccount) {
			return {
				icon: isUnlocked(selectedGameAccount) ? '🔓' : '🔒',
				name: displayName(selectedGameAccount),
				address: selectedGameAccount.nickname ? shortAddress(selectedGameAccount.voiAddress) : null,
				balance: balances.get(selectedGameAccount.voiAddress) || 0,
				isUnlocked: isUnlocked(selectedGameAccount)
			};
		}
		return null;
	});
</script>

<div class="card p-4 md:p-5">
	<h3 class="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">Deposit Wallet</h3>

	<!-- Compact Dropdown Selector -->
	<div class="relative">
		<button class="w-full bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-xl py-3 px-4 flex items-center justify-between cursor-pointer transition-all hover:border-primary-300 dark:hover:border-primary-700 text-left" onclick={toggleDropdown} type="button">
			{#if currentSelectionDisplay}
				<div class="flex items-center gap-3 flex-1 min-w-0">
					<span class="text-xl flex-shrink-0">{currentSelectionDisplay.icon}</span>
					<div class="flex flex-col gap-0.5 min-w-0 flex-1">
						<span class="font-semibold text-neutral-900 dark:text-white text-sm truncate">{currentSelectionDisplay.name}</span>
						{#if currentSelectionDisplay.address}
							<span class="font-mono text-xs text-neutral-500 dark:text-neutral-400">{currentSelectionDisplay.address}</span>
						{/if}
					</div>
					<div class="text-base font-semibold text-success-600 dark:text-success-400 flex-shrink-0">
						{#if balancesLoading}
							<span class="text-neutral-400">...</span>
						{:else}
							{formatCurrency(currentSelectionDisplay.balance)} <span class="text-xs text-success-500/70">VOI</span>
						{/if}
					</div>
				</div>
			{:else}
				<span class="text-neutral-500">Select a wallet</span>
			{/if}
			<svg class="w-5 h-5 text-neutral-400 flex-shrink-0 transition-transform {dropdownOpen ? 'rotate-180' : ''}" viewBox="0 0 20 20" fill="currentColor">
				<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
			</svg>
		</button>

		{#if dropdownOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="fixed inset-0 z-40" onclick={closeDropdown}></div>
			<div class="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg z-50 animate-fade-in overflow-hidden">
				<!-- Game Accounts Section (scrollable if many) -->
				{#if sortedGameAccounts.length > 0}
					<div class="p-2 border-b border-neutral-200 dark:border-neutral-700">
						<div class="text-xs font-semibold text-neutral-400 uppercase tracking-wide px-3 py-1.5">Game Accounts ({sortedGameAccounts.length})</div>
						<div class="max-h-48 overflow-y-auto">
							{#each sortedGameAccounts as account (account.id)}
								{@const unlocked = isUnlocked(account)}
								{@const isSelected = selectedSource === 'game' && selectedGameAccountId === account.id}
								{@const accountBalance = balances.get(account.voiAddress)}

								<button
									type="button"
									onclick={() => handleGameAccountClick(account)}
									class="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-lg text-left transition-colors {isSelected ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'}"
								>
									<span class="text-base flex-shrink-0">{unlocked ? '🔓' : '🔒'}</span>
									<div class="flex flex-col gap-0.5 flex-1 min-w-0">
										<span class="font-medium text-neutral-900 dark:text-white text-sm truncate">{displayName(account)}</span>
										<span class="text-xs text-neutral-500 dark:text-neutral-400">
											{getAuthMethodIcon(account)}
											{#if balancesLoading}
												...
											{:else}
												{formatCurrency(accountBalance || 0)} VOI
											{/if}
										</span>
									</div>
									{#if isSelected}
										<span class="text-primary-500 font-bold flex-shrink-0">✓</span>
									{:else if !unlocked}
										<span class="text-xs font-semibold text-warning-600 dark:text-warning-400 bg-warning-100 dark:bg-warning-900/30 px-2 py-0.5 rounded flex-shrink-0">Unlock</span>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- External Wallet Section -->
				<div class="p-2">
					<div class="text-xs font-semibold text-neutral-400 uppercase tracking-wide px-3 py-1.5">External Wallet</div>
					<div class="flex items-center gap-3 px-2 py-1">
						<div class="flex-1 avm-wallet-container">
							<Web3Wallet
								{algodClient}
								{availableWallets}
								allowWatchAccounts={false}
								{wcProject}
							/>
						</div>
						{#if houseWallet.isExternalConnected && houseWallet.externalWallet}
							<button
								type="button"
								onclick={handleExternalWalletSelect}
								class="px-3 py-2 rounded-lg text-sm font-medium transition-colors {selectedSource === 'external' ? 'bg-primary-100 dark:bg-primary-900/30 border border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400' : 'bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:border-primary-300 dark:hover:border-primary-700'}"
							>
								{selectedSource === 'external' ? '✓ Selected' : 'Use'}
							</button>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>

	{#if houseWallet.error}
		<div class="mt-3 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg py-2.5 px-3.5 text-sm text-error-600 dark:text-error-400 flex items-center justify-between">
			{houseWallet.error}
			<button onclick={() => houseWallet.clearError()} class="text-error-500 text-lg leading-none hover:text-error-700">×</button>
		</div>
	{/if}
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
	/* AVM Wallet Container - Styling for avm-wallet-svelte component */
	.avm-wallet-container :global(.wallet-container > div:first-child) {
		@apply bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg py-2 px-3;
	}

	.avm-wallet-container :global(.wallet-container > div:first-child:hover) {
		@apply bg-neutral-200 dark:bg-neutral-600 border-primary-300 dark:border-primary-700;
	}

	/* Dropdown wallet list box */
	.avm-wallet-container :global(.walletListBox) {
		@apply bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl;
	}

	/* Wallet item rows */
	.avm-wallet-container :global(.wallet-item) {
		@apply text-neutral-900 dark:text-white;
	}

	.avm-wallet-container :global(.wallet-item span) {
		@apply text-neutral-700 dark:text-neutral-200;
	}

	.avm-wallet-container :global(.wallet-item button) {
		@apply text-xs;
	}

	.avm-wallet-container :global(.wallet-item button.truncate) {
		@apply text-neutral-600 dark:text-neutral-300;
	}

	.avm-wallet-container :global(.wallet-item button.truncate:hover) {
		@apply bg-neutral-100 dark:bg-neutral-700;
	}
</style>
