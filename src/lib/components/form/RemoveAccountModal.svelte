<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';

  interface Props {
    isOpen: boolean;
    address: string;
    onClose: () => void;
    onConfirm: () => void;
  }

  let { isOpen, address, onClose, onConfirm }: Props = $props();
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="w-full max-w-md bg-neutral-900 rounded-xl p-6 border border-neutral-700">
      <h3 class="text-lg font-semibold text-white mb-4">Remove Voi Account</h3>
      
      <div class="space-y-4">
        <div class="bg-warning-900/30 border border-warning-700 rounded-lg p-4">
          <div class="flex items-start gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="text-warning-400 flex-shrink-0 mt-0.5"
            >
              <path d="M12 9v4"></path>
              <path d="M12 17h.01"></path>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            </svg>
            <div class="flex-1">
              <p class="text-warning-200 font-medium mb-2">This action cannot be undone</p>
              <p class="text-warning-300 text-sm">
                Removing this account will stop tracking referrals and achievements associated with this address.
              </p>
            </div>
          </div>
        </div>

        <div class="text-neutral-300 text-sm">
          <p class="font-medium mb-1">Account to remove:</p>
          <p class="font-mono text-xs bg-neutral-800 rounded p-2 break-all">{address}</p>
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-3">
        <Button variant="secondary" size="md" onclick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="md"
          onclick={() => {
            onConfirm();
            onClose();
          }}
          className="bg-error-600 hover:bg-error-700"
        >
          Remove Account
        </Button>
      </div>
    </div>
  </div>
{/if}

