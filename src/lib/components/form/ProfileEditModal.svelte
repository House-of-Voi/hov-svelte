<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		currentDisplayName: string | null;
		email: string;
		onSave: (displayName: string) => Promise<void>;
	}

	let { isOpen, onClose, currentDisplayName, email, onSave }: Props = $props();

	let displayName = $state(currentDisplayName || '');
	let isSaving = $state(false);
	let error = $state<string | null>(null);

	let hasChanges = $derived(displayName !== (currentDisplayName || ''));

	async function handleSave() {
		isSaving = true;
		error = null;

		try {
			await onSave(displayName);
			onClose();
		} catch (err) {
			console.error('Failed to save profile:', err);
			error = err instanceof Error ? err.message : 'Failed to save profile';
		} finally {
			isSaving = false;
		}
	}

	function handleClose() {
		if (!isSaving) {
			displayName = currentDisplayName || '';
			error = null;
			onClose();
		}
	}

	// Reset displayName when modal opens or currentDisplayName changes
	$effect(() => {
		if (isOpen) {
			displayName = currentDisplayName || '';
			error = null;
		}
	});
</script>

<Modal {isOpen} onClose={handleClose} title="Edit Profile">
	<div class="space-y-6">
		{#if error}
			<div class="p-3 bg-ruby-500/20 border border-ruby-500/30 rounded-lg">
				<p class="text-sm text-ruby-400">{error}</p>
			</div>
		{/if}

		<Input
			label="Display Name"
			bind:value={displayName}
			placeholder="Your name"
			disabled={isSaving}
		/>

		<Input label="Email" type="email" value={email} disabled placeholder="your@email.com" />

		<div class="flex gap-3 pt-4">
			<Button
				variant="primary"
				size="md"
				onclick={handleSave}
				disabled={isSaving || !hasChanges}
				class="flex-1"
			>
				{isSaving ? 'Saving...' : 'Save Changes'}
			</Button>
			<Button variant="ghost" size="md" onclick={handleClose} disabled={isSaving} class="flex-1">
				Cancel
			</Button>
		</div>
	</div>
</Modal>
