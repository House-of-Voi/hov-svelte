<script lang="ts">
  interface Props {
    label: string;
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    description?: string;
  }

  let { label, enabled = $bindable(), onChange, description }: Props = $props();

  function handleToggle() {
    enabled = !enabled;
    onChange(enabled);
  }
</script>

<div class="flex items-center justify-between p-4 bg-white dark:bg-neutral-800 rounded-lg border border-warning-200 dark:border-warning-900/20">
  <div class="flex flex-col">
    <span class="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
      {label}
    </span>
    {#if description}
      <span class="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
        {description}
      </span>
    {/if}
  </div>
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    onclick={handleToggle}
    class="{enabled ? 'bg-warning-500' : 'bg-neutral-300 dark:bg-neutral-600'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-warning-500 focus:ring-offset-2 cursor-pointer"
  >
    <span class="sr-only">{label}</span>
    <span
      class="{enabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm"
    />
  </button>
</div>
