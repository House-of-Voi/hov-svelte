<script lang="ts">
	// Fullscreen layout for testing page - resets layout stack to skip parent layouts
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
</style>
