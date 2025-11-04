<script lang="ts">
	import { GENERIC_AVATARS } from '$lib/utils/genericAvatars';

	interface Props {
		selectedAvatarId?: string | null;
		onSelect: (avatarId: string) => void;
	}

	let { selectedAvatarId, onSelect }: Props = $props();

	let hoveredId = $state<string | null>(null);
</script>

<div class="space-y-4">
	<div class="grid grid-cols-4 gap-3">
		{#each GENERIC_AVATARS as avatar (avatar.id)}
			{@const isSelected = selectedAvatarId === avatar.id}
			{@const isHovered = hoveredId === avatar.id}

			<button
				type="button"
				onclick={() => onSelect(avatar.id)}
				onmouseenter={() => (hoveredId = avatar.id)}
				onmouseleave={() => (hoveredId = null)}
				class="relative aspect-square rounded-xl overflow-hidden transition-all duration-200 {isSelected
					? 'ring-4 ring-gold-500 scale-105 shadow-lg shadow-gold-500/50'
					: 'ring-2 ring-gold-500/30 hover:ring-gold-500/50 hover:scale-105'}"
				title={avatar.description}
			>
				<div
					class="w-full h-full flex items-center justify-center text-5xl"
					style="background: linear-gradient(135deg, {avatar.gradient.from} 0%, {avatar.gradient
						.to} 100%)"
				>
					{avatar.emoji}
				</div>

				<!-- Selected indicator -->
				{#if isSelected}
					<div class="absolute top-1 right-1 bg-gold-500 rounded-full p-1">
						<svg class="w-4 h-4 text-neutral-950" fill="currentColor" viewBox="0 0 20 20">
							<path
								fill-rule="evenodd"
								d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
				{/if}

				<!-- Hover overlay with name -->
				{#if isHovered}
					<div class="absolute inset-0 bg-black/60 flex items-center justify-center">
						<div class="text-center">
							<p class="text-white font-bold text-sm">{avatar.name}</p>
						</div>
					</div>
				{/if}
			</button>
		{/each}
	</div>
</div>
