<script lang="ts">
	/**
	 * ProfileBar Component
	 *
	 * Thin horizontal profile bar for the dashboard.
	 * Shows avatar, display name, email, Voi address, and edit button.
	 */
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		avatarUrl: string | null;
		displayName: string | null;
		email: string;
		voiAddress?: string;
		onEditAvatar: () => void;
		onEditProfile: () => void;
	}

	let { avatarUrl, displayName, email, voiAddress, onEditAvatar, onEditProfile }: Props = $props();

	let copyStatus = $state<string | null>(null);

	function copyAddress() {
		if (!voiAddress) return;
		navigator.clipboard.writeText(voiAddress);
		copyStatus = 'Copied!';
		setTimeout(() => (copyStatus = null), 2000);
	}

	function shortAddress(address: string): string {
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}
</script>

<div
	class="flex items-center justify-between gap-4 p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-xl"
>
	<!-- Left: Avatar + Info -->
	<div class="flex items-center gap-4 min-w-0 flex-1">
		<!-- Avatar -->
		<div class="flex-shrink-0">
			<Avatar
				src={avatarUrl}
				{displayName}
				alt={displayName || email}
				size="md"
				editable={true}
				onEditClick={onEditAvatar}
			/>
		</div>

		<!-- Info -->
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-3 flex-wrap">
				<h2 class="text-lg font-semibold text-neutral-950 dark:text-white truncate">
					{displayName || 'Set your name'}
				</h2>
				<span class="text-neutral-400 hidden sm:inline">|</span>
				<span class="text-sm text-neutral-600 dark:text-neutral-400 truncate">
					{email}
				</span>
			</div>

			<!-- Address row -->
			{#if voiAddress}
				<div class="flex items-center gap-2 mt-1">
					<a
						href="https://block.voi.network/explorer/account/{voiAddress}"
						target="_blank"
						rel="noopener noreferrer"
						class="font-mono text-xs text-neutral-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
					>
						{shortAddress(voiAddress)}
					</a>
					<button
						onclick={copyAddress}
						class="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
						title="Copy address"
					>
						{#if copyStatus}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								class="text-success-500"
							>
								<polyline points="20 6 9 17 4 12"></polyline>
							</svg>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								class="text-neutral-400"
							>
								<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
								<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
							</svg>
						{/if}
					</button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Right: Edit Button -->
	<div class="flex-shrink-0">
		<Button variant="ghost" size="sm" onclick={onEditProfile}>
			<span class="flex items-center gap-1.5">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
					<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
				</svg>
				<span class="hidden sm:inline">Edit</span>
			</span>
		</Button>
	</div>
</div>
