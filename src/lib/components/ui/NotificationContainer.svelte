<script lang="ts">
	import { notificationStore } from '$lib/stores/notificationStore.svelte';
	import Notification from './Notification.svelte';
</script>

<!-- Fixed container at top-right -->
<div style="position: fixed; top: 16px; right: 16px; z-index: 9999; display: flex; flex-direction: column; gap: 12px;">
	{#each notificationStore.notifications as notification (notification.id)}
		<div style="pointer-events: auto;">
			<Notification
				id={notification.id}
				type={notification.type}
				message={notification.message}
			/>
		</div>
	{/each}
</div>
