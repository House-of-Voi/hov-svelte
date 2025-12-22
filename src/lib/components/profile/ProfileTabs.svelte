<script lang="ts">
  import type { ProfileTab } from '$lib/types/profile';
  import { PROFILE_TABS } from '$lib/types/profile';

  interface Props {
    activeTab?: ProfileTab;
    onTabChange?: (tabId: ProfileTab) => void;
  }

  let { activeTab = 'portfolio', onTabChange }: Props = $props();

  function handleTabClick(tabId: ProfileTab) {
    onTabChange?.(tabId);
  }
</script>

<div class="w-full overflow-x-auto scrollbar-hide">
  <div class="flex gap-2 min-w-max">
    {#each PROFILE_TABS as tab (tab.id)}
      <button
        type="button"
        onclick={() => handleTabClick(tab.id)}
        class="h-[35px] px-4 py-2 flex items-center justify-center rounded-full border-2 text-base font-bold text-white capitalize transition-colors
          {activeTab === tab.id
            ? 'bg-[#808080] border-[#b2b2b2]'
            : 'bg-[#333] border-[#808080] hover:bg-[#404040]'}"
      >
        {tab.label}
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
