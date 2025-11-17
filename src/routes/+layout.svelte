<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { invalidateAll } from '$app/navigation';
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  // Initialize Buffer polyfill for browser
  import '$lib/shims/buffer';
  import UserNav from '$lib/components/UserNav.svelte';
  import AdminNavLink from '$lib/components/navigation/AdminNavLink.svelte';
  import NotificationContainer from '$lib/components/ui/NotificationContainer.svelte';
  import NavigationProgress from '$lib/components/ui/NavigationProgress.svelte';
  import VoiAddressProvider from '$lib/auth/VoiAddressProvider.svelte';
  import type { SessionInfo } from '$lib/auth/session';
  import type { ProfileData } from '$lib/profile/data';
  import { validateStoredKeys, handleSessionRecovery } from '$lib/auth/sessionRecovery';

  interface LayoutData {
    session: SessionInfo | null;
    isAdminUser: boolean;
    initialProfile: ProfileData | null;
  }

  let { children, data }: { children: () => unknown; data: LayoutData } = $props();

  // Check if we're on a fullscreen game route (slots, w2w, or testing)
  const isFullscreenGameRoute = $derived(
    $page.route.id === '/games/slots' ||
    $page.route.id === '/games/w2w' ||
    $page.route.id === '/games/testing'
  );

  let isAdminUser = $state(data.isAdminUser);
  let recoveryAttempted = $state(false);

  async function refreshAdminStatus() {
    try {
      const response = await fetch('/api/admin/check-access');
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          isAdminUser = false;
        }
        return;
      }

      const result = await response.json();
      isAdminUser = Boolean(result?.success);
    } catch (error) {
      console.error('Failed to refresh admin status:', error);
    }
  }

  /**
   * Validates key storage and handles recovery if needed
   */
  async function validateAndRecoverKeys(): Promise<void> {
    if (!browser || recoveryAttempted) {
      return;
    }

    recoveryAttempted = true;

    // If we have a session, check if keys are stored
    if (data.session) {
      const keysValid = await validateStoredKeys();
      if (!keysValid) {
        // Keys missing - attempt recovery
        console.log('Keys missing, attempting recovery...');
        await handleSessionRecovery();
      }
    }
  }

  onMount(() => {
    const handleLoginSuccess = () => {
      refreshAdminStatus();
    };

    window.addEventListener('hov:login-success', handleLoginSuccess);

    // Validate key storage on mount
    if (browser) {
      validateAndRecoverKeys();
    }

    return () => window.removeEventListener('hov:login-success', handleLoginSuccess);
  });

  $effect(() => {
    isAdminUser = data.isAdminUser;

    // Validate keys when session changes
    if (browser && data.session && !recoveryAttempted) {
      validateAndRecoverKeys();
    }
  });

  const disabledNavClass =
    'px-4 py-2 text-sm font-medium text-neutral-400 dark:text-neutral-600 rounded-lg pointer-events-none cursor-not-allowed';

  const currentYear = new Date().getFullYear();

  const navLinkClasses =
    'px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors duration-200';
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<VoiAddressProvider session={data.session}>
  <div class="min-h-screen bg-white dark:bg-neutral-950">
    <NavigationProgress />
    <div class="flex min-h-screen flex-col">
      {#if !isFullscreenGameRoute}
      <header class="sticky top-0 z-50 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl border-b border-neutral-200 dark:border-neutral-800">
        <div class="mx-auto max-w-7xl px-6">
          <div class="flex items-center justify-between h-16">
            <a href="/" class="flex items-center space-x-3 group">
              <div class="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-sm group-hover:shadow-md transition-all">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" class="text-white">
                  <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" stroke-width="2" />
                  <circle cx="8" cy="10" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="10" r="1.5" fill="currentColor" />
                  <circle cx="16" cy="10" r="1.5" fill="currentColor" />
                  <path d="M6 14h12M6 17h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </div>
              <div>
                <span class="font-semibold text-lg text-neutral-950 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  House of Voi
                </span>
              </div>
            </a>
            <nav class="flex items-center space-x-1">
              <a href="/" class={navLinkClasses}>Home</a>
              {#if isAdminUser}
                <a href="/games" class={navLinkClasses}>Games</a>
              {:else}
                <span aria-disabled="true" class={disabledNavClass}>Games</span>
              {/if}
              {#if isAdminUser}
                <a href="/house" class={navLinkClasses}>House</a>
              {:else}
                <span aria-disabled="true" class={disabledNavClass}>House</span>
              {/if}
              {#if isAdminUser}
                <a href="/stats" class={navLinkClasses}>Stats</a>
              {:else}
                <span aria-disabled="true" class={disabledNavClass}>Stats</span>
              {/if}
              {#if isAdminUser}
                <a href="/leaderboard" class={navLinkClasses}>Leaderboard</a>
              {:else}
                <span aria-disabled="true" class={disabledNavClass}>Leaderboard</span>
              {/if}
              {#if isAdminUser}
                <AdminNavLink />
              {/if}
              <UserNav initialProfile={data.initialProfile} />
            </nav>
          </div>
        </div>
      </header>
      {/if}

      {#if isFullscreenGameRoute}
        <!-- Fullscreen game mode: no padding, full viewport -->
        <main class="w-full h-screen m-0 p-0">
          {@render children()}
        </main>
      {:else}
        <!-- Normal mode: with padding and constraints -->
        <main class="mx-auto max-w-7xl px-6 py-12 w-full min-h-[calc(100vh-16rem)] transition-all duration-300 flex-1">
          {@render children()}
        </main>
      {/if}

      {#if !isFullscreenGameRoute}
      <footer class="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
        <div class="mx-auto max-w-7xl px-6 py-12">
          <div class="text-center">
            <div class="text-neutral-950 dark:text-white font-semibold text-xl mb-2">House of Voi</div>
            <p class="text-neutral-700 dark:text-neutral-300 text-sm mb-6">Fun games and rewards across multiple blockchains</p>
            <div class="flex justify-center gap-6 text-xs text-neutral-500 dark:text-neutral-500">
              <span>Base</span>
              <span>•</span>
              <span>Voi</span>
              <span>•</span>
              <span>Solana</span>
            </div>
            <p class="text-neutral-400 dark:text-neutral-600 text-xs mt-8">
              &copy; {currentYear} House of Voi. Have fun!
            </p>
          </div>
        </div>
      </footer>
      {/if}
    </div>

    {#if !isFullscreenGameRoute}
    <!-- Global Notification Container -->
    <NotificationContainer />
    {/if}
  </div>
</VoiAddressProvider>
