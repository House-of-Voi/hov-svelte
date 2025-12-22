<script lang="ts">
  import ArrowLeftIcon from '$lib/components/icons/ArrowLeftIcon.svelte';
  import ArrowRightIcon from '$lib/components/icons/ArrowRightIcon.svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    showArrows?: boolean;
    showSeeAll?: boolean;
    seeAllHref?: string;
    onScrollLeft?: () => void;
    onScrollRight?: () => void;
  }

  let {
    title,
    showArrows = false,
    showSeeAll = false,
    seeAllHref = '#',
    onScrollLeft,
    onScrollRight
  }: Props = $props();
</script>

<div class="flex items-center justify-between gap-4 w-full">
  <h2 class="text-2xl font-bold text-white capitalize flex-1">
    {title}
  </h2>

  {#if showArrows}
    <div class="flex items-center gap-2">
      <button
        onclick={onScrollLeft}
        class="w-8 h-8 flex items-center justify-center rounded-full bg-[#333] border-2 border-[#808080] text-white hover:bg-[#404040] transition-colors"
        aria-label="Scroll left"
      >
        <ArrowLeftIcon size={16} />
      </button>
      <button
        onclick={onScrollRight}
        class="w-8 h-8 flex items-center justify-center rounded-full bg-[#333] border-2 border-[#808080] text-white hover:bg-[#404040] transition-colors"
        aria-label="Scroll right"
      >
        <ArrowRightIcon size={16} />
      </button>
    </div>
  {/if}

  {#if showSeeAll}
    <a
      href={seeAllHref}
      class="h-8 px-4 flex items-center justify-center rounded-full bg-[#333] border-2 border-[#808080] text-white text-sm font-medium uppercase hover:bg-[#404040] transition-colors"
    >
      See all
    </a>
  {/if}
</div>
