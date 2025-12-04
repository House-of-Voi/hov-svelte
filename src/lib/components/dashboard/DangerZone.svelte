<script lang="ts">
	/**
	 * DangerZone Component
	 *
	 * Collapsible section for dangerous account actions like delete.
	 */
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		onDeleteAccount?: () => void;
	}

	let { onDeleteAccount }: Props = $props();

	let isExpanded = $state(false);
	let showDeleteConfirm = $state(false);

	function toggleExpand() {
		isExpanded = !isExpanded;
		if (!isExpanded) {
			showDeleteConfirm = false;
		}
	}

	function handleDeleteClick() {
		showDeleteConfirm = true;
	}

	function handleDeleteConfirm() {
		onDeleteAccount?.();
		showDeleteConfirm = false;
	}

	function handleDeleteCancel() {
		showDeleteConfirm = false;
	}
</script>

<div class="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
	<!-- Collapsible Header -->
	<button
		onclick={toggleExpand}
		class="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors"
	>
		<div class="flex items-center gap-3">
			<span class="text-xl">⚠️</span>
			<span class="font-medium text-neutral-700 dark:text-neutral-300">Account Settings</span>
		</div>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			class="text-neutral-400 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}"
		>
			<polyline points="6 9 12 15 18 9"></polyline>
		</svg>
	</button>

	<!-- Collapsible Content -->
	{#if isExpanded}
		<div class="px-6 pb-6 border-t border-neutral-200 dark:border-neutral-800">
			<div class="pt-4 space-y-4">
				<!-- Delete Account Section -->
				<div
					class="p-4 rounded-lg border-2 border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-950/30"
				>
					<h3 class="font-semibold text-error-700 dark:text-error-300 mb-2">Danger Zone</h3>

					{#if !showDeleteConfirm}
						<p class="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
							Permanently delete your account and all associated data. This action cannot be
							undone.
						</p>
						<Button
							variant="ghost"
							size="md"
							onclick={handleDeleteClick}
							class="!text-error-600 !border-error-300 dark:!border-error-700 hover:!bg-error-100 dark:hover:!bg-error-900/30"
						>
							Delete Account
						</Button>
					{:else}
						<div class="space-y-4">
							<div
								class="p-3 bg-error-100 dark:bg-error-900/50 border border-error-300 dark:border-error-700 rounded-lg"
							>
								<p class="text-sm font-medium text-error-700 dark:text-error-300">
									Are you absolutely sure?
								</p>
								<p class="text-xs text-error-600 dark:text-error-400 mt-1">
									This will permanently delete your profile, all connected wallets, referral codes,
									and game history. This cannot be undone.
								</p>
							</div>

							<div class="flex gap-3">
								<Button variant="ghost" size="sm" onclick={handleDeleteCancel} class="flex-1">
									Cancel
								</Button>
								<Button
									variant="primary"
									size="sm"
									onclick={handleDeleteConfirm}
									class="flex-1 !bg-error-600 hover:!bg-error-700"
								>
									Yes, Delete My Account
								</Button>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
