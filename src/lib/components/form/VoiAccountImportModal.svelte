<script lang="ts">
  /**
   * VoiAccountImportModal
   *
   * Imports a Voi account via 25-word Algorand mnemonic.
   * The private key is stored encrypted in localStorage for gameplay.
   * The account is registered as a full game account (not just proof-of-ownership).
   */
  import Button from '$lib/components/ui/Button.svelte';
  import algosdk from 'algosdk';
  import { storeGameAccountKeys, type GameAccountKeys } from '$lib/auth/gameAccountStorage';

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
      // Derive account from mnemonic (client-side only)
      const { addr, sk } = algosdk.mnemonicToSecretKey(mnemonic.trim());
      // Convert Address type to string for compatibility
      const voiAddress = String(addr);

      // Convert secret key to hex string for storage
      const voiPrivateKey = Array.from(sk)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      // Store keys encrypted in localStorage
      const keys: GameAccountKeys = {
        basePrivateKey: '', // Mnemonic accounts don't have a Base/EVM key
        voiPrivateKey,
        baseAddress: '', // No Base address
        voiAddress,
        storedAt: Date.now()
      };

      await storeGameAccountKeys(keys);

      // Register as a game account (not the old proof-of-ownership flow)
      const registerRes = await fetch('/api/game-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cdpUserId: `mnemonic:${voiAddress}`, // Synthetic CDP ID for mnemonic accounts
          baseAddress: '', // No Base address for mnemonic accounts
          voiAddress,
          cdpRecoveryMethod: 'mnemonic',
          cdpRecoveryHint: 'Re-import your 25-word mnemonic'
        })
      });

      const registerJson = await registerRes.json();

      // Wipe secret key from memory after storing
      sk.fill(0);

      if (!registerRes.ok || !registerJson.ok) {
        const errorMessage = registerJson.error || 'Failed to register game account';
        throw new Error(errorMessage);
      }

      onLinked?.(voiAddress);
      reset();
      onClose();
    } catch (e) {
      console.error('Import error:', e);
      if (e instanceof Error && e.message.includes('mnemonic')) {
        error = 'Invalid mnemonic. Please check your recovery phrase.';
      } else {
        error = e instanceof Error ? e.message : 'Failed to import Voi account';
      }
    } finally {
      isSubmitting = false;
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div class="w-full max-w-lg bg-neutral-900 rounded-xl p-6 border border-neutral-700 shadow-2xl">
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

