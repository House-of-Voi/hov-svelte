<script lang="ts">
  interface Props {
    tabName: string;
  }

  let { tabName }: Props = $props();
</script>

<div class="w-full border border-white/15 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 min-h-[200px]">
  <div class="size-16 rounded-full bg-[#333] border-2 border-[#808080] flex items-center justify-center">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" class="text-white/50">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" />
      <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  </div>
  <div class="text-center">
    <h3 class="text-lg font-bold text-white capitalize">{tabName}</h3>
    <p class="text-sm text-white/70 mt-1">Coming Soon</p>
  </div>
</div>
