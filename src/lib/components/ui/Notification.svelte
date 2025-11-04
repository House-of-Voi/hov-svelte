<script lang="ts">
	import { notificationStore, type NotificationType } from '$lib/stores/notificationStore.svelte';
	import { onMount } from 'svelte';

	interface Props {
		id: string;
		type: NotificationType;
		message: string;
	}

	let { id, type, message }: Props = $props();

	let isVisible = $state(false);
	let isExiting = $state(false);

	// Entrance animation
	onMount(() => {
		// Trigger entrance animation
		setTimeout(() => {
			isVisible = true;
		}, 10);
	});

	function handleClose() {
		isExiting = true;
		// Wait for exit animation to complete before removing
		setTimeout(() => {
			notificationStore.remove(id);
		}, 300);
	}

	function handleMouseEnter() {
		notificationStore.pause(id);
	}

	function handleMouseLeave() {
		notificationStore.resume(id);
	}

	// Type-based colors (inline styles for reliability)
	const typeColors = {
		success: { bg: '#22c55e', border: '#4ade80' },
		error: { bg: '#ef4444', border: '#f87171' },
		warning: { bg: '#f97316', border: '#fb923c' },
		info: { bg: '#3b82f6', border: '#60a5fa' }
	};

	// Icons for each type (inline SVG with proper sizing)
	const icons = {
		success: `<svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`,
		error: `<svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`,
		warning: `<svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`,
		info: `<svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
	};

	const color = typeColors[type];
</script>

<div
	role="alert"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	style="
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 12px;
		min-width: 320px;
		max-width: 420px;
		padding: 12px 16px;
		background: {color.bg};
		color: white;
		border-radius: 12px;
		box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.3);
		border: 1px solid {color.border};
		opacity: {isVisible && !isExiting ? '1' : '0'};
		transform: scale({isVisible && !isExiting ? '1' : '0.95'}) translateX({isVisible && !isExiting ? '0' : '16px'});
		transition: all 0.3s ease;
		backdrop-filter: blur(8px);
	"
>
	<!-- Icon -->
	<div style="flex-shrink: 0; padding-top: 2px;">
		{@html icons[type]}
	</div>

	<!-- Message -->
	<div style="flex: 1; font-size: 14px; font-weight: 500; line-height: 1.6;">
		{message}
	</div>

	<!-- Close button -->
	<button
		type="button"
		onclick={handleClose}
		style="flex-shrink: 0; padding: 4px; background: transparent; border: none; color: white; cursor: pointer; opacity: 0.8; transition: opacity 0.2s;"
		onmouseenter={(e) => e.currentTarget.style.opacity = '1'}
		onmouseleave={(e) => e.currentTarget.style.opacity = '0.8'}
		aria-label="Close notification"
	>
		<svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
		</svg>
	</button>
</div>
