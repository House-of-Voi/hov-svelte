<script lang="ts">
  import { onMount } from 'svelte';
  import Avatar from './Avatar.svelte';
  import { goto } from '$app/navigation';
  import { signOutCdpSession } from '$lib/auth/cdpClient';

  interface Profile {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    primary_email: string;
  }

  interface Props {
    initialProfile?: Profile | null;
  }

  let { initialProfile = null }: Props = $props();

  let profile = $state<Profile | null>(initialProfile);
  let isLoading = $state(false);
  let isDropdownOpen = $state(false);
  let dropdownRef: HTMLDivElement;

  async function fetchProfile() {
    isLoading = true;
    try {
      const response = await fetch('/api/profile/me');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          profile = result.data.profile;
        }
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      isLoading = false;
    }
  }

  async function handleLogout() {
    try {
      await signOutCdpSession();

      // Call backend logout endpoint to clear session
      await fetch('/api/auth/logout', { method: 'POST' });

      // Redirect to auth page
      goto('/auth');
    } catch (error) {
      console.error('Logout error:', error);
      goto('/auth');
    }
  }

  onMount(() => {
    // Listen for login success events to refresh profile
    const handleLoginSuccess = () => {
      fetchProfile();
    };

    window.addEventListener('hov:login-success', handleLoginSuccess);
    return () => window.removeEventListener('hov:login-success', handleLoginSuccess);
  });

  // Close dropdown when clicking outside
  $effect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
        isDropdownOpen = false;
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  });
</script>

{#if isLoading || !profile}
  <a
    href="/auth"
    class="ml-3 px-6 py-2.5 text-sm font-black bg-gradient-to-r from-gold-500 to-gold-600 text-neutral-950 hover:from-gold-400 hover:to-gold-500 rounded-lg transition-all shadow-lg shadow-gold-950/50 tracking-wide uppercase"
  >
    Login
  </a>
{:else}
  <div class="relative" bind:this={dropdownRef}>
    <button
      onclick={() => (isDropdownOpen = !isDropdownOpen)}
      class="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-warning-50 dark:hover:bg-warning-500/10 transition-colors group"
      title="User menu"
    >
      <Avatar
        src={profile.avatar_url}
        displayName={profile.display_name}
        alt={profile.display_name || profile.primary_email}
        size="md"
      />
      <div class="hidden sm:block">
        <div class="text-sm font-bold text-warning-500 dark:text-warning-400 group-hover:text-warning-600 dark:group-hover:text-warning-300 transition-colors">
          {profile.display_name || 'User'}
        </div>
        <div class="text-xs text-neutral-500">Menu</div>
      </div>
      <svg
        class="w-4 h-4 text-neutral-500 transition-transform {isDropdownOpen ? 'rotate-180' : ''}"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    {#if isDropdownOpen}
      <div class="absolute right-0 mt-2 w-56 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-xl overflow-hidden z-[60]">
        <div class="py-2">
          <a
            href="/app"
            class="flex items-center gap-3 px-4 py-3 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            onclick={() => (isDropdownOpen = false)}
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>Profile</span>
          </a>
          <div class="border-t border-neutral-200 dark:border-neutral-800 my-2"></div>
          <button
            onclick={handleLogout}
            class="flex items-center gap-3 px-4 py-3 text-sm text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-950 transition-colors w-full text-left"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}
