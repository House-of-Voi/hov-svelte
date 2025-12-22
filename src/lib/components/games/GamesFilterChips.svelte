<script lang="ts">
  import ChevronDownIcon from '$lib/components/icons/ChevronDownIcon.svelte';

  interface FilterChip {
    id: string;
    label: string;
    hasDropdown?: boolean;
  }

  interface Props {
    activeFilters?: string[];
    onFilterClick?: (filterId: string) => void;
  }

  let { activeFilters = [], onFilterClick }: Props = $props();

  const chips: FilterChip[] = [
    { id: 'tokens', label: 'All Tokens', hasDropdown: true },
    { id: 'new', label: 'NEW' },
    { id: 'popular', label: 'POPULAR' },
    { id: 'rtp', label: 'RTP' },
    { id: 'slots', label: 'SLOTS' },
    { id: 'roulette', label: 'Roulette' },
  ];

  function handleChipClick(chipId: string) {
    onFilterClick?.(chipId);
  }

  function isActive(chipId: string): boolean {
    return activeFilters.includes(chipId);
  }
</script>

<div class="w-full overflow-x-auto scrollbar-hide">
  <div class="flex gap-2 min-w-max">
    {#each chips as chip (chip.id)}
      <button
        type="button"
        onclick={() => handleChipClick(chip.id)}
        class="h-8 px-2 flex items-center gap-1 bg-[#333] border border-[#808080] rounded-lg text-white text-sm font-medium capitalize whitespace-nowrap transition-colors hover:bg-[#404040] {isActive(chip.id) ? 'bg-[#404040] border-white/30' : ''}"
      >
        <span>{chip.label}</span>
        {#if chip.hasDropdown}
          <ChevronDownIcon size={24} />
        {/if}
      </button>
    {/each}
  </div>
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
