<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { supabaseBrowser } from '$lib/db/supabaseClient';
  import { clearAllGameAccountKeys } from '$lib/auth/gameAccountStorage';
  import type { ProfileData } from '$lib/profile/data';
  import type { Session } from '@supabase/supabase-js';

  interface Props {
    initialProfile?: ProfileData | null;
    supabaseSession?: Session | null;
  }

  let { initialProfile = null, supabaseSession = null }: Props = $props();

  let isSigningOut = $state(false);
  let showDropdown = $state(false);

  const displayName = $derived(
    initialProfile?.display_name || supabaseSession?.user?.email?.split('@')[0] || 'User'
  );

  const avatarUrl = $derived(
    initialProfile?.avatar_url || supabaseSession?.user?.user_metadata?.avatar_url || null
  );

  async function handleSignOut() {
    if (isSigningOut) return;
    isSigningOut = true;
    showDropdown = false;

    try {
      // Clear stored game account keys from localStorage
      clearAllGameAccountKeys();

      // Sign out from Supabase
      await supabaseBrowser.auth.signOut();

      // Call our logout endpoint to clear app-specific cookies
      await fetch('/api/auth/logout', { method: 'POST' });

      // Redirect to auth page
      goto('/auth');
    } catch (error) {
      console.error('Sign out error:', error);
      // Still clear keys on error
      clearAllGameAccountKeys();
    } finally {
      isSigningOut = false;
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
      class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors duration-200"
    >
      {#if avatarUrl}
        <img
          src={avatarUrl}
          alt={displayName}
          class="w-8 h-8 rounded-full object-cover"
        />
      {:else}
        <span class="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
          {displayName.charAt(0).toUpperCase()}
        </span>
      {/if}
      <span class="hidden sm:inline">{displayName}</span>
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    {#if showDropdown}
      <div class="absolute right-0 mt-2 w-48 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 z-50">
        <a
          href="/app"
          onclick={() => showDropdown = false}
          class="block px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
        >
          Profile
        </a>
        <hr class="my-1 border-neutral-200 dark:border-neutral-700" />
        <button
          onclick={handleSignOut}
          disabled={isSigningOut}
          class="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50"
        >
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
