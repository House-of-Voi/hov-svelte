<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { invalidateAll, onNavigate } from '$app/navigation';
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  // Initialize Buffer polyfill for browser
  import '$lib/shims/buffer';
  import UserNav from '$lib/components/UserNav.svelte';
  import AdminNavLink from '$lib/components/navigation/AdminNavLink.svelte';
  import BottomNav from '$lib/components/navigation/BottomNav.svelte';
  import TokenBalancePill from '$lib/components/wallet/TokenBalancePill.svelte';
  import WalletIcon from '$lib/components/icons/WalletIcon.svelte';
  import WalletAccountsModal from '$lib/components/wallet/WalletAccountsModal.svelte';
  import NotificationContainer from '$lib/components/ui/NotificationContainer.svelte';
  import NavigationProgress from '$lib/components/ui/NavigationProgress.svelte';
  import VoiAddressProvider from '$lib/auth/VoiAddressProvider.svelte';
  import type { SessionInfo, GameAccountInfo } from '$lib/auth/session';
  import type { ProfileData } from '$lib/profile/data';
  import type { Snippet } from 'svelte';
  import { supabaseBrowser } from '$lib/db/supabaseClient';

  interface LayoutData {
    hovSession: SessionInfo | null;
    isAdminUser: boolean;
    initialProfile: ProfileData | null;
    supabaseSession: import('@supabase/supabase-js').Session | null;
    gameAccounts: GameAccountInfo[];
    activeGameAccountId?: string;
  }

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  // Enable View Transitions API for smooth page transitions
  onNavigate((navigation) => {
    if (!document.startViewTransition) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  // Check if we're on a fullscreen game route (slots, w2w, or testing)
  const isFullscreenGameRoute = $derived(
    $page.route.id === '/games/slots' ||
    $page.route.id === '/games/w2w' ||
    $page.route.id === '/games/testing'
  );

  // Check if we're on the home page
  const isHomePage = $derived($page.route.id === '/');

  // Check if we're on the games page (for dark theme)
  const isGamesPage = $derived($page.route.id === '/games');

  // Check if we're on a game detail page (for dark theme)
  const isGameDetailPage = $derived($page.route.id === '/games/[contractId]');

  // Check if we're on the app/profile page (for dark theme)
  const isAppPage = $derived($page.route.id?.startsWith('/app') || false);

  // Combined check for dark theme pages
  const isDarkThemePage = $derived(isHomePage || isGamesPage || isGameDetailPage || isAppPage);

  let isAdminUser = $state(data.isAdminUser);

  // Wallet modal state
  let isWalletModalOpen = $state(false);

  // Check if user has game access (for navigation)
  const hasGameAccess = $derived(data.hovSession?.gameAccessGranted || false);

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

  onMount(() => {
    // Listen for Supabase auth state changes
    const {
      data: { subscription },
    } = supabaseBrowser.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        // User signed in - refresh the page data
        invalidateAll();
        refreshAdminStatus();
      } else if (event === 'SIGNED_OUT') {
        // User signed out - refresh the page data
        invalidateAll();
      }
    });

    return () => subscription.unsubscribe();
  });

  $effect(() => {
    isAdminUser = data.isAdminUser;
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

<div class="min-h-screen {isDarkThemePage ? 'bg-[#292929]' : 'bg-white dark:bg-neutral-950'}">
  <NavigationProgress />
  <div class="flex min-h-screen flex-col">
    {#if !isFullscreenGameRoute}
      {#if isDarkThemePage}
        <!-- Simplified header for dark theme pages (home, games, game detail) -->
        <header class="sticky top-0 z-50 bg-[#4c4c4c] shadow-[0px_5px_10px_0px_rgba(0,0,0,0.1)]" style="view-transition-name: header;">
          <div class="mx-auto max-w-7xl px-4">
            <div class="flex items-center justify-between h-[72px]">
              <a href="/" class="flex items-center">
                <span class="font-bold text-2xl text-white uppercase">
                  Logo
                </span>
              </a>

              <div class="flex items-center gap-2">
                {#if data.hovSession}
                  <TokenBalancePill address={data.hovSession.voiAddress} />
                  <button
                    type="button"
                    onclick={() => isWalletModalOpen = true}
                    class="size-10 flex items-center justify-center rounded-full bg-[#333] border-2 border-[#808080] text-white hover:bg-[#404040] transition-colors"
                    aria-label="Manage accounts"
                  >
                    <WalletIcon size={24} />
                  </button>
                {/if}
                <a
                  href={data.hovSession ? '/app' : '/auth'}
                  class="size-10 flex items-center justify-center rounded-full bg-[#333] border-2 border-[#808080] text-white hover:bg-[#404040] transition-colors"
                  aria-label={data.hovSession ? 'Profile' : 'Log in'}
                >
                  <svg class="size-6" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/>
                    <path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </header>
      {:else}
        <!-- Standard header for other pages -->
        <header class="sticky top-0 z-50 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl border-b border-neutral-200 dark:border-neutral-800" style="view-transition-name: header;">
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
                <div class="hidden sm:block">
                  <span class="font-semibold text-lg text-neutral-950 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                    House of Voi
                  </span>
                </div>
              </a>

              <!-- Mobile header actions -->
              <div class="flex lg:hidden items-center gap-2">
                {#if data.hovSession}
                  <TokenBalancePill address={data.hovSession.voiAddress} />
                {/if}
                <a
                  href={data.hovSession ? '/app' : '/auth'}
                  class="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/>
                    <path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </a>
              </div>

              <!-- Desktop navigation -->
              <nav class="hidden lg:flex items-center space-x-1">
                <a href="/" class={navLinkClasses}>Home</a>
                {#if hasGameAccess || isAdminUser}
                  <a href="/games" class={navLinkClasses}>Games</a>
                {:else}
                  <span aria-disabled="true" class={disabledNavClass}>Games</span>
                {/if}
                {#if hasGameAccess || isAdminUser}
                  <a href="/house" class={navLinkClasses}>House</a>
                {:else}
                  <span aria-disabled="true" class={disabledNavClass}>House</span>
                {/if}
                {#if hasGameAccess || isAdminUser}
                  <a href="/stats" class={navLinkClasses}>Stats</a>
                {:else}
                  <span aria-disabled="true" class={disabledNavClass}>Stats</span>
                {/if}
                {#if hasGameAccess || isAdminUser}
                  <a href="/leaderboard" class={navLinkClasses}>Leaderboard</a>
                {:else}
                  <span aria-disabled="true" class={disabledNavClass}>Leaderboard</span>
                {/if}
                {#if isAdminUser}
                  <AdminNavLink />
                {/if}
                {#if data.hovSession}
                  <TokenBalancePill address={data.hovSession.voiAddress} />
                {/if}
                <UserNav
                  initialProfile={data.initialProfile}
                  supabaseSession={data.supabaseSession}
                  gameAccounts={data.gameAccounts}
                  activeAccountId={data.activeGameAccountId}
                />
              </nav>
            </div>
          </div>
        </header>
      {/if}
    {/if}

    {#if isFullscreenGameRoute}
      <!-- Fullscreen game mode: no padding, full viewport -->
      <main class="w-full h-screen m-0 p-0" style="view-transition-name: main-content;">
        {@render children()}
      </main>
    {:else if isDarkThemePage}
      <!-- Dark theme pages (home, games, game detail): custom padding -->
      <main class="mx-auto max-w-7xl px-4 py-6 pb-24 lg:pb-6 w-full min-h-[calc(100vh-16rem)] flex-1" style="view-transition-name: main-content;">
        {@render children()}
      </main>
    {:else}
      <!-- Normal mode: with padding and constraints -->
      <main class="mx-auto max-w-7xl px-6 py-12 pb-24 lg:pb-12 w-full min-h-[calc(100vh-16rem)] transition-all duration-300 flex-1" style="view-transition-name: main-content;">
        {@render children()}
      </main>
    {/if}

    {#if !isFullscreenGameRoute}
      <div style="view-transition-name: bottom-nav;">
        <BottomNav
          session={data.hovSession}
          hasGameAccess={hasGameAccess}
          isAdminUser={isAdminUser}
          isHomePage={isDarkThemePage}
        />
      </div>
    {/if}

    {#if !isFullscreenGameRoute && !isDarkThemePage}
    <footer class="hidden lg:block border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
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

  <!-- Wallet Accounts Modal -->
  {#if data.hovSession}
    <WalletAccountsModal
      isOpen={isWalletModalOpen}
      onClose={() => isWalletModalOpen = false}
      gameAccounts={data.gameAccounts}
      activeAccountId={data.activeGameAccountId}
      primaryEmail={data.hovSession.email}
      onAccountChange={() => invalidateAll()}
    />
  {/if}
</div>
