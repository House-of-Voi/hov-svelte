<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	type RecoveryMethod = 'email' | 'sms' | 'google' | 'mnemonic' | null;

	interface Props {
		isOpen: boolean;
		address: string;
		nickname?: string | null;
		recoveryMethod?: RecoveryMethod;
		recoveryHint?: string | null;
		onClose: () => void;
		onLock: () => void;
		onDisconnect: () => void;
	}

	let {
		isOpen,
		address,
		nickname = null,
		recoveryMethod = null,
		recoveryHint = null,
		onClose,
		onLock,
		onDisconnect
	}: Props = $props();

	const shortAddress = $derived(
		address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''
	);

	const displayName = $derived(nickname || shortAddress);

	const recoveryMethodLabel = $derived(() => {
		switch (recoveryMethod) {
			case 'email':
				return recoveryHint ? `email (${recoveryHint})` : 'email';
			case 'sms':
				return recoveryHint ? `phone (${recoveryHint})` : 'phone';
			case 'google':
				return recoveryHint ? `Google (${recoveryHint})` : 'Google';
			case 'mnemonic':
				return 'your recovery phrase';
			default:
				return 'your recovery method';
		}
	});

	function handleLock() {
		onLock();
		onClose();
	}

	function handleDisconnect() {
		onDisconnect();
		onClose();
	}
</script>

<Modal isOpen={isOpen} onClose={onClose} title="Manage Account" size="sm">
	<div class="space-y-5">
		<!-- Account Info -->
		<div class="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700">
			<p class="text-sm text-neutral-600 dark:text-neutral-400 mb-1">Account</p>
			<p class="font-semibold text-neutral-900 dark:text-white">{displayName}</p>
			{#if nickname}
				<p class="text-sm text-neutral-500 dark:text-neutral-400 font-mono">{shortAddress}</p>
			{/if}
		</div>

		<!-- Action Options -->
		<div class="space-y-3">
			<!-- Lock Account Option -->
			<button
				onclick={handleLock}
				class="w-full text-left rounded-xl border-2 border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 transition-all hover:border-amber-400 dark:hover:border-amber-500 hover:shadow-md group"
			>
				<div class="flex gap-4">
					<div class="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-800/50 flex items-center justify-center">
						<svg
							class="w-5 h-5 text-amber-600 dark:text-amber-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width={2}
								d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
							/>
						</svg>
					</div>
					<div class="flex-1 min-w-0">
						<h4 class="font-semibold text-amber-900 dark:text-amber-200 group-hover:text-amber-700 dark:group-hover:text-amber-100">
							Lock Account
						</h4>
						<p class="text-sm text-amber-700 dark:text-amber-300 mt-1">
							Remove keys from this browser. You can unlock later using {recoveryMethodLabel()}.
						</p>
					</div>
				</div>
			</button>

			<!-- Disconnect & Remove Option -->
			<button
				onclick={handleDisconnect}
				class="w-full text-left rounded-xl border-2 border-error-200 dark:border-error-700 bg-error-50 dark:bg-error-900/20 p-4 transition-all hover:border-error-400 dark:hover:border-error-500 hover:shadow-md group"
			>
				<div class="flex gap-4">
					<div class="flex-shrink-0 w-10 h-10 rounded-lg bg-error-100 dark:bg-error-800/50 flex items-center justify-center">
						<svg
							class="w-5 h-5 text-error-600 dark:text-error-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width={2}
								d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
							/>
						</svg>
					</div>
					<div class="flex-1 min-w-0">
						<h4 class="font-semibold text-error-900 dark:text-error-200 group-hover:text-error-700 dark:group-hover:text-error-100">
							Disconnect & Remove
						</h4>
						<p class="text-sm text-error-700 dark:text-error-300 mt-1">
							Permanently remove from your profile. Referrals and achievements will be lost.
						</p>
					</div>
				</div>
			</button>
		</div>

		<!-- Cancel Button -->
		<Button variant="ghost" class="w-full" onclick={onClose}>
			Cancel
		</Button>
	</div>
</Modal>
