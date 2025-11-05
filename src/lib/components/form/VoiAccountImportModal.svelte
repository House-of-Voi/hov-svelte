<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import algosdk from 'algosdk';
  import { buildProofOfOwnershipTransaction } from '$lib/chains/algorand-browser';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onLinked?: (address: string) => void;
  }

  let { isOpen, onClose, onLinked }: Props = $props();

  let mnemonic = $state('');
  let isSubmitting = $state(false);
  let error = $state<string | null>(null);

  function reset() {
    mnemonic = '';
    error = null;
    isSubmitting = false;
  }

  async function handleSubmit() {
    if (!mnemonic || mnemonic.trim().split(/\s+/).length < 25) {
      error = 'Enter a valid 25-word Algorand mnemonic';
      return;
    }

    isSubmitting = true;
    error = null;

    try {
      const challengeRes = await fetch('/api/auth/algorand/challenge');
      const challengeJson = await challengeRes.json();
      if (!challengeRes.ok || !challengeJson.challenge) {
        throw new Error(challengeJson.error || 'Failed to obtain challenge');
      }

      const challenge: string = challengeJson.challenge;

      // Derive account strictly client-side
      const { addr, sk } = algosdk.mnemonicToSecretKey(mnemonic.trim());

      // Build and sign proof transaction
      const proofTxn = buildProofOfOwnershipTransaction(addr, challenge);
      const signed = algosdk.signTransaction(proofTxn, sk);

      // Immediately wipe secret key from memory
      sk.fill(0);

      const signedBase64 = algosdk.bytesToBase64(signed.blob);

      const linkRes = await fetch('/api/auth/algorand/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          algorandAddress: addr,
          signedTransaction: signedBase64,
          challenge,
        }),
      });

      const linkJson = await linkRes.json();
      if (!linkRes.ok || !linkJson.ok) {
        // Prefer message field for detailed error messages, fallback to error
        const errorMessage = linkJson.message || linkJson.error || 'Failed to link Voi account';
        throw new Error(errorMessage);
      }

      onLinked?.(addr);
      reset();
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to link Voi account';
    } finally {
      isSubmitting = false;
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="w-full max-w-lg bg-neutral-900 rounded-xl p-6 border border-neutral-700">
      <div class="flex items-start justify-between">
        <h3 class="text-lg font-semibold text-white">Import Voi Account</h3>
        <button class="text-neutral-400 hover:text-neutral-200" onclick={() => { reset(); onClose(); }}>✕</button>
      </div>

      <p class="text-sm text-neutral-300 mt-3">
        Enter your 25-word Algorand mnemonic to prove ownership. Your mnemonic never leaves your device; we only send a one-time signed proof to the server.
      </p>

      <div class="mt-4">
        <textarea
          class="w-full p-3 rounded-lg bg-neutral-800 border border-neutral-700 text-sm font-mono text-neutral-100"
          rows="4"
          bind:value={mnemonic}
          placeholder="enter 25-word mnemonic here"
        />
      </div>

      {#if error}
        <div class="mt-3 text-sm text-error-400">{error}</div>
      {/if}

      <div class="mt-6 flex justify-end gap-3">
        <Button variant="secondary" size="md" onclick={() => { reset(); onClose(); }}>
          Cancel
        </Button>
        <Button variant="primary" size="md" onclick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Linking…' : 'Link Voi Account'}
        </Button>
      </div>
    </div>
  </div>
{/if}


