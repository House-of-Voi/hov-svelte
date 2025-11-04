<script lang="ts">
  interface Props {
    src?: string | null;
    alt?: string;
    displayName?: string | null;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    class?: string;
    editable?: boolean;
    onEditClick?: () => void;
  }

  let {
    src,
    alt = 'User avatar',
    displayName,
    size = 'md',
    class: className = '',
    editable = false,
    onEditClick
  }: Props = $props();

  let imageError = $state(false);

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-base',
    xl: 'w-32 h-32 text-2xl',
  };

  // Generate initials from display name
  function getInitials(name?: string | null): string {
    if (!name) return '?';

    const parts = name.trim().split(' ');
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }

    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  let initials = $derived(getInitials(displayName));
  let showInitials = $derived(!src || imageError);

  // Reset image error when src changes
  $effect(() => {
    if (src) {
      imageError = false;
    }
  });
</script>

{#if editable && onEditClick}
  <div class="relative group inline-block">
    <div
      class="{sizeClasses[size]} relative rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-gold-500/20 to-royal-500/20 border-2 border-gold-500/30 font-bold text-gold-400 {className}"
    >
      {#if showInitials}
        <span>{initials}</span>
      {:else}
        <img
          {src}
          {alt}
          class="w-full h-full object-cover"
          onerror={() => (imageError = true)}
        />
      {/if}
    </div>
    <button
      onclick={onEditClick}
      class="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
      title="Edit avatar"
    >
      <svg
        class="w-1/2 h-1/2 text-gold-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width={2}
          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
        />
      </svg>
    </button>
  </div>
{:else}
  <div
    class="{sizeClasses[size]} relative rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-gold-500/20 to-royal-500/20 border-2 border-gold-500/30 font-bold text-gold-400 {className}"
  >
    {#if showInitials}
      <span>{initials}</span>
    {:else}
      <img
        {src}
        {alt}
        class="w-full h-full object-cover"
        onerror={() => (imageError = true)}
      />
    {/if}
  </div>
{/if}
