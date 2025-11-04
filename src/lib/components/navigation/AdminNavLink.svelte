<script lang="ts">
  /**
   * Admin navigation link for main header/navigation
   *
   * Should only be rendered when user has admin access.
   * Use with server-side data to determine if user is admin:
   *
   * Example usage in +page.server.ts:
   * ```ts
   * import { isAdmin } from '$lib/auth/admin';
   *
   * export const load: PageServerLoad = async ({ cookies }) => {
   *   const hasAdminAccess = await isAdmin(cookies);
   *   return { hasAdminAccess };
   * };
   * ```
   *
   * Then in +page.svelte:
   * ```svelte
   * {#if data.hasAdminAccess}
   *   <AdminNavLink />
   * {/if}
   * ```
   */

  interface Props {
    /** Optional custom classes */
    class?: string;
  }

  let { class: customClass = '' }: Props = $props();

  const defaultClasses =
    'px-5 py-2.5 text-sm font-bold text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300 hover:bg-accent-50 dark:hover:bg-accent-900/20 rounded-lg transition-all tracking-wide uppercase';
</script>

<a href="/admin" class={customClass || defaultClasses}> Admin </a>
