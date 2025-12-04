<script lang="ts">
	/**
	 * AccountsGrid Component
	 *
	 * Horizontal scrollable container of AccountCards.
	 * Single "Add Account" ghost card at the end.
	 * Shows legacy accounts inline below the cards.
	 */
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import AccountCard from './AccountCard.svelte';
	import AddGameAccount from '$lib/components/gameAccounts/AddGameAccount.svelte';
	import UnlockGameAccount from '$lib/components/gameAccounts/UnlockGameAccount.svelte';
	import RemoveAccountModal from '$lib/components/form/RemoveAccountModal.svelte';
	import { getStoredGameAccountAddresses } from '$lib/auth/gameAccountStorage';
	import { fetchAllBalances, formatBalance } from '$lib/voi/balances';
	import type { GameAccountInfo } from '$lib/auth/session';

	interface LegacyAccount {
		chain: string;
		address: string;
		isPrimary: boolean;
	}

	interface Props {
		gameAccounts: GameAccountInfo[];
		activeAccountId?: string;
		primaryEmail?: string;
		legacyAccounts?: LegacyAccount[];
		onAccountChange?: () => void;
	}

	let {
		gameAccounts = [],
		activeAccountId,
		primaryEmail = '',
		legacyAccounts = [],
		onAccountChange
	}: Props = $props();

	// State
	let unlockedAddresses = $state<Set<string>>(new Set());
	let status = $state<{ type: 'success' | 'error'; message: string } | null>(null);
	let balances = $state<Map<string, string>>(new Map()); // voiAddress -> USDC balance

	// Modal state
	let showAddModal = $state(false);
	let unlockingAccount = $state<GameAccountInfo | null>(null);
	let removingAccount = $state<{ id: string; address: string } | null>(null);

	// Keep active account at the front
	const orderedGameAccounts = $derived.by(() => {
		if (!gameAccounts || gameAccounts.length === 0) return gameAccounts || [];

		const indexed = gameAccounts.map((acc, idx) => ({ acc, idx }));
		indexed.sort((a, b) => {
			const aActive = a.acc.id === activeAccountId ? 1 : 0;
			const bActive = b.acc.id === activeAccountId ? 1 : 0;
			if (aActive !== bActive) return bActive - aActive;
			return a.idx - b.idx;
		});
		return indexed.map(({ acc }) => acc);
	});

	// Filter legacy accounts to exclude those already in game_accounts
	const filteredLegacyAccounts = $derived.by(() => {
		const gameAddresses = new Set(gameAccounts.map((a) => a.voiAddress));
		return legacyAccounts.filter((leg) => leg.chain === 'voi' && !gameAddresses.has(leg.address));
	});

	// Refresh unlocked status
	$effect(() => {
		if (browser) {
			const stored = getStoredGameAccountAddresses();
			unlockedAddresses = new Set(stored);
		}
	});

	// Fetch USDC balances for all accounts
	$effect(() => {
		if (browser && gameAccounts.length > 0) {
			fetchBalances();
		}
	});

	async function fetchBalances() {
		const newBalances = new Map<string, string>();

		const results = await Promise.all(
			gameAccounts.map(async (account) => {
				try {
					const data = await fetchAllBalances(account.voiAddress);
					if (data.usdc) {
						return {
							address: account.voiAddress,
							balance: formatBalance(data.usdc.balance, data.usdc.decimals)
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
	}

	function isUnlocked(account: GameAccountInfo): boolean {
		return unlockedAddresses.has(account.voiAddress);
	}

	function showStatus(type: 'success' | 'error', message: string) {
		status = { type, message };
		setTimeout(() => (status = null), 3000);
	}

	function shortAddress(address: string): string {
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	// Handle card click - unlock if needed, then switch
	async function handleCardClick(account: GameAccountInfo) {
		if (account.id === activeAccountId) return; // Already active

		if (!isUnlocked(account)) {
			// Need to unlock first
			unlockingAccount = account;
			return;
		}

		// Already unlocked, switch directly
		await switchToAccount(account);
	}

	async function switchToAccount(account: GameAccountInfo) {
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

			showStatus('success', 'Switched account');
			await invalidateAll();
			onAccountChange?.();
		} catch (err) {
			showStatus('error', err instanceof Error ? err.message : 'Failed to switch account');
		}
	}

	async function handleUnlockSuccess() {
		if (browser) {
			const stored = getStoredGameAccountAddresses();
			unlockedAddresses = new Set(stored);
		}

		// After unlocking, switch to that account
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

	async function handleRemove(account: GameAccountInfo) {
		removingAccount = { id: account.id, address: account.voiAddress };
	}

	async function handleRemoveConfirm() {
		if (!removingAccount) return;

		try {
			const response = await fetch('/api/game-accounts', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accountId: removingAccount.id })
			});

			const result = await response.json();

			if (!response.ok || !result.ok) {
				throw new Error(result.error || 'Failed to remove account');
			}

			showStatus('success', 'Account removed');
			removingAccount = null;
			await invalidateAll();
			onAccountChange?.();
		} catch (err) {
			showStatus('error', err instanceof Error ? err.message : 'Failed to remove account');
		}
	}

	function handleAddSuccess() {
		showAddModal = false;
		showStatus('success', 'Account added!');
		if (browser) {
			const stored = getStoredGameAccountAddresses();
			unlockedAddresses = new Set(stored);
		}
		invalidateAll();
		onAccountChange?.();
	}

	function handleAddError(message: string) {
		showAddModal = false;
		showStatus('error', message);
	}

	// Open add modal with mnemonic pre-selected for importing legacy accounts
	function handleImportLegacy() {
		showAddModal = true;
	}
</script>

<Card>
	<CardHeader>
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<h2 class="text-lg font-semibold text-neutral-950 dark:text-white">Your Accounts</h2>
				<span class="text-sm text-neutral-500">({gameAccounts.length})</span>
			</div>
		</div>
	</CardHeader>

	<CardContent>
		<!-- Status message -->
		{#if status}
			<div
				class="mb-4 rounded-lg p-3 text-center text-sm font-medium {status.type === 'success'
					? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300'
					: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-300'}"
			>
				{status.message}
			</div>
		{/if}

		{#if gameAccounts.length === 0}
			<!-- Empty state -->
			<div class="py-8 text-center">
				<div class="mb-4 text-4xl">🎮</div>
				<h3 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
					No Gaming Accounts Yet
				</h3>
				<p class="mt-2 text-sm text-neutral-600 dark:text-neutral-400 max-w-sm mx-auto">
					Add a gaming account to start playing. Choose a secure CDP wallet or import an existing
					mnemonic.
				</p>
				<Button variant="primary" size="md" onclick={() => (showAddModal = true)} class="mt-4">
					Add Your First Account
				</Button>
			</div>
		{:else}
			<!-- Horizontal scrolling account cards -->
			<div class="relative -mx-2">
				<div
					class="flex gap-4 overflow-x-auto overflow-y-visible pt-3 pb-4 px-2 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-700"
				>
					{#each orderedGameAccounts as account (account.id)}
						<div class="snap-start">
							<AccountCard
								{account}
								isActive={account.id === activeAccountId}
								isUnlocked={isUnlocked(account)}
								balance={balances.get(account.voiAddress)}
								onCardClick={() => handleCardClick(account)}
								onRemove={() => handleRemove(account)}
							/>
						</div>
					{/each}

					<!-- Add Account Card (ghost card) -->
					<button
						onclick={() => (showAddModal = true)}
						class="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 min-w-[180px] max-w-[220px] flex-shrink-0 hover:border-primary-400 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/20 transition-all group snap-start"
					>
						<div
							class="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-2 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30 transition-colors"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								class="text-neutral-400 group-hover:text-primary-500 transition-colors"
							>
								<path d="M12 5v14M5 12h14"></path>
							</svg>
						</div>
						<span
							class="text-sm font-medium text-neutral-500 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
						>
							Add Account
						</span>
					</button>
				</div>
			</div>

			<!-- Legacy accounts section -->
			{#if filteredLegacyAccounts.length > 0}
				<div class="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
					<div class="flex items-center justify-between mb-3">
						<div class="flex items-center gap-2">
							<span class="text-sm font-medium text-neutral-600 dark:text-neutral-400">
								Legacy Accounts ({filteredLegacyAccounts.length})
							</span>
							<span class="text-xs text-neutral-500">Re-import to use</span>
						</div>
					</div>

					<div class="space-y-2">
						{#each filteredLegacyAccounts as legacy (legacy.address)}
							<div
								class="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700"
							>
								<div class="flex items-center gap-3">
									<span class="text-lg opacity-50">👁️</span>
									<div>
										<a
											href="https://block.voi.network/explorer/account/{legacy.address}"
											target="_blank"
											rel="noopener noreferrer"
											class="font-mono text-sm text-neutral-600 hover:text-primary-600 dark:text-neutral-400 dark:hover:text-primary-400"
										>
											{shortAddress(legacy.address)}
										</a>
										<span
											class="ml-2 text-xs px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-500"
										>
											View Only
										</span>
									</div>
								</div>
								<Button variant="secondary" size="sm" onclick={handleImportLegacy}>
									Import
								</Button>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</CardContent>
</Card>

<!-- Modals -->
<AddGameAccount
	open={showAddModal}
	defaultEmail={primaryEmail}
	onSuccess={handleAddSuccess}
	onError={handleAddError}
	onClose={() => (showAddModal = false)}
/>

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

{#if removingAccount}
	<RemoveAccountModal
		isOpen={true}
		address={removingAccount.address}
		onClose={() => (removingAccount = null)}
		onConfirm={handleRemoveConfirm}
	/>
{/if}

<style>
	/* Custom scrollbar for horizontal scroll */
	.scrollbar-thin {
		scrollbar-width: thin;
	}
	.scrollbar-thin::-webkit-scrollbar {
		height: 6px;
	}
	.scrollbar-thin::-webkit-scrollbar-track {
		background: transparent;
	}
	.scrollbar-thin::-webkit-scrollbar-thumb {
		background-color: rgba(0, 0, 0, 0.2);
		border-radius: 3px;
	}
	:global(.dark) .scrollbar-thin::-webkit-scrollbar-thumb {
		background-color: rgba(255, 255, 255, 0.2);
	}
</style>
