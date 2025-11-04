<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  interface Props extends HTMLInputAttributes {
    label?: string;
    error?: string;
    helperText?: string;
    class?: string;
  }

  let {
    label,
    error,
    helperText,
    type = 'text',
    class: className = '',
    value,
    ...props
  }: Props = $props();

  let inputValue = $state<string | number | undefined>(value);

  export { inputValue as value };

  $effect(() => {
    inputValue = value;
  });
</script>

<div class="w-full">
  {#if label}
    <label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
      {label}
    </label>
  {/if}
  <input
    {type}
    bind:value={inputValue}
    class="w-full rounded-xl border-2 {error
      ? 'border-error-500 focus-visible:ring-error-500 focus-visible:border-error-500'
      : 'border-neutral-300 dark:border-neutral-700 focus-visible:ring-primary-500 focus-visible:border-primary-500'} bg-white dark:bg-neutral-800 px-4 py-3 text-sm text-neutral-950 dark:text-white transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 {className}"
    {...props}
  />
  {#if error}
    <p class="mt-1.5 text-sm text-error-600 dark:text-error-400">{error}</p>
  {:else if helperText}
    <p class="mt-1.5 text-sm text-neutral-700 dark:text-neutral-300">{helperText}</p>
  {/if}
</div>
