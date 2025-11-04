<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    tokenSymbol: string;
    action: 'deposit' | 'withdraw';
  }

  let {
    isOpen = false,
    onClose,
    tokenSymbol = '',
    action = 'deposit'
  }: Props = $props();

  const actionText = $derived(action === 'deposit' ? 'Deposit' : 'Withdraw');
</script>

<Modal {isOpen} {onClose}>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div class="text-center">
      <div class="text-4xl mb-4">🔄</div>
      <h2 class="text-2xl font-black text-warning-500 dark:text-warning-400 uppercase">
        {actionText} {tokenSymbol}
      </h2>
      <p class="text-neutral-600 dark:text-neutral-400 mt-2">Coming Soon!</p>
    </div>

    <!-- Content -->
    <div class="bg-warning-500/10 border border-warning-500/30 rounded-xl p-6 space-y-4">
      <div class="text-center">
        <p class="text-neutral-700 dark:text-neutral-300 mb-4">
          This feature will allow you to {action === 'deposit' ? 'convert USDC to' : 'convert'} {tokenSymbol}
          {action === 'withdraw' ? ' to USDC' : ''} seamlessly.
        </p>

        <div class="inline-flex items-center gap-3 px-6 py-3 bg-neutral-100 dark:bg-neutral-900/50 rounded-lg border border-warning-500/20">
          <span class="font-mono font-bold text-primary-600 dark:text-primary-400">
            {action === 'deposit' ? 'USDC' : tokenSymbol}
          </span>
          <span class="text-2xl text-warning-500 dark:text-warning-400">→</span>
          <span class="font-mono font-bold text-accent-600 dark:text-accent-400">
            {action === 'deposit' ? tokenSymbol : 'USDC'}
          </span>
        </div>
      </div>

      <div class="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
        <p class="flex items-start gap-2">
          <span class="text-warning-500 dark:text-warning-400">✓</span>
          <span>Automatic swapping using on-chain DEX</span>
        </p>
        <p class="flex items-start gap-2">
          <span class="text-warning-500 dark:text-warning-400">✓</span>
          <span>Best rates guaranteed</span>
        </p>
        <p class="flex items-start gap-2">
          <span class="text-warning-500 dark:text-warning-400">✓</span>
          <span>Instant transfers to your wallet</span>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div class="text-center">
      <button
        onclick={onClose}
        class="px-8 py-3 bg-gradient-to-r from-warning-500 to-warning-600 text-white font-black uppercase tracking-wide rounded-xl hover:from-warning-400 hover:to-warning-500 transition-all"
      >
        Got It
      </button>
      <p class="text-xs text-neutral-600 dark:text-neutral-500 mt-4">
        We're working hard to bring you this feature. Stay tuned!
      </p>
    </div>
  </div>
</Modal>
