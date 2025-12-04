<script lang="ts">
	import { browser } from '$app/environment';
	import { goto, invalidateAll } from '$app/navigation';
	import { supabaseBrowser } from '$lib/db/supabaseClient';
	import { clearAllGameAccountKeys, getStoredGameAccountAddresses } from '$lib/auth/gameAccountStorage';
	import type { ProfileData } from '$lib/profile/data';
	import type { GameAccountInfo } from '$lib/auth/session';
	import type { Session } from '@supabase/supabase-js';

	interface Props {
		initialProfile?: ProfileData | null;
		supabaseSession?: Session | null;
		gameAccounts?: GameAccountInfo[];
		activeAccountId?: string;
	}

	let {
		initialProfile = null,
		supabaseSession = null,
		gameAccounts = [],
		activeAccountId
	}: Props = $props();

	let isSigningOut = $state(false);
	let showDropdown = $state(false);
	let unlockedAddresses = $state<Set<string>>(new Set());
	let switchingAccountId = $state<string | null>(null);

	// Refresh unlocked status
	$effect(() => {
		if (browser) {
			const stored = getStoredGameAccountAddresses();
			unlockedAddresses = new Set(stored);
		}
	});

	const displayName = $derived(
		initialProfile?.display_name || supabaseSession?.user?.email?.split('@')[0] || 'User'
	);

	const avatarUrl = $derived(
		initialProfile?.avatar_url || supabaseSession?.user?.user_metadata?.avatar_url || null
	);

	const activeAccount = $derived(gameAccounts.find((a) => a.id === activeAccountId));

	// Sort accounts with active account first
	const sortedGameAccounts = $derived(
		[...gameAccounts].sort((a, b) => {
			if (a.id === activeAccountId) return -1;
			if (b.id === activeAccountId) return 1;
			return 0;
		})
	);

	function shortAddress(address: string): string {
		return `${address.slice(0, 4)}...${address.slice(-4)}`;
	}

	function isUnlocked(account: GameAccountInfo): boolean {
		return unlockedAddresses.has(account.voiAddress);
	}

	async function handleSignOut() {
		if (isSigningOut) return;
		isSigningOut = true;
		showDropdown = false;

		try {
			clearAllGameAccountKeys();
			await supabaseBrowser.auth.signOut();
			await fetch('/api/auth/logout', { method: 'POST' });
			goto('/auth');
		} catch (error) {
			console.error('Sign out error:', error);
			clearAllGameAccountKeys();
		} finally {
			isSigningOut = false;
		}
	}

	async function handleSwitchAccount(account: GameAccountInfo) {
		if (switchingAccountId) return;
		if (account.id === activeAccountId) {
			showDropdown = false;
			return;
		}

		// If locked, redirect to dashboard to unlock
		if (!isUnlocked(account)) {
			showDropdown = false;
			goto('/app');
			return;
		}

		switchingAccountId = account.id;
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

			showDropdown = false;
			await invalidateAll();
		} catch (err) {
			console.error('Failed to switch account:', err);
		} finally {
			switchingAccountId = null;
		}
	}

	function toggleDropdown() {
		showDropdown = !showDropdown;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.user-nav-dropdown')) {
			showDropdown = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

{#if supabaseSession}
	<div class="relative ml-3 user-nav-dropdown">
		<button
			onclick={toggleDropdown}
			class="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors duration-200"
		>
			{#if avatarUrl}
				<img src={avatarUrl} alt={displayName} class="w-8 h-8 rounded-full object-cover" />
			{:else}
				<span
					class="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white font-bold text-xs"
				>
					{displayName.charAt(0).toUpperCase()}
				</span>
			{/if}
			<div class="hidden sm:flex flex-col items-start">
				<span class="text-sm font-medium">{displayName}</span>
				{#if activeAccount}
					<span class="text-xs text-neutral-500 font-mono">
						{shortAddress(activeAccount.voiAddress)}
					</span>
				{/if}
			</div>
			<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>

		{#if showDropdown}
			<div
				class="absolute right-0 mt-2 w-64 bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 py-2 z-50"
			>
				<!-- Account Switcher Section -->
				{#if gameAccounts.length > 0}
					<div class="px-3 pb-2 mb-2 border-b border-neutral-200 dark:border-neutral-700">
						<p
							class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2"
						>
							Switch Account
						</p>
						<div class="space-y-1 max-h-48 overflow-y-auto">
							{#each sortedGameAccounts as account (account.id)}
								{@const unlocked = isUnlocked(account)}
								{@const isActive = account.id === activeAccountId}
								<button
									onclick={() => handleSwitchAccount(account)}
									disabled={switchingAccountId !== null}
									class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors disabled:opacity-50
										{isActive
										? 'bg-primary-50 dark:bg-primary-900/30'
										: 'hover:bg-neutral-100 dark:hover:bg-neutral-700'}"
								>
									<!-- Lock status -->
									<span class="text-sm flex-shrink-0">
										{#if isActive}
											<span class="w-2 h-2 inline-block rounded-full bg-primary-500"></span>
										{:else if unlocked}
											🔓
										{:else}
											🔒
										{/if}
									</span>

									<!-- Address -->
									<span
										class="font-mono text-xs text-neutral-700 dark:text-neutral-300 flex-1 truncate"
									>
										{account.nickname || shortAddress(account.voiAddress)}
									</span>

									<!-- Status -->
									{#if isActive}
										<span class="text-xs text-primary-600 dark:text-primary-400">Active</span>
									{:else if !unlocked}
										<span class="text-xs text-warning-600 dark:text-warning-400">Unlock</span>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Navigation Links -->
				<a
					href="/app"
					onclick={() => (showDropdown = false)}
					class="flex items-center gap-2 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
						<circle cx="12" cy="7" r="4"></circle>
					</svg>
					Profile & Accounts
				</a>

				<hr class="my-2 border-neutral-200 dark:border-neutral-700" />

				<button
					onclick={handleSignOut}
					disabled={isSigningOut}
					class="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
						<polyline points="16 17 21 12 16 7"></polyline>
						<line x1="21" y1="12" x2="9" y2="12"></line>
					</svg>
					{isSigningOut ? 'Signing out...' : 'Sign Out'}
				</button>
			</div>
		{/if}
	</div>
{:else}
	<a
		href="/auth"
		class="ml-3 px-6 py-2.5 text-sm font-black bg-gradient-to-r from-gold-500 to-gold-600 text-neutral-950 hover:from-gold-400 hover:to-gold-500 rounded-lg transition-all shadow-lg shadow-gold-950/50 tracking-wide uppercase"
	>
		Login
	</a>
{/if}
