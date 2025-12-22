<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    hideCloseButton?: boolean;
    children?: import('svelte').Snippet;
    /** Z-index level for the modal (default: 100) */
    zIndex?: number;
    /** Use portal to render at document.body (useful for nested modals) */
    usePortal?: boolean;
  }

  let {
    isOpen = $bindable(),
    onClose,
    title,
    size = 'lg',
    hideCloseButton = false,
    children,
    zIndex = 100,
    usePortal = false
  }: Props = $props();

  let modalRef: HTMLDivElement;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw]',
  };

  // Portal action to teleport element to document.body
  function portal(node: HTMLElement) {
    if (!usePortal) return;
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    };
  }

  $effect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
      };
    }
  });
</script>

{#if isOpen}
  <div use:portal class="fixed top-0 left-0 right-0 bottom-0 flex items-center justify-center" style="margin: 0; padding: 1rem; z-index: {zIndex};">
    <!-- Backdrop -->
    <button
      type="button"
      class="absolute top-0 left-0 right-0 bottom-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm focus:outline-none"
      onclick={onClose}
      aria-label="Close modal overlay"
      style="margin: 0; padding: 0;"
    />

    <!-- Modal -->
    <div
      bind:this={modalRef}
      class="relative w-full {sizeClasses[size]} max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-2xl"
      style="margin: 0;"
    >
      <!-- Header -->
      {#if title}
        <div class="border-b border-neutral-200 dark:border-neutral-700 px-6 py-4">
          <div class="flex items-center justify-between">
            <h2 class="text-2xl font-semibold text-neutral-950 dark:text-white">{title}</h2>
            {#if !hideCloseButton}
              <button
                onclick={onClose}
                class="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                aria-label="Close modal"
              >
                <svg
                  class="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Content -->
      <div class="overflow-y-auto max-h-[calc(90vh-80px)] px-6 py-6">
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}
