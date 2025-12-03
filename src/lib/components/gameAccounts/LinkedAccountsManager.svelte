<script lang="ts">
	/**
	 * LinkedAccountsManager Component
	 *
	 * Unified accounts management UI showing all game accounts (CDP + mnemonic).
	 * Features:
	 * - List all accounts with type badges (CDP/Mnemonic) and status (Unlocked/Locked/Active)
	 * - Inline actions: Copy address, Unlock, Remove, Set as Active
	 * - Add new accounts via CDP or mnemonic import
	 * - Legacy accounts section (view-only accounts awaiting upgrade)
	 */
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import UnlockGameAccount from './UnlockGameAccount.svelte';
	import AddGameAccount from './AddGameAccount.svelte';
	import VoiAccountImportModal from '$lib/components/form/VoiAccountImportModal.svelte';
	import RemoveAccountModal from '$lib/components/form/RemoveAccountModal.svelte';
	import { getStoredGameAccountAddresses } from '$lib/auth/gameAccountStorage';
	import type { GameAccountInfo, CdpRecoveryMethod } from '$lib/auth/session';
	import { fetchVoiBalance, formatBalance } from '$lib/voi/balances';

	interface LegacyAccount {
		chain: string;
		address: string;
		isPrimary: boolean;
	}

	interface Props {
		/** All game accounts from the server */
		gameAccounts: GameAccountInfo[];
		/** ID of the currently active account */
		activeAccountId?: string;
		/** User's primary email (for CDP activation) */
		primaryEmail?: string;
		/** Legacy connected accounts (view-only, can be upgraded by re-import) */
		legacyAccounts?: LegacyAccount[];
		/** Callback when accounts change (triggers data refresh) */
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
	let balances = $state<Map<string, string>>(new Map()); // voiAddress -> formatted balance

	// Modal state
	let showAddDropdown = $state(false);
	let showAddCdpModal = $state(false);
	let showImportMnemonicModal = $state(false);
	let unlockingAccount = $state<GameAccountInfo | null>(null);
	let removingAccount = $state<{ id: string; address: string } | null>(null);
	let removingLegacyAccount = $state<{ address: string } | null>(null);

	// Keep active account at the top while preserving original order for others
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

	// Refresh unlocked status
	$effect(() => {
		if (browser) {
			const stored = getStoredGameAccountAddresses();
			unlockedAddresses = new Set(stored);
		}
	});

	// Fetch balances for all accounts
	$effect(() => {
		if (browser && gameAccounts.length > 0) {
			fetchBalances();
		}
	});

	async function fetchBalances() {
		const newBalances = new Map<string, string>();

		// Fetch all balances in parallel
		const results = await Promise.all(
			gameAccounts.map(async (account) => {
				try {
					const balance = await fetchVoiBalance(account.voiAddress);
					if (balance) {
						return { address: account.voiAddress, balance: formatBalance(balance.balance, balance.decimals) };
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

	// Filter legacy accounts to exclude those already in game_accounts
	const filteredLegacyAccounts = $derived(() => {
		const gameAddresses = new Set(gameAccounts.map((a) => a.voiAddress));
		return legacyAccounts.filter(
			(leg) => leg.chain === 'voi' && !gameAddresses.has(leg.address)
		);
	});

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

	function getAuthMethodDisplay(account: GameAccountInfo): { icon: string; label: string; hint: string | null } {
		const method = account.cdpRecoveryMethod;
		const hint = account.cdpRecoveryHint;

		switch (method) {
			case 'email':
				return { icon: '📧', label: 'Email', hint };
			case 'sms':
				return { icon: '📱', label: 'SMS', hint };
			case 'google':
				return { icon: '🔵', label: 'Google', hint };
			case 'mnemonic':
				return { icon: '🔑', label: 'Mnemonic', hint: null };
			default:
				return { icon: '🔐', label: 'CDP', hint };
		}
	}

	function showStatus(type: 'success' | 'error', message: string) {
		status = { type, message };
		setTimeout(() => (status = null), 3000);
	}

	// Actions
	function copyAddress(address: string) {
		navigator.clipboard.writeText(address);
		showStatus('success', 'Address copied!');
	}

	async function handleSetActive(account: GameAccountInfo) {
		if (!isUnlocked(account)) {
			unlockingAccount = account;
			return;
		}

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

			showStatus('success', 'Switched to ' + displayName(account));
			await invalidateAll();
			onAccountChange?.();
		} catch (err) {
			showStatus('error', err instanceof Error ? err.message : 'Failed to switch account');
		}
	}

	async function handleUnlockSuccess() {
		// Refresh unlocked addresses
		if (browser) {
			const stored = getStoredGameAccountAddresses();
			unlockedAddresses = new Set(stored);
		}

		// If we were unlocking to set active, complete that
		if (unlockingAccount) {
			await handleSetActive(unlockingAccount);
			unlockingAccount = null;
		}

		// Refresh server-derived data so the account shows as unlocked without manual reload
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
		showAddCdpModal = false;
		showImportMnemonicModal = false;
		showStatus('success', 'Account added successfully!');
		// Refresh unlocked addresses
		if (browser) {
			const stored = getStoredGameAccountAddresses();
			unlockedAddresses = new Set(stored);
		}
		invalidateAll();
		onAccountChange?.();
	}

	function handleAddError(message: string) {
		// Close the modal and show the error in the main UI
		showAddCdpModal = false;
		showStatus('error', message);
	}

	function handleImportLinked(address: string) {
		showImportMnemonicModal = false;
		showStatus('success', 'Account imported successfully!');
		// Refresh unlocked addresses
		if (browser) {
			const stored = getStoredGameAccountAddresses();
			unlockedAddresses = new Set(stored);
		}
		invalidateAll();
		onAccountChange?.();
	}

	async function handleRemoveLegacyConfirm() {
		if (!removingLegacyAccount) return;

		try {
			const response = await fetch('/api/profile/accounts', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					chain: 'voi',
					address: removingLegacyAccount.address
				})
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to remove account');
			}

			showStatus('success', 'Legacy account removed');
			removingLegacyAccount = null;
			await invalidateAll();
			onAccountChange?.();
		} catch (err) {
			showStatus('error', err instanceof Error ? err.message : 'Failed to remove account');
		}
	}

	// Close dropdown when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.add-account-dropdown')) {
			showAddDropdown = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<Card>
	<CardHeader>
		<div class="flex items-center justify-between">
			<h2 class="text-xl font-semibold text-neutral-950 dark:text-white">Your Accounts</h2>

			<!-- Add Account Dropdown -->
			<div class="add-account-dropdown relative">
				<Button
					variant="primary"
					size="sm"
					onclick={() => (showAddDropdown = !showAddDropdown)}
					class="flex items-center gap-2"
				>
					<span>Add Account</span>
					<svg
						class="h-4 w-4 transition-transform {showAddDropdown ? 'rotate-180' : ''}"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</Button>

				{#if showAddDropdown}
					<div
						class="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
					>
						<button
							onclick={() => {
								showAddDropdown = false;
								showAddCdpModal = true;
							}}
							class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800"
						>
							<span class="text-lg">🔐</span>
							<div>
								<p class="text-sm font-medium text-neutral-800 dark:text-neutral-200">
									Via Email/SMS/Google
								</p>
								<p class="text-xs text-neutral-500">CDP embedded wallet</p>
							</div>
						</button>
						<button
							onclick={() => {
								showAddDropdown = false;
								showImportMnemonicModal = true;
							}}
							class="flex w-full items-center gap-3 border-t border-neutral-200 px-4 py-3 text-left transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
						>
							<span class="text-lg">🔑</span>
							<div>
								<p class="text-sm font-medium text-neutral-800 dark:text-neutral-200">
									Import Mnemonic
								</p>
								<p class="text-xs text-neutral-500">25-word recovery phrase</p>
							</div>
						</button>
					</div>
				{/if}
			</div>
		</div>
	</CardHeader>

	<CardContent>
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
			<div class="py-8 text-center">
				<div class="mb-4 text-5xl">🎮</div>
				<h3 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
					No Gaming Accounts Yet
				</h3>
				<p class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
					Add a gaming account to start playing. Choose between a secure CDP wallet or import an
					existing mnemonic.
				</p>
			</div>
		{:else}
			<div class="space-y-3">
				{#each orderedGameAccounts as account (account.id)}
					{@const unlocked = isUnlocked(account)}
					{@const isActive = account.id === activeAccountId}
					{@const authMethod = getAuthMethodDisplay(account)}
					{@const balance = balances.get(account.voiAddress)}
					<div
						class="rounded-lg border p-4 transition-colors
							{isActive
							? 'border-warning-300 bg-warning-50/50 dark:border-warning-700 dark:bg-warning-900/20'
							: 'border-neutral-200 dark:border-neutral-800'}"
					>
						<!-- Top row: Lock + Address + Balance + Actions -->
						<div class="flex items-center justify-between gap-3">
							<div class="flex items-center gap-3 min-w-0">
								<!-- Lock Status -->
								<span class="text-xl flex-shrink-0" title={unlocked ? 'Unlocked' : 'Locked'}>
									{unlocked ? '🔓' : '🔒'}
								</span>

								<!-- Address -->
								<a
									href="https://block.voi.network/explorer/account/{account.voiAddress}"
									target="_blank"
									rel="noopener noreferrer"
									class="font-mono text-sm font-medium text-neutral-800 hover:text-primary-600 dark:text-neutral-200 dark:hover:text-primary-400"
								>
									{displayName(account)}
								</a>

								{#if account.nickname}
									<span class="text-xs text-neutral-500">
										({shortAddress(account.voiAddress)})
									</span>
								{/if}
							</div>

							<!-- Balance + Actions -->
							<div class="flex items-center gap-4">
								<!-- Balance -->
								<span class="text-sm font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
									{#if balance !== undefined}
										{balance} <span class="text-neutral-500 font-normal">VOI</span>
									{:else}
										<span class="text-neutral-400">...</span>
									{/if}
								</span>

								<!-- Actions -->
								<div class="flex items-center gap-1">
									<!-- Copy -->
									<button
										onclick={() => copyAddress(account.voiAddress)}
										title="Copy address"
										class="rounded p-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											class="text-neutral-500"
										>
											<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
											<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
										</svg>
									</button>

									<!-- Unlock / Set Active -->
									{#if !unlocked}
										<Button
											variant="secondary"
											size="sm"
											onclick={() => (unlockingAccount = account)}
										>
											Unlock
										</Button>
									{:else if !isActive}
										<Button variant="secondary" size="sm" onclick={() => handleSetActive(account)}>
											Set Active
										</Button>
									{/if}

									<!-- Remove -->
									<button
										onclick={() => handleRemove(account)}
										title="Remove account"
										class="rounded p-2 text-error-500 transition-colors hover:bg-error-50 dark:hover:bg-error-900/20"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<path d="M3 6h18"></path>
											<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
											<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
										</svg>
									</button>
								</div>
							</div>
						</div>

						<!-- Bottom row: Auth method + Status badges -->
						<div class="mt-2 ml-9 flex flex-wrap items-center gap-2">
							<!-- Auth Method -->
							<span
								class="inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400"
								title={authMethod.hint || authMethod.label}
							>
								<span>{authMethod.icon}</span>
								<span>{authMethod.label}</span>
								{#if authMethod.hint}
									<span class="text-neutral-500">({authMethod.hint})</span>
								{/if}
							</span>

							<span class="text-neutral-300 dark:text-neutral-700">|</span>

							<!-- Status Badges -->
							{#if isActive}
								<span
									class="inline-flex items-center gap-1 rounded-full bg-success-100 px-2 py-0.5 text-xs font-medium text-success-700 dark:bg-success-900/30 dark:text-success-300"
								>
									<span class="h-1.5 w-1.5 rounded-full bg-success-500"></span>
									Active
								</span>
							{/if}

							{#if !unlocked}
								<span
									class="inline-flex items-center rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
								>
									Locked
								</span>
							{/if}

							{#if !isActive && unlocked}
								<span class="text-xs text-neutral-400 dark:text-neutral-500">Ready</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Legacy Accounts Section -->
		{#if filteredLegacyAccounts().length > 0}
			<div class="mt-6 border-t border-neutral-200 pt-6 dark:border-neutral-800">
				<h3 class="mb-3 text-sm font-semibold text-neutral-600 dark:text-neutral-400">
					Legacy Accounts (View Only)
				</h3>
				<p class="mb-4 text-xs text-neutral-500">
					These accounts were connected before. Re-import the mnemonic to enable gameplay.
				</p>
				<div class="space-y-2">
					{#each filteredLegacyAccounts() as legacy}
						<div
							class="flex items-center justify-between gap-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50"
						>
							<div class="flex items-center gap-2">
								<span class="text-lg opacity-50">👁️</span>
								<a
									href="https://block.voi.network/explorer/account/{legacy.address}"
									target="_blank"
									rel="noopener noreferrer"
									class="font-mono text-sm text-neutral-600 hover:text-primary-600 dark:text-neutral-400 dark:hover:text-primary-400"
								>
									{shortAddress(legacy.address)}
								</a>
								<span
									class="inline-flex items-center rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-medium text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
								>
									View Only
								</span>
							</div>
							<div class="flex items-center gap-2">
								<span class="text-xs text-neutral-500 dark:text-neutral-400">
									Import to Unlock
								</span>
								<button
									onclick={() => (removingLegacyAccount = { address: legacy.address })}
									title="Remove legacy account"
									class="rounded p-2 text-error-500 transition-colors hover:bg-error-50 dark:hover:bg-error-900/20"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<path d="M3 6h18"></path>
										<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
										<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
									</svg>
								</button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</CardContent>
</Card>

<!-- Add CDP Account Modal -->
<AddGameAccount
	open={showAddCdpModal}
	defaultEmail={primaryEmail}
	onSuccess={handleAddSuccess}
	onError={handleAddError}
	onClose={() => (showAddCdpModal = false)}
/>

<!-- Import Mnemonic Modal -->
<VoiAccountImportModal
	isOpen={showImportMnemonicModal}
	onClose={() => (showImportMnemonicModal = false)}
	onLinked={handleImportLinked}
/>

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

<!-- Remove Account Modal -->
{#if removingAccount}
	<RemoveAccountModal
		isOpen={true}
		address={removingAccount.address}
		onClose={() => (removingAccount = null)}
		onConfirm={handleRemoveConfirm}
	/>
{/if}

<!-- Remove Legacy Account Warning Modal -->
{#if removingLegacyAccount}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
			<div class="text-center">
				<div class="mb-4 text-5xl">⚠️</div>
				<h3 class="text-xl font-bold text-neutral-800 dark:text-neutral-200">
					Remove Legacy Account?
				</h3>
				<p class="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
					Are you sure you want to remove this legacy account?
				</p>
				<div class="mt-3 rounded-lg bg-neutral-100 px-3 py-2 font-mono text-sm dark:bg-neutral-800">
					{shortAddress(removingLegacyAccount.address)}
				</div>
				<div class="mt-4 rounded-lg border border-warning-300 bg-warning-50 p-3 text-left text-sm text-warning-800 dark:border-warning-600/30 dark:bg-warning-900/20 dark:text-warning-300">
					<strong>Note:</strong> This only removes the account from your profile. If you have the mnemonic, you can always re-import it later.
				</div>
			</div>

			<div class="mt-6 flex gap-3">
				<Button
					variant="ghost"
					size="md"
					onclick={() => (removingLegacyAccount = null)}
					class="flex-1"
				>
					Cancel
				</Button>
				<Button
					variant="primary"
					size="md"
					onclick={handleRemoveLegacyConfirm}
					class="flex-1 !bg-error-600 hover:!bg-error-700"
				>
					Remove Account
				</Button>
			</div>
		</div>
	</div>
{/if}
