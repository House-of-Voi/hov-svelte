<script lang="ts">
  import type { MachineType } from '$lib/types/database';

  interface Props {
    type: MachineType;
    class?: string;
  }

  let { type, class: className = '' }: Props = $props();

  const typeLabels: Record<MachineType, string> = {
    slots_5reel: '5-Reel Slots',
    slots_w2w: 'Ways to Win Slots',
    keno: 'Keno',
    roulette: 'Roulette'
  };

  const label = $derived(typeLabels[type] || type);
</script>

<span
  class="px-2 py-1 text-xs rounded border font-medium bg-primary-500/10 text-primary-600 dark:text-primary-400 border-primary-500/30 {className}"
>
  {label}
</span>
