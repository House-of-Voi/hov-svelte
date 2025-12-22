<script lang="ts">
  import { browser } from '$app/environment';
  import { invalidateAll } from '$app/navigation';
  import { fetchAllBalances, formatBalance } from '$lib/voi/balances';
  import { getStoredGameAccountAddresses, removeGameAccountKeys } from '$lib/auth/gameAccountStorage';
  import type { GameAccountInfo } from '$lib/auth/session';
  import AddGameAccount from '$lib/components/gameAccounts/AddGameAccount.svelte';
  import UnlockGameAccount from '$lib/components/gameAccounts/UnlockGameAccount.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    gameAccounts: GameAccountInfo[];
    activeAccountId?: string;
    primaryEmail?: string;
    onAccountChange?: () => void;
  }

  let {
    isOpen,
    onClose,
    gameAccounts = [],
    activeAccountId,
    primaryEmail = '',
    onAccountChange
  }: Props = $props();

  // State
  let balances = $state<Map<string, string>>(new Map());
  let unlockedAddresses = $state<Set<string>>(new Set());
  let switchingAccountId = $state<string | null>(null);
  let loadingBalances = $state(false);

  // Sub-modal state
  let showAddModal = $state(false);
  let unlockingAccount = $state<GameAccountInfo | null>(null);
  let managingAccount = $state<GameAccountInfo | null>(null);

  // Portal action to teleport element to document.body
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    };
  }

  // Refresh unlocked status
  function refreshUnlockedStatus() {
    if (browser) {
      const stored = getStoredGameAccountAddresses();
      unlockedAddresses = new Set(stored);
    }
  }

  // Fetch USDC balances for all accounts
  async function fetchBalances() {
    if (!browser || gameAccounts.length === 0) return;

    loadingBalances = true;
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
    loadingBalances = false;
  }

  // Effects
  $effect(() => {
    if (isOpen) {
      refreshUnlockedStatus();
      fetchBalances();
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  });

  // Handle escape key
  $effect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !showAddModal && !unlockingAccount && !managingAccount) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  });

  function isUnlocked(account: GameAccountInfo): boolean {
    return unlockedAddresses.has(account.voiAddress);
  }

  function shortAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function getAuthMethodIcon(method: string | null): string {
    switch (method) {
      case 'email': return '📧';
      case 'google': return '🔵';
      case 'sms': return '📱';
      case 'mnemonic': return '🔑';
      default: return '🔐';
    }
  }

  // Sort accounts with active first
  const sortedAccounts = $derived(
    [...gameAccounts].sort((a, b) => {
      if (a.id === activeAccountId) return -1;
      if (b.id === activeAccountId) return 1;
      return 0;
    })
  );

  async function handleSwitchAccount(account: GameAccountInfo) {
    if (switchingAccountId) return;
    if (account.id === activeAccountId) return;

    // If locked, open unlock modal
    if (!isUnlocked(account)) {
      unlockingAccount = account;
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

      await invalidateAll();
      onAccountChange?.();
      onClose();
    } catch (err) {
      console.error('Failed to switch account:', err);
    } finally {
      switchingAccountId = null;
    }
  }

  async function handleLockAccount(account: GameAccountInfo) {
    try {
      await removeGameAccountKeys(account.voiAddress);
      refreshUnlockedStatus();
      managingAccount = null;
    } catch (err) {
      console.error('Failed to lock account:', err);
    }
  }

  async function handleDisconnectAccount(account: GameAccountInfo) {
    try {
      const response = await fetch('/api/game-accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id })
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to remove account');
      }

      // Also remove local keys if they exist
      try {
        await removeGameAccountKeys(account.voiAddress);
      } catch {
        // Ignore - keys may already be removed
      }

      refreshUnlockedStatus();
      managingAccount = null;
      await invalidateAll();
      onAccountChange?.();
    } catch (err) {
      console.error('Failed to disconnect account:', err);
    }
  }

  function handleAddSuccess() {
    showAddModal = false;
    refreshUnlockedStatus();
    fetchBalances();
    invalidateAll();
    onAccountChange?.();
  }

  function handleUnlockSuccess() {
    unlockingAccount = null;
    refreshUnlockedStatus();
    invalidateAll();
    onAccountChange?.();
  }

  function handleClose() {
    if (!showAddModal && !unlockingAccount && !managingAccount) {
      onClose();
    }
  }
</script>

