<script lang="ts">
  interface Props {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: import('svelte').Snippet;
  }

  let { title, value, subtitle, icon }: Props = $props();
</script>

<div class="card p-6 transition-all">
  <div class="flex items-start justify-between">
    <div class="flex-1">
      <p class="text-sm text-neutral-700 dark:text-neutral-300 font-medium">{title}</p>
      <p class="mt-3 text-3xl font-semibold text-neutral-950 dark:text-white">{value}</p>
      {#if subtitle}
        <p class="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>
      {/if}
    </div>
    {#if icon}
      <div class="text-primary-500 dark:text-primary-400 bg-primary-50 dark:bg-primary-950 p-3 rounded-xl">
        {@render icon()}
      </div>
    {/if}
  </div>
</div>
