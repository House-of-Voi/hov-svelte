<script lang="ts">
	import { page } from '$app/stores';
	import Button from '$lib/components/ui/Button.svelte';

	let errorMessage = $derived($page.error?.message || 'An unexpected error occurred');

	function handleReset() {
		window.location.reload();
	}

	function handleGoHome() {
		window.location.href = '/';
	}
</script>

<div class="min-h-[60vh] flex items-center justify-center">
	<div
		class="max-w-md w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-8 text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
	>
		<div
			class="w-16 h-16 bg-error-100 dark:bg-error-900/30 rounded-full flex items-center justify-center mx-auto"
		>
			<svg
				class="w-8 h-8 text-error-600 dark:text-error-400"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width={2}
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
		</div>

		<div class="space-y-2">
			<h2 class="text-2xl font-semibold text-neutral-950 dark:text-white">Something went wrong</h2>
			<p class="text-neutral-600 dark:text-neutral-400">{errorMessage}</p>
		</div>

		<div class="flex flex-col sm:flex-row gap-3 justify-center">
			<Button variant="primary" size="md" onclick={handleReset}> Try Again </Button>
			<Button variant="outline" size="md" onclick={handleGoHome}> Go Home </Button>
		</div>
	</div>
</div>
