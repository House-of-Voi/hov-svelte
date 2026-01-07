<script lang="ts">
  import type { MachineStatus } from '$lib/types/database';

  interface Props {
    status: MachineStatus;
    class?: string;
  }

  let { status, class: className = '' }: Props = $props();

  const statusConfig: Record<MachineStatus, { bg: string; text: string; label: string }> = {
    draft: {
      bg: 'bg-neutral-500/20',
      text: 'text-neutral-600 dark:text-neutral-400',
      label: 'Draft'
    },
    deploying: {
      bg: 'bg-warning-500/20',
      text: 'text-warning-600 dark:text-warning-400',
      label: 'Deploying'
    },
    bootstrapping: {
      bg: 'bg-warning-500/20',
      text: 'text-warning-600 dark:text-warning-400',
      label: 'Bootstrapping'
    },
    active: {
      bg: 'bg-success-500/20',
      text: 'text-success-600 dark:text-success-400',
      label: 'Active'
    },
    paused: {
      bg: 'bg-orange-500/20',
      text: 'text-orange-600 dark:text-orange-400',
      label: 'Paused'
    },
    failed: {
      bg: 'bg-error-500/20',
      text: 'text-error-600 dark:text-error-400',
      label: 'Failed'
    },
    deprecated: {
      bg: 'bg-neutral-500/20',
      text: 'text-neutral-500 dark:text-neutral-400 line-through',
      label: 'Deprecated'
    }
  };

  const config = $derived(statusConfig[status] || statusConfig.draft);
</script>

<span
  class="px-2 py-1 text-xs rounded-full border font-bold uppercase {config.bg} {config.text} border-current/30 {className}"
>
  {config.label}
</span>
