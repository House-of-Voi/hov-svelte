<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    href: string;
    label: string;
    isActive: boolean;
    disabled?: boolean;
    isHomePage?: boolean;
    icon: Snippet;
  }

  let { href, label, isActive, disabled = false, isHomePage = false, icon }: Props = $props();

  const baseClasses = 'flex flex-col items-center justify-center gap-1 py-2 px-3 min-h-[56px] min-w-[64px] transition-colors duration-200 no-underline flex-1';

  // Home page specific styling (Figma design)
  const homeActiveClasses = 'text-white';
  const homeInactiveClasses = 'text-white/50';
  const homeDisabledClasses = 'text-white/30 pointer-events-none cursor-not-allowed';

  // Standard styling for other pages
  const activeClasses = 'text-primary-600 dark:text-primary-400';
  const inactiveClasses = 'text-neutral-600 dark:text-neutral-400';
  const disabledClasses = 'text-neutral-400 dark:text-neutral-600 pointer-events-none cursor-not-allowed';

  const currentActiveClasses = $derived(isHomePage ? homeActiveClasses : activeClasses);
  const currentInactiveClasses = $derived(isHomePage ? homeInactiveClasses : inactiveClasses);
  const currentDisabledClasses = $derived(isHomePage ? homeDisabledClasses : disabledClasses);
</script>

{#if disabled}
  <span
    class="{baseClasses} {currentDisabledClasses}"
    aria-disabled="true"
  >
    <span class="flex items-center justify-center w-8 h-8 rounded-full {isHomePage ? 'bg-[#808080]' : ''}">
      {@render icon()}
    </span>
    <span class="text-xs font-medium leading-none capitalize">{label}</span>
  </span>
{:else}
  <a
    {href}
    class="{baseClasses} {isActive ? currentActiveClasses : currentInactiveClasses}"
    aria-current={isActive ? 'page' : undefined}
  >
    <span class="flex items-center justify-center w-8 h-8 rounded-full {isHomePage ? 'bg-[#808080]' : ''}">
      {@render icon()}
    </span>
    <span class="text-xs font-medium leading-none capitalize">{label}</span>
  </a>
{/if}
