<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		currentAvatarUrl?: string | null;
		onUploadSuccess: (url: string) => void;
		onUploadError: (error: string) => void;
	}

	let { currentAvatarUrl, onUploadSuccess, onUploadError }: Props = $props();

	let selectedImage = $state<File | null>(null);
	let scale = $state(1.2);
	let isUploading = $state(false);
	let isDragging = $state(false);
	let fileInputRef: HTMLInputElement | null = $state(null);
	let canvasRef: HTMLCanvasElement | null = $state(null);

	/**
	 * TODO: Replace with Cropper.js or svelte-easy-crop
	 * This is a placeholder implementation without react-avatar-editor
	 */
	let editorImage = $state<string | null>(null);

	function validateFile(file: File): boolean {
		// Validate file size (2MB)
		if (file.size > 2 * 1024 * 1024) {
			onUploadError('File size must be less than 2MB');
			return false;
		}

		// Validate file type
		const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
		if (!validTypes.includes(file.type)) {
			onUploadError('Please upload a JPG, PNG, or WebP image');
			return false;
		}

		return true;
	}

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		if (validateFile(file)) {
			selectedImage = file;
			// Create preview URL
			const reader = new FileReader();
			reader.onload = (e) => {
				editorImage = e.target?.result as string;
			};
			reader.readAsDataURL(file);
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;

		const file = e.dataTransfer?.files?.[0];
		if (!file) return;

		if (validateFile(file)) {
			selectedImage = file;
			// Create preview URL
			const reader = new FileReader();
			reader.onload = (e) => {
				editorImage = e.target?.result as string;
			};
			reader.readAsDataURL(file);
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
	}

	async function handleUpload() {
		if (!selectedImage) return;

		isUploading = true;

		try {
			// TODO: Implement proper cropping with Cropper.js or svelte-easy-crop
			// For now, we'll upload the original file
			const formData = new FormData();
			formData.append('avatar', selectedImage);

			// Upload to API
			const response = await fetch('/api/profile/avatar', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();

			if (response.ok && result.success) {
				onUploadSuccess(result.data.avatar_url);
				selectedImage = null;
				editorImage = null;
				scale = 1.2;
			} else {
				onUploadError(result.error || 'Upload failed');
			}
		} catch (error) {
			console.error('Upload error:', error);
			onUploadError('Failed to upload avatar. Please try again.');
		} finally {
			isUploading = false;
		}
	}

	function handleCancel() {
		selectedImage = null;
		editorImage = null;
		scale = 1.2;
		if (fileInputRef) {
			fileInputRef.value = '';
		}
	}

	function handleDropZoneClick() {
		fileInputRef?.click();
	}

	function handleDropZoneKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleDropZoneClick();
		}
	}
</script>

<div class="space-y-4">
	<input
		bind:this={fileInputRef}
		type="file"
		accept="image/jpeg,image/png,image/webp"
		onchange={handleFileSelect}
		class="hidden"
		id="avatar-upload"
	/>

	{#if !selectedImage}
		<div
			onclick={handleDropZoneClick}
			ondrop={handleDrop}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			onkeydown={handleDropZoneKeyDown}
			role="button"
			tabindex="0"
			aria-label="Upload avatar by clicking or dragging an image"
			class="cursor-pointer border-2 border-dashed rounded-xl p-8 text-center transition-all {isDragging
				? 'border-gold-500 bg-gold-500/10'
				: 'border-gold-500/30 hover:border-gold-500/50 hover:bg-gold-500/5'}"
		>
			<div class="flex flex-col items-center gap-3">
				<div class="text-4xl">
					{isDragging ? '📥' : '📷'}
				</div>
				<div>
					<p class="text-gold-400 font-semibold">
						{isDragging ? 'Drop image here' : currentAvatarUrl ? 'Change Avatar' : 'Upload Avatar'}
					</p>
					<p class="text-neutral-500 text-sm mt-1">
						Click or drag and drop • JPG, PNG, or WebP • Max 2MB
					</p>
				</div>
			</div>
		</div>
	{:else}
		<div class="space-y-4">
			<div
				class="flex flex-col items-center gap-4 p-6 border-2 border-gold-500/30 rounded-xl bg-neutral-900/50"
			>
				<!-- TODO: Replace with proper avatar editor library (Cropper.js or svelte-easy-crop) -->
				<div class="relative overflow-hidden rounded-full" style="width: 256px; height: 256px;">
					{#if editorImage}
						<img
							src={editorImage}
							alt="Avatar preview"
							class="w-full h-full object-cover"
							style="transform: scale({scale})"
						/>
					{/if}
					<div class="absolute inset-0 border-4 border-gold-500/20 rounded-full pointer-events-none"></div>
				</div>

				<div class="w-full max-w-sm space-y-2">
					<label class="block text-sm font-semibold text-gold-400"> Zoom: {scale.toFixed(1)}x </label>
					<input
						type="range"
						min="1"
						max="3"
						step="0.1"
						bind:value={scale}
						class="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer slider"
					/>
				</div>
			</div>

			<div class="flex gap-3">
				<Button variant="primary" size="md" onclick={handleUpload} disabled={isUploading}>
					{isUploading ? 'Uploading...' : 'Upload Avatar'}
				</Button>
				<Button variant="ghost" size="md" onclick={handleCancel} disabled={isUploading}>
					Cancel
				</Button>
			</div>
		</div>
	{/if}
</div>

<canvas bind:this={canvasRef} class="hidden" />

<style>
	/* Custom slider styles */
	input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #d4af37;
		cursor: pointer;
	}

	input[type='range']::-moz-range-thumb {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #d4af37;
		cursor: pointer;
		border: none;
	}
</style>
