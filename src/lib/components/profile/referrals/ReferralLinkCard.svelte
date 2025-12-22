<script lang="ts">
  import { notificationStore } from '$lib/stores/notificationStore.svelte';

  interface Props {
    code: string | null;
    loading?: boolean;
    canGenerateCode?: boolean;
    onCodeGenerated?: () => void;
  }

  let { code, loading = false, canGenerateCode = false, onCodeGenerated }: Props = $props();

  let isGenerating = $state(false);

  const referralUrl = $derived(code ? `houseofvoi.com/ref/${code}` : null);

  async function copyToClipboard() {
    if (!referralUrl) return;

    try {
      await navigator.clipboard.writeText(`https://${referralUrl}`);
      notificationStore.success('Referral link copied to clipboard!');
    } catch {
      notificationStore.error('Failed to copy to clipboard');
    }
  }

  async function generateCode() {
    if (isGenerating) return;

    isGenerating = true;
    try {
      const response = await fetch('/api/referrals/create', {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok) {
        notificationStore.error(data.error || 'Failed to create referral code');
        return;
      }

      notificationStore.success('Referral code created!');
      onCodeGenerated?.();
    } catch (err) {
      console.error('Error creating code:', err);
      notificationStore.error('Failed to create referral code');
    } finally {
      isGenerating = false;
    }
  }
</script>

<div class="border border-white/15 rounded-2xl p-4 flex flex-col gap-2 w-full">
  {#if loading}
    <div class="flex gap-2 items-center w-full animate-pulse">
      <div class="flex-1 h-5 bg-white/10 rounded"></div>
      <div class="size-6 bg-white/10 rounded"></div>
    </div>
  {:else if code && referralUrl}
    <div class="flex gap-2 items-center w-full">
      <p class="flex-1 text-base font-medium text-white overflow-hidden overflow-ellipsis whitespace-nowrap">
        {referralUrl}
      </p>
      <button
        type="button"
        onclick={copyToClipboard}
        class="shrink-0 text-white hover:text-white/80 transition-colors"
        aria-label="Copy referral link"
      >
        <svg class="size-6" viewBox="0 0 24 24" fill="none">
          <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2" />
          <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  {:else}
    <div class="flex gap-2 items-center w-full">
      <p class="flex-1 text-sm text-white/70">
        No referral code available
      </p>
      {#if canGenerateCode}
        <button
          type="button"
          onclick={generateCode}
          disabled={isGenerating}
          class="px-4 py-1.5 bg-[#333] border-2 border-[#808080] rounded-full text-sm font-medium text-white hover:bg-[#404040] transition-colors disabled:opacity-50"
        >
          {isGenerating ? 'Creating...' : 'Generate Code'}
        </button>
      {/if}
    </div>
  {/if}
</div>
