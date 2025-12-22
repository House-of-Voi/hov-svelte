<script lang="ts">
  interface Props {
    onPlayDemo?: () => void;
    onRealPlay?: () => void;
    onInvest?: () => void;
    demoDisabled?: boolean;
  }

  let { onPlayDemo, onRealPlay, onInvest, demoDisabled = true }: Props = $props();
</script>

<div class="flex gap-4 items-start w-full">
  <button
    type="button"
    onclick={onPlayDemo}
    disabled={demoDisabled}
    class="flex-1 h-10 flex items-center justify-center px-4 rounded-full bg-[#333] border-2 border-[#808080] text-white text-base font-bold uppercase transition-colors
      {demoDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#404040]'}"
  >
    Play Demo
  </button>
  <button
    type="button"
    onclick={onRealPlay}
    class="flex-1 h-10 flex items-center justify-center px-4 rounded-full bg-[#333] border-2 border-[#808080] text-white text-base font-bold uppercase hover:bg-[#404040] transition-colors"
  >
    Real Play
  </button>
  <button
    type="button"
    onclick={onInvest}
    class="flex-1 h-10 flex items-center justify-center px-4 rounded-full bg-[#333] border-2 border-[#808080] text-white text-base font-bold uppercase hover:bg-[#404040] transition-colors"
  >
    Invest
  </button>
</div>
