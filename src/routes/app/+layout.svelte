<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import OnboardingModal from '$lib/components/form/OnboardingModal.svelte';
	import GameAccountActivationBanner from '$lib/components/gameAccounts/GameAccountActivationBanner.svelte';
	import ActivateGameAccount from '$lib/components/gameAccounts/ActivateGameAccount.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();

	// State for onboarding modal
	let showOnboardingModal = $state(data.needsOnboarding);

	// State for game account activation
	let showActivationModal = $state(false);

	// Handle onboarding completion
	function handleOnboardingComplete() {
		showOnboardingModal = false;
		// Force a full page reload to update the session with the new display name
		window.location.reload();
	}

	// Handle activation banner click
	function handleActivate() {
		showActivationModal = true;
	}

	// Handle activation success
	async function handleActivationSuccess() {
		showActivationModal = false;
		// Refresh data to update game account status
		await invalidateAll();
	}

	// Handle activation modal close
	function handleActivationClose() {
		showActivationModal = false;
	}

	// Derived: should show activation banner
	const showActivationBanner = $derived(
		!data.hasGameAccount && !showOnboardingModal && !showActivationModal
	);
</script>

{#if showOnboardingModal}
	<OnboardingModal
		isOpen={true}
		email={data.primaryEmail}
		onComplete={handleOnboardingComplete}
	/>
{/if}

{#if showActivationModal}
	<Modal isOpen={true} onClose={handleActivationClose} title="">
		<ActivateGameAccount
			email={data.primaryEmail || ''}
			onSuccess={handleActivationSuccess}
			onCancel={handleActivationClose}
			showCard={false}
		/>
	</Modal>
{/if}

<div class="space-y-8">
	{#if showActivationBanner}
		<GameAccountActivationBanner
			email={data.primaryEmail}
			onActivate={handleActivate}
		/>
	{/if}

	{@render children()}
</div>
