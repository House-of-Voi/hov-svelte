<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	const FULLSCREEN_CLASS = 'fullscreen-game';

	// Apply fullscreen constraints while this layout is mounted only
	onMount(() => {
		if (!browser) return;

		document.documentElement.classList.add(FULLSCREEN_CLASS);
		document.body.classList.add(FULLSCREEN_CLASS);

		return () => {
			document.documentElement.classList.remove(FULLSCREEN_CLASS);
			document.body.classList.remove(FULLSCREEN_CLASS);
		};
	});
</script>

<slot />

<style>
	:global(html.fullscreen-game),
	:global(body.fullscreen-game) {
		margin: 0;
		padding: 0;
		overflow: hidden;
		width: 100%;
		height: 100vh;
	}
</style>
