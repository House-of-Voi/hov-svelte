<script lang="ts">
	// Fullscreen layout for W2W game - resets layout stack to skip parent layouts
</script>

<slot />

<style>
	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
		width: 100%;
		height: 100vh;
	}

	:global(#app) {
		margin: 0;
		padding: 0;
		width: 100%;
		height: 100vh;
		overflow: hidden;
	}
</style>
