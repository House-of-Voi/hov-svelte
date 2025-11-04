<script lang="ts">
  import { page } from '$app/stores';
  import {
    getEffectivePermissions,
    PERMISSIONS,
    type Permission,
    type AdminRole,
  } from '$lib/auth/permissions';

  interface Props {
    role: AdminRole;
    permissions: Record<string, boolean>;
  }

  let { role, permissions }: Props = $props();

  // Convert permissions object to array for checking
  const roleData = {
    role,
    permissions,
    profile_id: '',
    granted_by: null,
    granted_at: '',
  };

  const effectivePerms = getEffectivePermissions(roleData);

  const hasPermission = (perm: Permission) => effectivePerms.includes(perm);

  const navItems: Array<{
    href: string;
    label: string;
    permission: Permission;
    exact?: boolean;
  }> = [
    {
      href: '/admin',
      label: 'Dashboard',
      permission: PERMISSIONS.VIEW_ANALYTICS,
      exact: true,
    },
    {
      href: '/admin/players',
      label: 'Players',
      permission: PERMISSIONS.VIEW_PLAYERS,
    },
    {
      href: '/admin/games',
      label: 'Games',
      permission: PERMISSIONS.VIEW_GAMES,
    },
    {
      href: '/admin/referrals',
      label: 'Referrals',
      permission: PERMISSIONS.VIEW_REFERRALS,
    },
    {
      href: '/admin/analytics',
      label: 'Analytics',
      permission: PERMISSIONS.VIEW_ANALYTICS,
    },
    {
      href: '/admin/waitlist',
      label: 'Waitlist',
      permission: PERMISSIONS.MANAGE_WAITLIST,
    },
  ];

  const roleColors = {
    owner:
      'bg-warning-100 dark:bg-warning-500/20 text-warning-600 dark:text-warning-400 border-warning-300 dark:border-warning-500/30',
    operator:
      'bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 border-primary-300 dark:border-primary-500/30',
    viewer:
      'bg-neutral-200 dark:bg-neutral-700/50 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600/30',
  };

  const roleLabels = {
    owner: 'OWNER',
    operator: 'OPERATOR',
    viewer: 'VIEWER',
  };

  // Determine if a nav item is active
  const isActive = (item: { href: string; exact?: boolean }) => {
    const pathname = $page.url.pathname;
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname.startsWith(item.href);
  };

  // Filter nav items based on permissions
  const visibleNavItems = $derived(navItems.filter((item) => hasPermission(item.permission)));
</script>

<nav
  class="glass-casino border-b border-warning-200 dark:border-warning-900/20 sticky top-16 z-40 bg-neutral-50/95 dark:bg-neutral-900/95 backdrop-blur-xl"
>
  <div class="mx-auto max-w-7xl px-6">
    <div class="flex items-center justify-between h-16">
      <!-- Logo/Brand -->
      <div class="flex items-center space-x-8">
        <a href="/admin" class="flex items-center space-x-2 group">
          <span
            class="text-xl font-black text-warning-500 dark:text-warning-400 group-hover:text-warning-600 dark:group-hover:text-warning-300 transition-colors neon-text uppercase tracking-wider"
          >
            🎰 Admin
          </span>
        </a>

        <!-- Nav Items (Desktop) -->
        <div class="hidden md:flex space-x-1">
          {#each visibleNavItems as item (item.href)}
            {@const active = isActive(item)}
            <a
              href={item.href}
              class={`px-4 py-2 rounded-lg text-sm font-bold transition-all uppercase tracking-wide ${
                active
                  ? 'bg-warning-100 dark:bg-warning-500/20 text-warning-600 dark:text-warning-400 border border-warning-300 dark:border-warning-500/30'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-warning-600 dark:hover:text-warning-400 hover:bg-warning-50 dark:hover:bg-warning-500/5'
              }`}
            >
              {item.label}
            </a>
          {/each}
        </div>
      </div>

      <!-- Role Badge & User Menu -->
      <div class="flex items-center space-x-4">
        <span class={`px-3 py-1 rounded-full text-xs font-bold border ${roleColors[role]}`}>
          {roleLabels[role]}
        </span>

        <a
          href="/app"
          class="text-sm text-neutral-600 dark:text-neutral-400 hover:text-warning-600 dark:hover:text-warning-400 font-bold transition-colors uppercase tracking-wide"
        >
          Exit
        </a>
      </div>
    </div>

    <!-- Mobile Nav -->
    <div class="md:hidden pb-4">
      <div class="flex flex-wrap gap-2">
        {#each visibleNavItems as item (item.href)}
          {@const active = isActive(item)}
          <a
            href={item.href}
            class={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all uppercase tracking-wide ${
              active
                ? 'bg-warning-100 dark:bg-warning-500/20 text-warning-600 dark:text-warning-400 border border-warning-300 dark:border-warning-500/30'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-warning-600 dark:hover:text-warning-400 hover:bg-warning-50 dark:hover:bg-warning-500/5 border border-neutral-300 dark:border-neutral-700'
            }`}
          >
            {item.label}
          </a>
        {/each}
      </div>
    </div>
  </div>
</nav>
