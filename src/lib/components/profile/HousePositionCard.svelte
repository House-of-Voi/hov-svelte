<script lang="ts">
  interface Props {
    name: string;
    description?: string;
    imageUrl?: string;
    bankroll?: string;
    change7d?: string;
    participants?: number;
    age?: string;
    apr?: string;
    onClick?: () => void;
  }

  let {
    name,
    description,
    imageUrl,
    bankroll = '0',
    change7d = '+0%',
    participants = 0,
    age = '0d',
    apr = '0%',
    onClick
  }: Props = $props();

  let imageError = $state(false);
</script>

<div class="border border-white/15 rounded-2xl p-4 flex flex-col gap-4 w-full">
  <!-- Header Row -->
  <div class="flex gap-2 items-center h-12 w-full">
    <!-- Image -->
    <div class="size-12 rounded-full bg-[#808080] overflow-hidden flex items-center justify-center shrink-0">
      {#if imageUrl && !imageError}
        <img
          src={imageUrl}
          alt={name}
          class="w-full h-full object-cover"
          onerror={() => (imageError = true)}
        />
      {:else}
        <span class="text-[10px] font-bold text-[#404040] uppercase">Images</span>
      {/if}
    </div>

    <!-- Name & Description -->
    <div class="flex-1 flex flex-col gap-2 min-w-0">
      <p class="text-base font-medium text-white capitalize truncate">{name}</p>
      {#if description}
        <p class="text-sm text-white/70 capitalize truncate">{description}</p>
      {/if}
    </div>

    <!-- Link Button -->
    {#if onClick}
      <button
        type="button"
        onclick={onClick}
        class="size-8 flex items-center justify-center bg-[#333] border-2 border-[#808080] rounded-full hover:bg-[#404040] transition-colors shrink-0"
        aria-label="View details"
      >
        <svg class="size-6 text-white" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" />
          <path d="M12 8l4 4-4 4M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Bankroll Row -->
  <div class="flex gap-4 items-start w-full">
    <div class="flex-1 flex flex-col gap-1">
      <p class="text-sm text-white/70 capitalize">bankroll</p>
      <p class="text-sm text-white">{bankroll} USDC</p>
    </div>
    <!-- Sparkline placeholder -->
    <div class="flex-1 h-8 flex items-center justify-center">
      <svg class="w-full h-full text-white/30" viewBox="0 0 100 30" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          points="0,25 15,20 30,22 45,15 60,18 75,10 90,12 100,5"
        />
      </svg>
    </div>
  </div>

  <!-- Stats Row -->
  <div class="flex gap-4 items-start w-full">
    <div class="flex flex-col gap-1">
      <p class="text-sm text-white/70 uppercase">7d</p>
      <p class="text-sm text-white capitalize">{change7d}</p>
    </div>
    <div class="flex flex-col gap-1">
      <p class="text-sm text-white/70 capitalize">Participants</p>
      <p class="text-sm text-white">{participants}</p>
    </div>
    <div class="flex-1 flex flex-col gap-1">
      <p class="text-sm text-white/70 capitalize">Age</p>
      <p class="text-sm text-white">{age}</p>
    </div>
    <div class="flex-1 flex flex-col gap-1">
      <p class="text-sm text-white/70 uppercase">Apr</p>
      <p class="text-sm text-white capitalize">{apr}</p>
    </div>
  </div>
</div>
