<script lang="ts">
  /**
   * GameAccountSwitcher Component
   *
   * Dropdown component for switching between game accounts.
   * Shows all accounts with their lock/unlock status.
   * Triggers unlock flow for locked accounts before switching.
   */
  import { browser } from '$app/environment';
  import { invalidateAll } from '$app/navigation';
  import Button from '$lib/components/ui/Button.svelte';
  import UnlockGameAccount from './UnlockGameAccount.svelte';
  import {
    hasGameAccountKeys,
    getStoredGameAccountAddresses,
  } from '$lib/auth/gameAccountStorage';
  import type { GameAccountInfo } from '$lib/auth/session';

  interface Props {
    /** List of game accounts from the server */
    accounts: GameAccountInfo[];
    /** Currently active account ID */
    activeAccountId?: string;
    /** Callback when account is switched */
    onSwitch?: (account: GameAccountInfo) => void;
    /** Show "Add Account" option */
    showAddAccount?: boolean;
    /** Callback when "Add Account" is clicked */
    onAddAccount?: () => void;
  }

  let {
    accounts,
    activeAccountId,
    onSwitch,
    showAddAccount = true,
    onAddAccount,
  }: Props = $props();

  // State
  let isOpen = $state(false);
  let isSwitching = $state(false);
  let unlockingAccount = $state<GameAccountInfo | null>(null);

  // Check which accounts are unlocked (have keys in localStorage)
  let unlockedAddresses = $state<Set<string>>(new Set());

  // Refresh unlocked status when accounts change or component mounts
  $effect(() => {
    if (browser) {
      const stored = getStoredGameAccountAddresses();
      unlockedAddresses = new Set(stored);
    }
  });

  // Active account
  const activeAccount = $derived(accounts.find((a) => a.id === activeAccountId) || accounts[0]);

  // Order accounts with the active one first while keeping the original order for the rest
  const orderedAccounts = $derived.by(() => {
    if (!accounts?.length) return accounts || [];

    const indexed = accounts.map((acc, idx) => ({ acc, idx }));
    indexed.sort((a, b) => {
      const aActive = a.acc.id === activeAccountId ? 1 : 0;
      const bActive = b.acc.id === activeAccountId ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return a.idx - b.idx;
    });

    return indexed.map(({ acc }) => acc);
  });

  // Is account unlocked?
  function isUnlocked(account: GameAccountInfo): boolean {
    return unlockedAddresses.has(account.voiAddress);
  }

  // Short address for display
  function shortAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  // Display name for account
  function displayName(account: GameAccountInfo): string {
    return account.nickname || shortAddress(account.voiAddress);
  }

  /**
   * Handle account selection
   */
  async function selectAccount(account: GameAccountInfo) {
    if (account.id === activeAccountId) {
      isOpen = false;
      return;
    }

    // Check if account is unlocked
    if (!isUnlocked(account)) {
      // Need to unlock first
      unlockingAccount = account;
      isOpen = false;
      return;
    }

    // Switch to the account
    await switchToAccount(account);
  }

  /**
   * Switch to an account (assumes it's unlocked)
   */
  async function switchToAccount(account: GameAccountInfo) {
    isSwitching = true;

    try {
      const response = await fetch('/api/game-accounts/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to switch account');
      }

      // Invalidate all data to refresh with new account
      await invalidateAll();

      onSwitch?.(account);
    } catch (error) {
      console.error('Switch account error:', error);
      // Could show an error notification here
    } finally {
      isSwitching = false;
      isOpen = false;
    }
  }

  /**
   * Handle successful unlock
   */
  async function handleUnlockSuccess() {
    if (unlockingAccount) {
      // Refresh unlocked addresses
      const stored = getStoredGameAccountAddresses();
      unlockedAddresses = new Set(stored);

      // Now switch to the account
      await switchToAccount(unlockingAccount);
      unlockingAccount = null;
    }
  }

  /**
   * Handle unlock cancel
   */
  function handleUnlockClose() {
    unlockingAccount = null;
  }

  /**
   * Toggle dropdown
   */
  function toggleDropdown() {
    if (!isSwitching) {
      isOpen = !isOpen;
    }
  }

  /**
   * Close dropdown when clicking outside
   */
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.game-account-switcher')) {
      isOpen = false;
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="game-account-switcher relative">
  <!-- Current Account Button -->
  <button
    onclick={toggleDropdown}
    disabled={isSwitching}
    class="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
  >
    {#if activeAccount}
      <!-- Lock/Unlock Icon -->
      <span class="text-sm">
        {#if isUnlocked(activeAccount)}
          🔓
        {:else}
          🔒
        {/if}
      </span>

      <!-- Account Name -->
      <span class="text-sm font-medium text-neutral-800 dark:text-neutral-200 max-w-[120px] truncate">
        {displayName(activeAccount)}
      </span>
    {:else}
      <span class="text-sm text-neutral-500">No Account</span>
    {/if}

    <!-- Dropdown Arrow -->
    <svg
      class="w-4 h-4 text-neutral-500 transition-transform {isOpen ? 'rotate-180' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  <!-- Dropdown Menu -->
  {#if isOpen}
    <div
      class="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden z-50"
    >
      <!-- Account List -->
      <div class="max-h-64 overflow-y-auto">
        {#each orderedAccounts as account (account.id)}
          <button
            onclick={() => selectAccount(account)}
            disabled={isSwitching}
            class="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors
              {account.id === activeAccountId ? 'bg-warning-50 dark:bg-warning-900/20' : ''}"
          >
            <!-- Lock Status -->
            <span class="text-lg">
              {#if isUnlocked(account)}
                🔓
              {:else}
                🔒
              {/if}
            </span>

            <!-- Account Info -->
            <div class="flex-1 text-left">
              <div class="font-medium text-neutral-800 dark:text-neutral-200 text-sm">
                {displayName(account)}
              </div>
              {#if account.nickname}
                <div class="text-xs text-neutral-500 font-mono">
                  {shortAddress(account.voiAddress)}
                </div>
              {/if}
            </div>

            <!-- Active Indicator -->
            {#if account.id === activeAccountId}
              <div class="w-2 h-2 rounded-full bg-warning-500"></div>
            {/if}

            <!-- Lock Badge -->
            {#if !isUnlocked(account)}
              <span
                class="text-xs px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400"
              >
                Locked
              </span>
            {/if}
          </button>
        {/each}
      </div>

      <!-- Add Account Option -->
      {#if showAddAccount}
        <div class="border-t border-neutral-200 dark:border-neutral-800">
          <button
            onclick={() => {
              isOpen = false;
              onAddAccount?.();
            }}
            disabled={isSwitching}
            class="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-warning-600 dark:text-warning-400"
          >
            <span class="text-lg">➕</span>
            <span class="font-medium text-sm">Add Game Account</span>
          </button>
        </div>
      {/if}
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
