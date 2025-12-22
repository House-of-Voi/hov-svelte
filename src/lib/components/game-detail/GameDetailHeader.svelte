<script lang="ts">
  import HeartIcon from '$lib/components/icons/HeartIcon.svelte';

  interface Props {
    title: string;
    description?: string | null;
    isFavorited?: boolean;
    onFavoriteToggle?: () => void;
  }

  let { title, description, isFavorited = false, onFavoriteToggle }: Props = $props();
</script>

<div class="flex gap-2 items-start w-full">
  <div class="flex-1 flex flex-col gap-2">
    <h1 class="text-2xl font-bold text-white capitalize">
      {title}
    </h1>
    {#if description}
      <p class="text-sm text-white/70 capitalize">
        {description}
      </p>
    {/if}
  </div>
  <button
    type="button"
    onclick={onFavoriteToggle}
    class="size-8 flex items-center justify-center rounded-full bg-[#333] border-2 border-[#808080] text-white hover:bg-[#404040] transition-colors shrink-0"
    aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
  >
    <HeartIcon size={24} filled={isFavorited} />
  </button>
</div>