{#if isOpen}
  <div use:portal class="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <!-- Backdrop -->
    <button
      type="button"
      class="absolute inset-0 bg-black/80"
      onclick={handleClose}
      aria-label="Close modal"
    ></button>

    <!-- Modal -->
    <div class="relative w-full max-w-md bg-[#292929] rounded-2xl border border-white/15 shadow-2xl max-h-[80vh] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-white/15 shrink-0">
        <h2 class="text-xl font-bold text-white">Your Accounts</h2>
        <button
          type="button"
          onclick={handleClose}
          class="size-8 flex items-center justify-center text-white/70 hover:text-white transition-colors rounded-full hover:bg-white/10"
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- Account List -->
      <div class="flex-1 overflow-y-auto p-4">
        {#if gameAccounts.length === 0}
          <!-- Empty state -->
          <div class="py-8 text-center">
            <div class="mb-4 text-4xl">🎮</div>
            <h3 class="text-lg font-semibold text-white mb-2">No Gaming Accounts</h3>
            <p class="text-sm text-white/70 max-w-xs mx-auto">
              Add a gaming account to start playing.
            </p>
          </div>
        {:else}
          <div class="space-y-2">
            {#each sortedAccounts as account (account.id)}
              {@const isActive = account.id === activeAccountId}
              {@const unlocked = isUnlocked(account)}
              {@const balance = balances.get(account.voiAddress) || '0.00'}
              {@const isSwitching = switchingAccountId === account.id}

              <div
                class="flex items-center gap-3 p-3 rounded-xl border transition-all
                  {isActive
                    ? 'bg-white/5 border-white/30'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/20'}"
              >
                <!-- Auth icon -->
                <span class="text-lg shrink-0">{getAuthMethodIcon(account.cdpRecoveryMethod)}</span>

                <!-- Account info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    {#if account.nickname}
                      <span class="font-medium text-white text-sm">{account.nickname}</span>
                    {:else}
                      <span class="font-mono text-white/80 text-sm">{shortAddress(account.voiAddress)}</span>
                    {/if}
                    {#if isActive}
                      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 text-[10px] font-medium">
                        <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                        Active
                      </span>
                    {/if}
                    {#if !unlocked}
                      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/10 text-white/60 text-[10px] font-medium">
                        🔒 Locked
                      </span>
                    {/if}
                  </div>
                  {#if account.nickname}
                    <span class="font-mono text-white/50 text-xs">{shortAddress(account.voiAddress)}</span>
                  {/if}
                </div>

                <!-- Balance -->
                <div class="text-right shrink-0">
                  {#if loadingBalances}
                    <div class="h-4 w-12 bg-white/10 rounded animate-pulse"></div>
                  {:else}
                    <span class="font-mono text-sm text-white">${balance}</span>
                  {/if}
                  <p class="text-[10px] text-white/50">USDC</p>
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-1 shrink-0">
                  {#if !isActive}
                    {#if unlocked}
                      <button
                        type="button"
                        onclick={() => handleSwitchAccount(account)}
                        disabled={isSwitching}
                        class="px-3 py-1.5 text-xs font-medium text-white bg-[#333] border border-[#808080] rounded-full hover:bg-[#404040] transition-colors disabled:opacity-50"
                      >
                        {isSwitching ? '...' : 'Switch'}
                      </button>
                    {:else}
                      <button
                        type="button"
                        onclick={() => unlockingAccount = account}
                        class="px-3 py-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full hover:bg-amber-500/20 transition-colors"
                      >
                        Unlock
                      </button>
                    {/if}
                  {/if}
                  <!-- Manage button -->
                  <button
                    type="button"
                    onclick={() => managingAccount = account}
                    class="size-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                    aria-label="Manage account"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="1.5"/>
                      <circle cx="19" cy="12" r="1.5"/>
                      <circle cx="5" cy="12" r="1.5"/>
                    </svg>
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="p-4 border-t border-white/15 shrink-0">
        <button
          type="button"
          onclick={() => showAddModal = true}
          class="w-full h-10 px-4 rounded-full bg-[#333] border-2 border-[#808080] text-white text-sm font-bold uppercase hover:bg-[#404040] transition-colors flex items-center justify-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Add Account
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Manage Account Popup -->
{#if managingAccount}
  <div use:portal class="fixed inset-0 z-[110] flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/60"
      onclick={() => managingAccount = null}
      aria-label="Close"
    ></button>

    <div class="relative w-full max-w-xs bg-[#3c3c3c] rounded-2xl border border-white/15 shadow-2xl p-4">
      <h3 class="text-lg font-bold text-white mb-4">Manage Account</h3>

      <div class="bg-white/5 rounded-xl p-3 mb-4">
        <p class="text-sm text-white/70 mb-1">Account</p>
        <p class="font-medium text-white">{managingAccount.nickname || shortAddress(managingAccount.voiAddress)}</p>
        {#if managingAccount.nickname}
          <p class="text-xs text-white/50 font-mono">{shortAddress(managingAccount.voiAddress)}</p>
        {/if}
      </div>

      <div class="space-y-2">
        {#if isUnlocked(managingAccount)}
          <button
            type="button"
            onclick={() => handleLockAccount(managingAccount!)}
            class="w-full p-3 rounded-xl text-left bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
          >
            <p class="font-medium text-amber-400">🔒 Lock Account</p>
            <p class="text-xs text-amber-400/70 mt-1">Remove keys from this browser. You can unlock later.</p>
          </button>
        {/if}

        <button
          type="button"
          onclick={() => handleDisconnectAccount(managingAccount!)}
          class="w-full p-3 rounded-xl text-left bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors"
        >
          <p class="font-medium text-red-400">🗑️ Remove Account</p>
          <p class="text-xs text-red-400/70 mt-1">Permanently disconnect this account from your profile.</p>
        </button>
      </div>

      <button
        type="button"
        onclick={() => managingAccount = null}
        class="w-full mt-4 h-10 px-4 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors"
      >
        Cancel
      </button>
    </div>
  </div>
{/if}

<!-- Add Account Modal -->
<AddGameAccount
  open={showAddModal}
  defaultEmail={primaryEmail}
  onSuccess={handleAddSuccess}
  onError={(msg) => console.error('Add account error:', msg)}
  onClose={() => showAddModal = false}
/>

<!-- Unlock Account Modal -->
{#if unlockingAccount}
  <UnlockGameAccount
    voiAddress={unlockingAccount.voiAddress}
    nickname={unlockingAccount.nickname}
    recoveryMethod={unlockingAccount.cdpRecoveryMethod as 'email' | 'sms' | 'google' | 'mnemonic' | null}
    recoveryHint={unlockingAccount.cdpRecoveryHint}
    modal={true}
    open={true}
    onSuccess={handleUnlockSuccess}
    onClose={() => unlockingAccount = null}
  />
{/if}
