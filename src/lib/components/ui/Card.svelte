<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    hover?: boolean;
    glass?: boolean;
    elevated?: boolean;
    glow?: boolean;
    class?: string;
  }

  let {
    hover = false,
    glass = false,
    elevated = false,
    glow = false,
    class: className = '',
    children,
    ...props
  }: Props = $props();

  const baseStyles = 'rounded-2xl transition-all duration-200';

  let cardStyles = $derived(
    glow ? 'card-glow' :
    glass ? 'glass-card' :
    elevated ? 'card-elevated' :
    'card'
  );

  const hoverStyles = hover ? 'hover:shadow-lg hover:border-neutral-300 dark:hover:border-neutral-600 cursor-pointer' : '';
</script>

<div class="{baseStyles} {cardStyles} {hoverStyles} {className}" {...props}>
  {@render children?.()}
</div>
