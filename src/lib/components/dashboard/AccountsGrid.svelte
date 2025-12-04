<script lang="ts">
	/**
	 * AccountsGrid Component
	 *
	 * Displays user's game accounts in a compact card format.
	 * Cards are NOT clickable to switch - switching is done via navbar.
	 * Shows add/remove actions and legacy accounts with import option.
	 */
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import AddGameAccount from '$lib/components/gameAccounts/AddGameAccount.svelte';
	import AccountActionModal from '$lib/components/form/AccountActionModal.svelte';
	import { fetchAllBalances, formatBalance } from '$lib/voi/balances';
	import { removeGameAccountKeys } from '$lib/auth/gameAccountStorage';
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
	let status = $state<{ type: 'success' | 'error'; message: string } | null>(null);
	let balances = $state<Map<string, string>>(new Map()); // voiAddress -> USDC balance

	// Modal state
	let showAddModal = $state(false);
	let managingAccount = $state<{
		id: string;
		address: string;
		nickname: string | null;
		recoveryMethod: 'email' | 'sms' | 'google' | 'mnemonic' | null;
		recoveryHint: string | null;
	} | null>(null);

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

	function showStatus(type: 'success' | 'error', message: string) {
		status = { type, message };
		setTimeout(() => (status = null), 3000);
	}

	function shortAddress(address: string): string {
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	function getAuthMethodIcon(method: string | null): string {
		switch (method) {
			case 'email':
				return '📧';
			case 'google':
				return '🔵';
			case 'sms':
				return '📱';
			case 'mnemonic':
				return '🔑';
			default:
				return '🔐';
		}
	}

	function handleManageAccount(account: GameAccountInfo) {
		managingAccount = {
			id: account.id,
			address: account.voiAddress,
			nickname: account.nickname,
			recoveryMethod: account.cdpRecoveryMethod as 'email' | 'sms' | 'google' | 'mnemonic' | null,
			recoveryHint: account.cdpRecoveryHint
		};
	}

	async function handleLockConfirm() {
		if (!managingAccount) return;

		try {
			await removeGameAccountKeys(managingAccount.address);
			showStatus('success', 'Account locked');
			managingAccount = null;
			await invalidateAll();
			onAccountChange?.();
		} catch (err) {
			showStatus('error', err instanceof Error ? err.message : 'Failed to lock account');
		}
	}

	async function handleDisconnectConfirm() {
		if (!managingAccount) return;

		try {
			const response = await fetch('/api/game-accounts', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accountId: managingAccount.id })
			});

			const result = await response.json();

			if (!response.ok || !result.ok) {
				throw new Error(result.error || 'Failed to remove account');
			}

			// Also remove local keys if they exist
			try {
				await removeGameAccountKeys(managingAccount.address);
			} catch {
				// Ignore errors - keys may already be removed
			}

			showStatus('success', 'Account removed');
			managingAccount = null;
			await invalidateAll();
			onAccountChange?.();
		} catch (err) {
			showStatus('error', err instanceof Error ? err.message : 'Failed to remove account');
		}
	}

	function handleAddSuccess() {
		showAddModal = false;
		showStatus('success', 'Account added!');
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
			<Button variant="secondary" size="sm" onclick={() => (showAddModal = true)}>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-1">
					<path d="M12 5v14M5 12h14"></path>
				</svg>
				Add Account
			</Button>
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
			<!-- Account list -->
			<div class="space-y-2">
				{#each orderedGameAccounts as account (account.id)}
					{@const isActive = account.id === activeAccountId}
					{@const balance = balances.get(account.voiAddress) || '0.00'}
					<div class="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700">
						<!-- Auth icon -->
						<span class="text-lg flex-shrink-0">{getAuthMethodIcon(account.cdpRecoveryMethod)}</span>

						<!-- Account info -->
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								{#if account.nickname}
									<span class="font-medium text-neutral-900 dark:text-white">{account.nickname}</span>
								{/if}
								{#if isActive}
									<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 text-[10px] font-medium">
										<span class="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse"></span>
										Active
									</span>
								{/if}
							</div>
							<div class="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
								<span class="font-mono">{shortAddress(account.voiAddress)}</span>
								<button
									onclick={() => {
										navigator.clipboard.writeText(account.voiAddress);
										showStatus('success', 'Address copied!');
									}}
									class="hover:text-primary-500 transition-colors"
									title="Copy address"
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
										<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
									</svg>
								</button>
								<span class="text-neutral-300 dark:text-neutral-600">•</span>
								<span class="capitalize">{account.cdpRecoveryMethod || 'Unknown'}</span>
								{#if account.cdpRecoveryHint}
									<span class="text-neutral-400 dark:text-neutral-500 truncate">{account.cdpRecoveryHint}</span>
								{/if}
							</div>
						</div>

						<!-- Balance -->
						<div class="text-right flex-shrink-0">
							<div class="font-mono text-sm font-medium text-neutral-800 dark:text-neutral-200">
								${balance}
							</div>
							<div class="text-xs text-neutral-500">USDC</div>
						</div>

						<!-- Remove button -->
						<button
							onclick={() => handleManageAccount(account)}
							class="w-8 h-8 flex items-center justify-center rounded-md text-neutral-400 hover:text-error-500 hover:bg-error-100 dark:hover:bg-error-900/30 transition-colors flex-shrink-0"
							title="Remove account"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M18 6L6 18M6 6l12 12"></path>
							</svg>
						</button>
					</div>
				{/each}
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

{#if managingAccount}
	<AccountActionModal
		isOpen={true}
		address={managingAccount.address}
		nickname={managingAccount.nickname}
		recoveryMethod={managingAccount.recoveryMethod}
		recoveryHint={managingAccount.recoveryHint}
		onClose={() => (managingAccount = null)}
		onLock={handleLockConfirm}
		onDisconnect={handleDisconnectConfirm}
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
