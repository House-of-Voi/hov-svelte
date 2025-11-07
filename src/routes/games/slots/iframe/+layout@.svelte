<script lang="ts">
	// Minimal layout for iframe - resets layout stack to skip parent layouts
</script>

<slot />

<style>
	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: auto;
		width: 100%;
		min-height: 100%;
	}

	:global(#app) {
		margin: 0;
		padding: 0;
		width: 100%;
		min-height: 100%;
	}
</style>

