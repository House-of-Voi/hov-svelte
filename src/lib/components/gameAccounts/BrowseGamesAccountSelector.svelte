<script lang="ts">
	/**
	 * BrowseGamesAccountSelector Component
	 *
	 * Account selector for the Browse Games page.
	 * Shows a compact button with the active account that opens a modal
	 * displaying all game accounts with VOI balances and lock status.
	 */
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import UnlockGameAccount from './UnlockGameAccount.svelte';
	import { getStoredGameAccountAddresses } from '$lib/auth/gameAccountStorage';
	import type { GameAccountInfo } from '$lib/auth/session';
	import { fetchVoiBalance, formatBalance } from '$lib/voi/balances';

	interface Props {
		/** All game accounts from the server */
		gameAccounts: GameAccountInfo[];
		/** ID of the currently active account */
		activeAccountId?: string;
		/** Callback when account changes */
		onAccountChange?: () => void;
	}

	let { gameAccounts, activeAccountId, onAccountChange }: Props = $props();

	// State
	let isModalOpen = $state(false);
	let unlockedAddresses = $state<Set<string>>(new Set());
	let balances = $state<Map<string, string>>(new Map());
	let balancesLoading = $state(false);
	let unlockingAccount = $state<GameAccountInfo | null>(null);
	let isSwitching = $state(false);

	// Refresh unlocked status on mount and when accounts change
	$effect(() => {
		if (browser) {
			const stored = getStoredGameAccountAddresses();
			unlockedAddresses = new Set(stored);
		}
	});

	// Fetch balances when modal opens
	$effect(() => {
		if (browser && isModalOpen && gameAccounts.length > 0) {
			fetchBalances();
		}
	});

	// Active account
	const activeAccount = $derived(gameAccounts.find((a) => a.id === activeAccountId) || gameAccounts[0]);

	// Check if any account is unlocked
	const hasUnlockedAccount = $derived(
		gameAccounts.some((a) => unlockedAddresses.has(a.voiAddress))
	);

	// Check if active account is unlocked
	const isActiveUnlocked = $derived(
		activeAccount ? unlockedAddresses.has(activeAccount.voiAddress) : false
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

	function getAuthMethodDisplay(account: GameAccountInfo): { icon: string; label: string } {
		const method = account.cdpRecoveryMethod;
		switch (method) {
			case 'email':
				return { icon: '📧', label: 'Email' };
			case 'sms':
				return { icon: '📱', label: 'SMS' };
			case 'google':
				return { icon: '🔵', label: 'Google' };
			case 'mnemonic':
				return { icon: '🔑', label: 'Mnemonic' };
			default:
				return { icon: '🔐', label: 'CDP' };
		}
	}

	async function fetchBalances() {
		balancesLoading = true;
		const newBalances = new Map<string, string>();

		const results = await Promise.all(
			gameAccounts.map(async (account) => {
				try {
					const balance = await fetchVoiBalance(account.voiAddress);
					if (balance) {
						return {
							address: account.voiAddress,
							balance: formatBalance(balance.balance, balance.decimals)
						};
					}
				} catch (err) {
					console.error('Failed to fetch balance for', account.voiAddress, err);
				}
				return { address: account.voiAddress, balance: '0.00' };
			})
		);

		for (const result of results) {
			newBalances.set(result.address, result.balance);
		}

		balances = newBalances;
		balancesLoading = false;
	}

	function openModal() {
		isModalOpen = true;
	}

	function closeModal() {
		isModalOpen = false;
	}

	async function selectAccount(account: GameAccountInfo) {
		if (account.id === activeAccountId) {
			closeModal();
			return;
		}

		// Check if account is unlocked
		if (!isUnlocked(account)) {
			unlockingAccount = account;
			return;
		}

		await switchToAccount(account);
	}

	async function switchToAccount(account: GameAccountInfo) {
		isSwitching = true;

		try {
			const response = await fetch('/api/game-accounts/switch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accountId: account.id })
			});

			const result = await response.json();

			if (!response.ok || !result.ok) {
				throw new Error(result.error || 'Failed to switch account');
			}

			await invalidateAll();
			onAccountChange?.();
			closeModal();
		} catch (error) {
			console.error('Switch account error:', error);
		} finally {
			isSwitching = false;
		}
	}

	async function handleUnlockSuccess() {
		// Refresh unlocked addresses
		if (browser) {
			const stored = getStoredGameAccountAddresses();
			unlockedAddresses = new Set(stored);
		}

		// Switch to the unlocked account
		if (unlockingAccount) {
			await switchToAccount(unlockingAccount);
			unlockingAccount = null;
		}

		await invalidateAll();
		onAccountChange?.();
	}

	function handleUnlockClose() {
		unlockingAccount = null;
	}
