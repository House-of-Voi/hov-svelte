<script lang="ts">
  type TabId = 'queue' | 'leaderboard' | 'stats' | 'staking' | 'about';

  interface Props {
    activeTab?: TabId;
    onTabChange?: (tabId: TabId) => void;
  }

  let { activeTab = 'queue', onTabChange }: Props = $props();

  const tabs: { id: TabId; label: string }[] = [
    { id: 'queue', label: 'Queue' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'stats', label: 'Stats' },
    { id: 'staking', label: 'Staking' },
    { id: 'about', label: 'About' },
  ];

  function handleTabClick(tabId: TabId) {
    onTabChange?.(tabId);
  }
</script>

<div class="w-full overflow-x-auto scrollbar-hide">
  <div class="flex gap-2 min-w-max">
    {#each tabs as tab (tab.id)}
      <button
        type="button"
        onclick={() => handleTabClick(tab.id)}
        class="h-8 px-2 flex items-center justify-center rounded-full border-2 text-base font-bold text-white capitalize transition-colors
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
