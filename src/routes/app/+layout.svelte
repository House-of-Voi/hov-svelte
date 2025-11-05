<script lang="ts">
	import { onMount } from 'svelte';
	import OnboardingModal from '$lib/components/form/OnboardingModal.svelte';
	import VoiAddressProvider from '$lib/auth/VoiAddressProvider.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();

	// State for onboarding modal
	let showOnboardingModal = $state(data.needsOnboarding);

	// Handle onboarding completion
	function handleOnboardingComplete() {
		showOnboardingModal = false;
		// Force a full page reload to update the session with the new display name
		window.location.reload();
	}
</script>

<!-- VoiAddressProvider automatically establishes Voi session on mount -->
<VoiAddressProvider session={data.session}>
	{#if showOnboardingModal}
		<OnboardingModal
			isOpen={true}
			email={data.primaryEmail}
			onComplete={handleOnboardingComplete}
		/>
	{/if}

	<div class="space-y-8">
		{@render children()}
	</div>
</VoiAddressProvider>
