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

	let { avatarUrl, displayName, email, onEditAvatar, onEditProfile }: Props = $props();

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
