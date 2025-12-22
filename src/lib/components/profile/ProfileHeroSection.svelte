<script lang="ts">
  interface Props {
    avatarUrl?: string | null;
    displayName?: string | null;
    voiAddress?: string;
    onEditAvatar?: () => void;
    onEditProfile?: () => void;
  }

  let {
    avatarUrl,
    displayName,
    voiAddress,
    onEditAvatar,
    onEditProfile
  }: Props = $props();

  let imageError = $state(false);
  let copied = $state(false);

  const showImage = $derived(avatarUrl && !imageError);

  // Generate initials from display name
  function getInitials(name?: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  // Truncate address for display (e.g., "django.hov.voi" or truncated hex)
  function truncateAddress(addr?: string): string {
    if (!addr) return '';
    // If it's a .voi name, show it as is
    if (addr.endsWith('.voi')) {
      return addr;
    }
    // Otherwise truncate hex address
    if (addr.length > 16) {
      return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
    }
    return addr;
  }

  async function handleCopy() {
    if (!voiAddress) return;
    try {
      await navigator.clipboard.writeText(voiAddress);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  $effect(() => {
    if (avatarUrl) {
      imageError = false;
    }
  });
</script>

<div class="flex gap-4 items-center w-full">
  <!-- Avatar (80px) -->
  <button
    type="button"
    onclick={onEditAvatar}
    class="relative group shrink-0"
  >
    <div class="size-20 rounded-full bg-[#808080] overflow-hidden flex items-center justify-center">
      {#if showImage}
        <img
          src={avatarUrl}
          alt="Profile avatar"
          class="w-full h-full object-cover"
          onerror={() => (imageError = true)}
        />
      {:else}
        <span class="text-2xl font-bold text-[#404040]">
          {getInitials(displayName)}
        </span>
      {/if}
    </div>
    <!-- Edit overlay on hover -->
    <div class="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
      <svg class="size-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </div>
  </button>

  <!-- Profile Info -->
  <div class="flex flex-col gap-2 flex-1 min-w-0">
    <!-- Label -->
    <p class="text-sm text-white/70 capitalize">ACTIVE PLAYER</p>

    <!-- Name Row -->
    <div class="flex items-center gap-2 w-full">
      <button
        type="button"
        onclick={onEditProfile}
        class="text-2xl font-bold text-white capitalize truncate hover:opacity-80 transition-opacity text-left"
      >
        {displayName || 'Player Profile'}
      </button>
    </div>

    <!-- Address Row -->
    {#if voiAddress}
      <button
        type="button"
        onclick={handleCopy}
        class="flex items-center gap-2 h-[19px] hover:opacity-80 transition-opacity"
      >
        <span class="text-base font-medium text-white capitalize truncate">
          {truncateAddress(voiAddress)}
        </span>
        <svg class="size-6 text-white shrink-0" viewBox="0 0 24 24" fill="none">
          {#if copied}
            <path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          {:else}
            <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2" />
          {/if}
        </svg>
      </button>
    {/if}
  </div>
</div>
