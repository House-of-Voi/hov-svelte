<script lang="ts">
  interface Props {
    image?: string | null;
    gameName: string;
  }

  let { image, gameName }: Props = $props();
</script>

<div class="relative w-full h-[200px] bg-[#808080] rounded-lg overflow-hidden">
  {#if image}
    <img
      src={image}
      alt={gameName}
      class="w-full h-full object-cover"
    />
    <!-- Gradient overlay for better text visibility if needed -->
    <div class="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>
  {:else}
    <!-- Placeholder with diagonal lines pattern -->
    <div class="absolute inset-0 flex items-center justify-center">
      <div class="text-center">
        <p class="text-[#404040] text-xs font-bold uppercase">game</p>
        <p class="text-[#404040] text-xs font-bold uppercase">Images</p>
      </div>
    </div>
    <!-- Decorative diagonal line -->
    <svg class="absolute inset-0 w-full h-full" preserveAspectRatio="none">
      <line
        x1="0"
        y1="100%"
        x2="100%"
        y2="0"
        stroke="#707070"
        stroke-width="1"
      />
    </svg>
  {/if}
</div>
