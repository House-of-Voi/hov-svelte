<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    userEmail: string;
    userName?: string | null;
    onSuccess?: () => void;
  }

  let {
    isOpen,
    onClose,
    userId,
    userEmail,
    userName = null,
    onSuccess,
  }: Props = $props();

  let isDeleting = $state(false);
  let error = $state<string | null>(null);

  async function handleDelete() {
    isDeleting = true;
    error = null;

    try {
      const response = await fetch(`/api/admin/players/${userId}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to deactivate user');
      }

      if (onSuccess) {
        onSuccess();
      }

      onClose();
    } catch (err) {
      console.error('Delete error:', err);
      error = err instanceof Error ? err.message : 'Failed to deactivate user';
    } finally {
      isDeleting = false;
    }
  }

  function handleClose() {
    if (isDeleting) return;
    error = null;
    onClose();
  }
</script>

<Modal isOpen={isOpen} onClose={handleClose} title="Deactivate User" size="md">
  <div class="space-y-4">
    <div class="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700">
      <p class="text-sm text-neutral-600 dark:text-neutral-400 mb-1">User to deactivate:</p>
      <p class="font-semibold text-neutral-900 dark:text-white">{userName || userEmail}</p>
      {#if userName}
        <p class="text-sm text-neutral-600 dark:text-neutral-400">{userEmail}</p>
      {/if}
    </div>

    <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
      <div class="flex gap-3">
        <svg
          class="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div class="flex-1">
          <h4 class="font-semibold text-amber-900 dark:text-amber-200 mb-2">This will deactivate the user account</h4>
          <ul class="text-sm text-amber-800 dark:text-amber-300 space-y-1">
            <li>• User will be logged out of all sessions</li>
            <li>• User will not appear in player lists</li>
            <li>• User data will be preserved in the database</li>
            <li>• This action can be reversed if needed</li>
          </ul>
        </div>
      </div>
    </div>

    {#if error}
      <div class="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg p-4">
        <p class="text-sm text-error-700 dark:text-error-300">{error}</p>
      </div>
    {/if}

    <div class="flex gap-3 pt-4">
      <Button variant="outline" class="flex-1" onclick={handleClose} disabled={isDeleting}>
        Cancel
      </Button>
      <Button
        variant="primary"
        class="flex-1 bg-error-600 hover:bg-error-700 dark:bg-error-600 dark:hover:bg-error-700"
        onclick={handleDelete}
        loading={isDeleting}
        disabled={isDeleting}
      >
        {isDeleting ? 'Deactivating...' : 'Deactivate User'}
      </Button>
    </div>
  </div>
</Modal>