</script>

<!-- Trigger Button -->
<button
	onclick={openModal}
	class="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors border border-neutral-200 dark:border-neutral-700"
>
	{#if gameAccounts.length === 0}
		<span class="text-sm text-neutral-500">No Accounts</span>
	{:else if !hasUnlockedAccount}
		<span class="text-lg">🔒</span>
		<span class="text-sm font-medium text-neutral-800 dark:text-neutral-200">Select Account</span>
	{:else if activeAccount}
		<span class="text-lg">{isActiveUnlocked ? '🔓' : '🔒'}</span>
		<span class="text-sm font-medium text-neutral-800 dark:text-neutral-200 max-w-[120px] truncate">
			{displayName(activeAccount)}
		</span>
	{/if}

	<!-- Dropdown Arrow -->
	<svg class="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
	</svg>
</button>

<!-- Account Selection Modal -->
<Modal isOpen={isModalOpen} onClose={closeModal} title="Select Game Account">
	<div class="space-y-4">
		{#if gameAccounts.length === 0}
			<div class="py-8 text-center">
				<div class="mb-4 text-5xl">🎮</div>
				<h3 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
					No Gaming Accounts
				</h3>
				<p class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
					Visit your profile to add a gaming account.
				</p>
				<a href="/app" class="inline-block mt-4">
					<Button variant="primary" size="md">Go to Profile</Button>
				</a>
			</div>
		{:else}
			<div class="space-y-3 max-h-[400px] overflow-y-auto">
				{#each gameAccounts as account (account.id)}
					{@const unlocked = isUnlocked(account)}
					{@const isActive = account.id === activeAccountId}
					{@const authMethod = getAuthMethodDisplay(account)}
					{@const balance = balances.get(account.voiAddress)}

					<button
						onclick={() => selectAccount(account)}
						disabled={isSwitching}
						class="w-full rounded-lg border p-4 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50
							{isActive
							? 'border-warning-300 bg-warning-50/50 dark:border-warning-700 dark:bg-warning-900/20'
							: 'border-neutral-200 dark:border-neutral-700'}"
					>
						<!-- Top row: Lock + Address + Balance -->
						<div class="flex items-center justify-between gap-3">
							<div class="flex items-center gap-3 min-w-0">
								<!-- Lock Status -->
								<span class="text-xl flex-shrink-0" title={unlocked ? 'Unlocked' : 'Locked'}>
									{unlocked ? '🔓' : '🔒'}
								</span>

								<!-- Account Info -->
								<div class="min-w-0">
									<div class="font-medium text-neutral-800 dark:text-neutral-200 truncate">
										{displayName(account)}
									</div>
									{#if account.nickname}
										<div class="text-xs text-neutral-500 font-mono">
											{shortAddress(account.voiAddress)}
										</div>
									{/if}
								</div>
							</div>

							<!-- Balance -->
							<div class="text-right flex-shrink-0">
								<span class="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
									{#if balancesLoading}
										<span class="text-neutral-400">...</span>
									{:else if balance !== undefined}
										{balance}
									{:else}
										0.00
									{/if}
								</span>
								<span class="text-xs text-neutral-500 ml-1">VOI</span>
							</div>
						</div>

						<!-- Bottom row: Auth method + Status -->
						<div class="mt-2 flex items-center justify-between">
							<div class="flex items-center gap-2">
								<!-- Auth Method -->
								<span class="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400">
									<span>{authMethod.icon}</span>
									<span>{authMethod.label}</span>
								</span>
							</div>

							<!-- Status/Action -->
							<div class="flex items-center gap-2">
								{#if isActive}
									<span class="inline-flex items-center gap-1 rounded-full bg-success-100 px-2 py-0.5 text-xs font-medium text-success-700 dark:bg-success-900/30 dark:text-success-300">
										<span class="h-1.5 w-1.5 rounded-full bg-success-500"></span>
										Active
									</span>
								{:else if !unlocked}
									<span class="text-xs font-medium text-warning-600 dark:text-warning-400">
										Unlock to select
									</span>
								{:else}
									<span class="text-xs text-neutral-500">Click to select</span>
								{/if}
							</div>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</Modal>

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
