<script lang="ts">
  import { navigating } from '$app/stores';
  import { browser } from '$app/environment';

  // Show indicator when navigating
  const isNavigating = $derived(browser && $navigating !== null);
</script>

{#if isNavigating}
  <div
    class="fixed top-0 left-0 right-0 z-[100] h-0.5 bg-primary-500/10 dark:bg-primary-400/10 transition-opacity duration-200"
    role="progressbar"
    aria-label="Loading page"
    aria-busy="true"
  >
    <div
      class="h-full bg-gradient-to-r from-primary-500 via-primary-600 to-primary-500 dark:from-primary-400 dark:via-primary-500 dark:to-primary-400 animate-progress shadow-sm shadow-primary-500/50"
    />
  </div>
{/if}

<style>
  @keyframes progress {
    0% {
      transform: translateX(-100%);
      opacity: 0.8;
    }
    50% {
      transform: translateX(0%);
      opacity: 1;
    }
    100% {
      transform: translateX(100%);
      opacity: 0.8;
    }
  }

  .animate-progress {
    animation: progress 1.2s ease-in-out infinite;
    width: 40%;
  }
</style>

