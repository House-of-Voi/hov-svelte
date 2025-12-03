<script lang="ts">
	/**
	 * UnlockMnemonicAccount Component
	 *
	 * Modal for re-importing a 25-word Algorand mnemonic to unlock a mnemonic-based
	 * game account. Verifies the derived address matches the expected address before
	 * storing the keys.
	 */
	import { browser } from '$app/environment';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import algosdk from 'algosdk';
	import { storeGameAccountKeys, type GameAccountKeys } from '$lib/auth/gameAccountStorage';

	interface Props {
		/** The expected Voi address to unlock */
		voiAddress: string;
		/** Optional nickname for display */
		nickname?: string | null;
		/** Callback when unlock succeeds */
		onSuccess?: () => void;
		/** Callback when user cancels/closes */
		onClose?: () => void;
		/** Show as modal (with backdrop) or inline */
		modal?: boolean;
		/** Whether modal is open (only used if modal=true) */
		open?: boolean;
		/** Show as card or raw content */
		showCard?: boolean;
	}

	let {
		voiAddress,
		nickname,
		onSuccess,
		onClose,
		modal = false,
		open = true,
		showCard = true
	}: Props = $props();

	// State
	let mnemonic = $state('');
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	// Short address for display
	const shortAddress = $derived(`${voiAddress.slice(0, 6)}...${voiAddress.slice(-4)}`);
	const displayName = $derived(nickname || shortAddress);

	/**
	 * Handle mnemonic submission
	 */
	async function handleSubmit() {
		if (!browser || !mnemonic || mnemonic.trim().split(/\s+/).length < 25) {
			error = 'Enter a valid 25-word Algorand mnemonic';
			return;
		}

		isSubmitting = true;
		error = null;

		try {
			// Derive account from mnemonic
			const { addr, sk } = algosdk.mnemonicToSecretKey(mnemonic.trim());
			// Convert Address type to string for comparison
			const derivedAddress = String(addr);

			// Verify the derived address matches the expected address
			if (derivedAddress !== voiAddress) {
				error = "This mnemonic doesn't match the expected address. Check you're using the correct recovery phrase.";
				// Wipe secret key
				sk.fill(0);
				isSubmitting = false;
				return;
			}

			// Convert secret key to hex string for storage
			const voiPrivateKey = Array.from(sk)
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');

			// Store keys encrypted in localStorage
			const keys: GameAccountKeys = {
				basePrivateKey: '', // Mnemonic accounts don't have a Base/EVM key
				voiPrivateKey,
				baseAddress: '', // No Base address
				voiAddress: derivedAddress,
				storedAt: Date.now()
			};

			await storeGameAccountKeys(keys);

			// Wipe secret key from memory
			sk.fill(0);

			// Update last_unlocked_at on the server
			await fetch('/api/game-accounts', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					voiAddress,
					markUnlocked: true
				})
			});

			// Success!
			onSuccess?.();
		} catch (err) {
			console.error('Unlock mnemonic error:', err);
			if (err instanceof Error && err.message.includes('mnemonic')) {
				error = 'Invalid mnemonic. Please check your recovery phrase.';
			} else {
				error = err instanceof Error ? err.message : 'Failed to unlock account';
			}
		} finally {
			isSubmitting = false;
		}
	}

	function handleClose() {
		mnemonic = '';
		error = null;
		onClose?.();
	}
</script>

{#snippet innerContent()}
	<div class="space-y-6">
		<div class="text-center">
			<div class="mb-4 text-5xl">🔑</div>
			<h3 class="text-xl font-bold text-neutral-800 dark:text-neutral-200">
				Unlock Account
			</h3>
			<p class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
				Re-import your 25-word mnemonic to unlock
			</p>
			<div
				class="mt-3 inline-block rounded-lg bg-neutral-100 px-3 py-2 font-mono text-sm dark:bg-neutral-800"
			>
				{displayName}
			</div>
		</div>

		{#if error}
			<div
				class="rounded-xl border border-error-300 bg-error-100 p-4 text-center text-sm font-semibold text-error-600 dark:border-error-500/30 dark:bg-error-500/20 dark:text-error-400"
			>
				{error}
			</div>
		{/if}

		<div>
			<label class="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
				25-Word Mnemonic
			</label>
			<textarea
				bind:value={mnemonic}
				placeholder="Enter your 25-word Algorand recovery phrase..."
				rows={4}
				disabled={isSubmitting}
				class="w-full rounded-xl border-2 border-neutral-300 bg-white px-4 py-3 font-mono text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-warning-500 focus:outline-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:placeholder:text-neutral-500 dark:focus:border-warning-500"
			></textarea>
			<p class="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
				Your mnemonic is processed locally and never sent to our servers.
			</p>
		</div>

		<div class="space-y-3">
			<Button
				variant="primary"
				size="md"
				onclick={handleSubmit}
				disabled={isSubmitting || mnemonic.trim().split(/\s+/).length < 25}
				loading={isSubmitting}
				class="w-full"
			>
				{isSubmitting ? 'Unlocking...' : 'Unlock Account'}
			</Button>

			<Button
				variant="ghost"
				size="md"
				onclick={handleClose}
				disabled={isSubmitting}
				class="w-full"
			>
				Cancel
			</Button>
		</div>
	</div>
{/snippet}

{#if modal}
	{#if open}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
			<div class="w-full max-w-md">
				{#if showCard}
					<Card glow>
						<CardContent class="p-8">
							{@render innerContent()}
						</CardContent>
					</Card>
				{:else}
					<div class="rounded-xl bg-white p-8 dark:bg-neutral-900">
						{@render innerContent()}
					</div>
				{/if}
			</div>
		</div>
	{/if}
{:else if showCard}
	<Card glow>
		<CardContent class="p-8">
			{@render innerContent()}
		</CardContent>
	</Card>
{:else}
	{@render innerContent()}
{/if}
