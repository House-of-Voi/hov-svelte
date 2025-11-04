<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import AvatarSelector, { type AvatarSelection } from './AvatarSelector.svelte';
	import { generateAvatarDataUrl, GENERIC_AVATARS } from '$lib/utils/genericAvatars';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		currentAvatarUrl?: string | null;
		onUploadSuccess: (url: string) => void;
		onUploadError: (error: string) => void;
		onDelete?: () => void;
	}

	let {
		isOpen,
		onClose,
		currentAvatarUrl,
		onUploadSuccess,
		onUploadError,
		onDelete
	}: Props = $props();

	let avatarSelection = $state<AvatarSelection | null>(null);
	let isUploading = $state(false);

	async function handleSave() {
		if (!avatarSelection) return;

		isUploading = true;

		try {
			if (avatarSelection.mode === 'generic' && avatarSelection.genericAvatarId) {
				// Generate the data URL for the generic avatar
				const avatar = GENERIC_AVATARS.find((a) => a.id === avatarSelection.genericAvatarId);
				if (!avatar) {
					onUploadError('Selected avatar not found');
					isUploading = false;
					return;
				}

				const dataUrl = generateAvatarDataUrl(avatar);

				// Convert data URL to blob and upload
				const response = await fetch(dataUrl);
				const blob = await response.blob();

				const formData = new FormData();
				formData.append('avatar', blob, `${avatar.id}.svg`);

				const uploadResponse = await fetch('/api/profile/avatar', {
					method: 'POST',
					body: formData
				});

				const result = await uploadResponse.json();

				if (uploadResponse.ok && result.success) {
					onUploadSuccess(result.data.avatar_url);
					avatarSelection = null;
					onClose();
				} else {
					onUploadError(result.error || 'Upload failed');
				}
			} else if (avatarSelection.mode === 'upload' && avatarSelection.uploadedFile) {
				// TODO: Replace with proper cropping using Cropper.js or svelte-easy-crop
				// For now, upload the file directly
				const formData = new FormData();
				formData.append('avatar', avatarSelection.uploadedFile, 'avatar.webp');

				const uploadResponse = await fetch('/api/profile/avatar', {
					method: 'POST',
					body: formData
				});

				const result = await uploadResponse.json();

				if (uploadResponse.ok && result.success) {
					onUploadSuccess(result.data.avatar_url);
					avatarSelection = null;
					onClose();
				} else {
					onUploadError(result.error || 'Upload failed');
				}
			}
		} catch (error) {
			console.error('Upload error:', error);
			onUploadError('Failed to upload avatar. Please try again.');
		} finally {
			isUploading = false;
		}
	}

	function handleCancel() {
		avatarSelection = null;
		onClose();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget && !isUploading) {
			handleCancel();
		}
	}

	function handleOverlayKeyDown(event: KeyboardEvent) {
		if (!isUploading && (event.key === 'Enter' || event.key === ' ')) {
			event.preventDefault();
			handleCancel();
		}

		if (event.key === 'Escape' && !isUploading) {
			event.stopPropagation();
			handleCancel();
		}
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 bg-neutral-900/50 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
		onclick={handleBackdropClick}
		onkeydown={handleOverlayKeyDown}
		role="button"
		aria-label="Close avatar editor"
		tabindex="0"
	>
		<div
			class="bg-white dark:bg-neutral-900 rounded-xl border-2 border-warning-300 dark:border-warning-500/30 max-w-lg w-full p-6 space-y-6"
			role="dialog"
			aria-modal="true"
			aria-labelledby="avatar-modal-title"
		>
			<div class="flex items-center justify-between">
				<h3
					id="avatar-modal-title"
					class="text-2xl font-bold text-warning-500 dark:text-warning-400 uppercase"
				>
					{currentAvatarUrl ? 'Change Avatar' : 'Upload Avatar'}
				</h3>
				<button
					onclick={handleCancel}
					disabled={isUploading}
					class="text-neutral-600 dark:text-neutral-400 hover:text-warning-500 dark:hover:text-warning-400 transition-colors text-2xl leading-none"
				>
					×
				</button>
			</div>

			<!-- Unified Avatar Selector -->
			<AvatarSelector
				onSelectionChange={(selection) => (avatarSelection = selection)}
				allowCustomUpload={true}
				allowGenericAvatars={true}
			/>

			<!-- Action Buttons -->
			<div class="flex gap-3 pt-4 border-t border-neutral-300 dark:border-neutral-700">
				<Button
					variant="primary"
					size="md"
					onclick={handleSave}
					disabled={isUploading || !avatarSelection}
					class="flex-1"
				>
					{isUploading ? 'Uploading...' : 'Save Avatar'}
				</Button>
				<Button variant="ghost" size="md" onclick={handleCancel} disabled={isUploading}>
					Cancel
				</Button>
			</div>

			<!-- Delete Avatar Button - shown at bottom if avatar exists -->
			{#if currentAvatarUrl && onDelete}
				<div class="border-t border-neutral-300 dark:border-neutral-700 pt-4">
					<button
						onclick={onDelete}
						class="w-full px-4 py-3 text-sm font-semibold text-error-600 dark:text-error-400 hover:text-error-700 dark:hover:text-error-300 hover:bg-error-50 dark:hover:bg-error-500/10 rounded-lg transition-colors border-2 border-error-300 dark:border-error-500/30 hover:border-error-500 dark:hover:border-error-500/50"
					>
						Delete Current Avatar
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
