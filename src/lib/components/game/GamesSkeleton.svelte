<script lang="ts">
  /**
   * Loading skeleton components for games page.
   * Uses Tailwind animations for smooth loading states.
   */

  interface Props {
    type: 'stats-card' | 'game-card' | 'winners-table' | 'platform-stats' | 'games-grid' | 'profile-stats';
    count?: number;
  }

  let { type, count = 3 }: Props = $props();
</script>

{#if type === 'stats-card'}
  <div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 animate-pulse">
    <div class="h-4 w-24 bg-neutral-200 dark:bg-neutral-800 rounded mb-2"></div>
    <div class="h-8 w-32 bg-neutral-200 dark:bg-neutral-800 rounded"></div>
  </div>
{:else if type === 'game-card'}
  <div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden animate-pulse">
    <!-- Image placeholder -->
    <div class="aspect-video bg-neutral-200 dark:bg-neutral-800"></div>

    <!-- Content -->
    <div class="p-6 space-y-4">
      <div class="h-6 w-3/4 bg-neutral-200 dark:bg-neutral-800 rounded"></div>
      <div class="h-4 w-full bg-neutral-200 dark:bg-neutral-800 rounded"></div>
      <div class="h-4 w-2/3 bg-neutral-200 dark:bg-neutral-800 rounded"></div>

      <!-- Button placeholder -->
      <div class="h-10 w-full bg-neutral-200 dark:bg-neutral-800 rounded-lg mt-4"></div>
    </div>
  </div>
{:else if type === 'winners-table'}
  <div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
    <div class="p-6 border-b border-neutral-200 dark:border-neutral-800">
      <div class="h-6 w-48 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse"></div>
    </div>

    <div class="divide-y divide-neutral-200 dark:divide-neutral-800">
      {#each Array(5) as _, i (i)}
        <div class="p-4 flex items-center gap-4 animate-pulse" style="animation-delay: {i * 100}ms">
          <div class="h-10 w-10 bg-neutral-200 dark:bg-neutral-800 rounded-full"></div>
          <div class="flex-1 space-y-2">
            <div class="h-4 w-32 bg-neutral-200 dark:bg-neutral-800 rounded"></div>
            <div class="h-3 w-24 bg-neutral-200 dark:bg-neutral-800 rounded"></div>
          </div>
          <div class="h-6 w-20 bg-neutral-200 dark:bg-neutral-800 rounded"></div>
        </div>
      {/each}
    </div>
  </div>
{:else if type === 'platform-stats'}
  <div class="grid grid-cols-1 md:grid-cols-{count} gap-6">
    {#each Array(count) as _ (Math.random())}
      <div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 animate-pulse">
        <div class="h-4 w-24 bg-neutral-200 dark:bg-neutral-800 rounded mb-2"></div>
        <div class="h-8 w-32 bg-neutral-200 dark:bg-neutral-800 rounded"></div>
      </div>
    {/each}
  </div>
{:else if type === 'games-grid'}
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {#each Array(count) as _ (Math.random())}
      <div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden animate-pulse">
        <div class="aspect-video bg-neutral-200 dark:bg-neutral-800"></div>
        <div class="p-6 space-y-4">
          <div class="h-6 w-3/4 bg-neutral-200 dark:bg-neutral-800 rounded"></div>
          <div class="h-4 w-full bg-neutral-200 dark:bg-neutral-800 rounded"></div>
          <div class="h-4 w-2/3 bg-neutral-200 dark:bg-neutral-800 rounded"></div>
          <div class="h-10 w-full bg-neutral-200 dark:bg-neutral-800 rounded-lg mt-4"></div>
        </div>
      </div>
    {/each}
  </div>
{:else if type === 'profile-stats'}
  <div class="bg-gradient-to-br from-primary-500 to-primary-600 dark:from-primary-600 dark:to-primary-700 rounded-xl p-6 text-white animate-pulse">
    <div class="flex items-center justify-between mb-6">
      <div class="h-5 w-32 bg-white/20 rounded"></div>
      <div class="h-8 w-8 bg-white/20 rounded-full"></div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-2">
        <div class="h-3 w-20 bg-white/20 rounded"></div>
        <div class="h-8 w-24 bg-white/20 rounded"></div>
      </div>
      <div class="space-y-2">
        <div class="h-3 w-20 bg-white/20 rounded"></div>
        <div class="h-8 w-24 bg-white/20 rounded"></div>
      </div>
    </div>
  </div>
{/if}
