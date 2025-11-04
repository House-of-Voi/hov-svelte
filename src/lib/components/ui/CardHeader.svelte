<script lang="ts">
  interface Props {
    class?: string;
    children?: import('svelte').Snippet;
  }

  let { class: className = '', children }: Props = $props();
</script>

<div class="p-6 border-b border-neutral-200 dark:border-neutral-700 {className}">
  {@render children?.()}
</div>
