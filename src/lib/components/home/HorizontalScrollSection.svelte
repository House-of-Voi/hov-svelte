<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    rows?: number;
  }

  let { children, rows = 1 }: Props = $props();

  let scrollContainer: HTMLDivElement | undefined = $state();

  export function scrollLeft() {
    if (scrollContainer) {
      scrollContainer.scrollBy({ left: -240, behavior: 'smooth' });
    }
  }

  export function scrollRight() {
    if (scrollContainer) {
      scrollContainer.scrollBy({ left: 240, behavior: 'smooth' });
    }
  }
</script>

<div
  bind:this={scrollContainer}
  class="flex gap-2 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4"
  style="scroll-snap-type: x mandatory;"
>
  {@render children()}
</div>

<style>
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>
