<script lang="ts">
  import { page } from '$app/stores';
  import BottomNavItem from './BottomNavItem.svelte';
  import HomeIcon from '$lib/components/icons/HomeIcon.svelte';
  import SlotMachineIcon from '$lib/components/icons/SlotMachineIcon.svelte';
  import SocialIcon from '$lib/components/icons/SocialIcon.svelte';
  import type { SessionInfo } from '$lib/auth/session';

  interface Props {
    session: SessionInfo | null;
    hasGameAccess: boolean;
    isAdminUser: boolean;
    isHomePage?: boolean;
  }

  let { session, hasGameAccess, isAdminUser, isHomePage = false }: Props = $props();

  const canAccessProtected = $derived(hasGameAccess || isAdminUser);

  // Determine active state based on current path
  const currentPath = $derived($page.url.pathname);
  const isHome = $derived(currentPath === '/' || currentPath.startsWith('/app'));
  const isGames = $derived(currentPath.startsWith('/games'));
  const isSocial = $derived(currentPath.startsWith('/leaderboard') || currentPath.startsWith('/social'));
</script>

<nav
  class="fixed bottom-0 left-0 right-0 z-40 lg:hidden {isHomePage ? 'bg-[#4c4c4c] shadow-[0px_-5px_10px_0px_rgba(0,0,0,0.1)]' : 'bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border-t border-neutral-200 dark:border-neutral-800'}"
  style="padding-bottom: env(safe-area-inset-bottom, 0);"
  aria-label="Main navigation"
>
  <div class="flex justify-around items-center max-w-lg mx-auto h-[83px] px-4">
    <BottomNavItem href="/" label="House" isActive={isHome} {isHomePage}>
      {#snippet icon()}
        <HomeIcon size={22} />
      {/snippet}
    </BottomNavItem>

    <BottomNavItem
      href="/games"
      label="Games"
      isActive={isGames}
      disabled={!canAccessProtected}
      {isHomePage}
    >
      {#snippet icon()}
        <SlotMachineIcon size={22} />
      {/snippet}
    </BottomNavItem>

    <BottomNavItem
      href="/leaderboard"
      label="Social"
      isActive={isSocial}
      disabled={!canAccessProtected}
      {isHomePage}
    >
      {#snippet icon()}
        <SocialIcon size={22} />
      {/snippet}
    </BottomNavItem>
  </div>
</nav>
