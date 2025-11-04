<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';

	type Step = 'checking' | 'requesting' | 'preparing' | 'ready' | 'error';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		onComplete: () => void;
		currentStep: Step;
		errorMessage: string;
		isProcessing: boolean;
	}

	let { isOpen, onClose, onComplete, currentStep, errorMessage, isProcessing }: Props = $props();

	function handleRetry() {
		onComplete();
	}

	function handleClose() {
		if (!isProcessing) {
			onClose();
		}
	}
</script>

<Modal isOpen={isOpen} onClose={handleClose} title="Preparing Your Account" size="md">
	<div class="space-y-6">
		<!-- Processing State -->
		{#if currentStep !== 'error' && currentStep !== 'ready'}
			<div class="flex flex-col items-center justify-center py-8 space-y-4">
				<!-- Spinner -->
				<svg class="w-12 h-12 text-purple-500 animate-spin" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
				</svg>

				<div class="text-center space-y-2">
					<p class="text-lg font-medium text-white">Preparing your account for USDC deposits</p>
					<p class="text-sm text-gray-400">This may take up to 15 seconds...</p>
				</div>
			</div>
		{/if}

		<!-- Error State -->
		{#if currentStep === 'error'}
			<div class="space-y-4">
				<div class="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
					<div class="flex items-start gap-3">
						<!-- X Circle SVG -->
						<svg class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 9l-6 6m0-6l6 6"/>
						</svg>
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium text-red-400">Error</p>
							<p class="text-xs text-red-300/80 mt-1">{errorMessage}</p>
						</div>
					</div>
				</div>

				<!-- Retry Button -->
				<button
					onclick={handleRetry}
					class="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
				>
					Try Again
				</button>
			</div>
		{/if}

		<!-- Success State -->
		{#if currentStep === 'ready'}
			<div class="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
				<div class="flex items-start gap-3">
					<!-- Check Circle SVG -->
					<svg class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"/>
					</svg>
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium text-green-400">Account ready!</p>
						<p class="text-xs text-green-300/80 mt-1">Opening deposit window...</p>
					</div>
				</div>
			</div>
		{/if}
	</div>
</Modal>
