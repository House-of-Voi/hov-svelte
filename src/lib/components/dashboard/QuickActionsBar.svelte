<script lang="ts">
  import SlotMachineIcon from '$lib/components/icons/SlotMachineIcon.svelte';
  import ClockIcon from '$lib/components/icons/ClockIcon.svelte';
  import TrophyIcon from '$lib/components/icons/TrophyIcon.svelte';
  import ChartIcon from '$lib/components/icons/ChartIcon.svelte';

  interface Props {
    canPlay?: boolean;
  }

  let { canPlay = true }: Props = $props();

  const actions = [
    { href: '/games', icon: SlotMachineIcon, label: 'Play Games', disabled: !canPlay },
    { href: '/games/history', icon: ClockIcon, label: 'History', disabled: !canPlay },
    { href: '/leaderboard', icon: TrophyIcon, label: 'Leaderboard', disabled: !canPlay },
    { href: '/stats', icon: ChartIcon, label: 'My Stats', disabled: !canPlay },
  ];
</script>

<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
  {#each actions as action}
    {#if action.disabled}
      <div
        class="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-neutral-100 dark:bg-neutral-800/50 text-neutral-400 dark:text-neutral-600 cursor-not-allowed"
      >
        <action.icon size={24} />
        <span class="text-xs font-medium">{action.label}</span>
      </div>
    {:else}
      <a
        href={action.href}
        class="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
      >
        <action.icon size={24} />
        <span class="text-xs font-medium">{action.label}</span>
      </a>
    {/if}
  {/each}
</div>
