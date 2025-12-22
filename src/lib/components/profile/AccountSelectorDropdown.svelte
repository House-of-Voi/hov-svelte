<script lang="ts">
  import type { GameAccountInfo } from '$lib/auth/session';
  import ChevronDownIcon from '$lib/components/icons/ChevronDownIcon.svelte';

  interface Props {
    accounts: GameAccountInfo[];
    selectedAccountId: string;
    onSelect: (account: GameAccountInfo) => void;
    onSettings?: () => void;
  }

  let { accounts, selectedAccountId, onSelect, onSettings }: Props = $props();

  let isOpen = $state(false);
  let containerRef = $state<HTMLDivElement | null>(null);

  const selectedAccount = $derived(
    accounts.find((a) => a.id === selectedAccountId) || accounts[0]
  );

  function truncateAddress(addr: string): string {
    if (!addr) return '';
    if (addr.length > 20) {
      return `${addr.slice(0, 8)} ... ${addr.slice(-8)}`;
    }
    return addr;
  }

  function toggleDropdown() {
    isOpen = !isOpen;
  }

  function handleSelect(account: GameAccountInfo) {
    onSelect(account);
    isOpen = false;
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (containerRef && !containerRef.contains(target)) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  });
</script>

<div class="flex gap-4 items-start w-full">
  <!-- Account Selector -->
  <div class="relative flex-1" bind:this={containerRef}>
    <button
      type="button"
      onclick={toggleDropdown}
      class="w-full flex items-center gap-2 h-10 px-4 py-2 bg-[#333] border-2 border-[#808080] rounded-full hover:bg-[#404040] transition-colors"
    >
      <!-- Wallet Icon -->
      <svg class="size-[18px] text-white shrink-0" viewBox="0 0 24 24" fill="none">
        <path
          d="M19 7V5C19 3.89543 18.1046 3 17 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H17C18.1046 21 19 20.1046 19 19V17"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
        <path
          d="M21 12C21 10.8954 20.1046 10 19 10H15C13.8954 10 13 10.8954 13 12C13 13.1046 13.8954 14 15 14H19C20.1046 14 21 13.1046 21 12Z"
          stroke="currentColor"
          stroke-width="2"
        />
        <circle cx="16" cy="12" r="1" fill="currentColor" />
      </svg>

      <!-- Address -->
      <span class="flex-1 text-sm font-medium text-white uppercase truncate text-left">
        {#if selectedAccount}
          {selectedAccount.nickname || truncateAddress(selectedAccount.voiAddress)}
        {:else}
          Select Account
        {/if}
      </span>

      <!-- Chevron -->
      <ChevronDownIcon
        size={18}
        class="text-white shrink-0 transition-transform {isOpen ? 'rotate-180' : ''}"
      />
    </button>

    <!-- Dropdown -->
    {#if isOpen && accounts.length > 1}
      <div class="absolute left-0 right-0 top-full mt-2 bg-[#4c4c4c] rounded-lg shadow-xl z-50 p-2 max-h-64 overflow-y-auto">
        {#each accounts as account (account.id)}
          <button
            type="button"
            onclick={() => handleSelect(account)}
            class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-white/10 transition-colors {account.id === selectedAccountId ? 'bg-white/10' : ''}"
          >
            <span class="text-sm font-medium text-white truncate">
              {account.nickname || truncateAddress(account.voiAddress)}
            </span>
            {#if account.id === selectedAccountId}
              <svg class="size-4 text-white/70 ml-auto shrink-0" viewBox="0 0 24 24" fill="none">
                <path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Settings Button -->
  {#if onSettings}
    <button
      type="button"
      onclick={onSettings}
      class="size-10 flex items-center justify-center bg-[#333] border-2 border-[#808080] rounded-full hover:bg-[#404040] transition-colors shrink-0"
      aria-label="Account settings"
    >
      <svg class="size-6 text-white" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" />
        <path
          d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
    </button>
  {/if}
</div>
