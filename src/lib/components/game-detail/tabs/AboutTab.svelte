<script lang="ts">
  interface Props {
    description?: string | null;
    theme?: string | null;
    launchedAt?: string | null;
  }

  let { description, theme, launchedAt }: Props = $props();

  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }
</script>

<div class="w-full border border-white/15 rounded-2xl p-4 flex flex-col gap-4">
  {#if description}
    <div class="flex flex-col gap-2">
      <h3 class="text-base font-bold text-white">Description</h3>
      <p class="text-sm text-white/70 leading-relaxed">{description}</p>
    </div>
  {/if}

  {#if theme}
    <div class="flex flex-col gap-2">
      <h3 class="text-base font-bold text-white">Theme</h3>
      <p class="text-sm text-white/70 capitalize">{theme}</p>
    </div>
  {/if}

  {#if launchedAt}
    <div class="flex flex-col gap-2">
      <h3 class="text-base font-bold text-white">Launch Date</h3>
      <p class="text-sm text-white/70">{formatDate(launchedAt)}</p>
    </div>
  {/if}

  {#if !description && !theme && !launchedAt}
    <div class="text-center text-white/70 py-4">
      No additional information available
    </div>
  {/if}
</div>
