<script module lang="ts">
	export type AvatarMode = 'none' | 'generic' | 'upload';

	export interface AvatarSelection {
		mode: 'generic' | 'upload';
		genericAvatarId?: string;
		uploadedFile?: File;
		scale?: number;
	}
</script>

<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import GenericAvatarSelector from './GenericAvatarSelector.svelte';

	interface Props {
		onSelectionChange?: (selection: AvatarSelection | null) => void;
		allowCustomUpload?: boolean;
		allowGenericAvatars?: boolean;
	}

	let {
		onSelectionChange,
		allowCustomUpload = true,
		allowGenericAvatars = true
	}: Props = $props();

	let avatarMode = $state<AvatarMode>('none');
	let selectedGenericAvatar = $state<string | null>(null);
	let uploadedImage = $state<File | null>(null);
	let scale = $state(1.2);
	let error = $state<string | null>(null);
	let isDragging = $state(false);
	let editorImage = $state<string | null>(null);

	let fileInputRef: HTMLInputElement | null = $state(null);

	async function compressImage(file: File): Promise<File> {
		// If already small enough, return as-is
		if (file.size <= 2 * 1024 * 1024) {
			return file;
		}

		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				const img = new Image();
				img.onload = () => {
					const canvas = document.createElement('canvas');
					let width = img.width;
					let height = img.height;

					// Scale down if too large (max 2048px on longest side)
					const maxDimension = 2048;
					if (width > maxDimension || height > maxDimension) {
						if (width > height) {
							height = (height / width) * maxDimension;
							width = maxDimension;
						} else {
							width = (width / height) * maxDimension;
							height = maxDimension;
						}
					}

					canvas.width = width;
					canvas.height = height;

					const ctx = canvas.getContext('2d');
					ctx?.drawImage(img, 0, 0, width, height);

					canvas.toBlob(
						(blob) => {
							if (blob) {
								const compressedFile = new File([blob], file.name, {
									type: 'image/jpeg',
									lastModified: Date.now()
								});
								resolve(compressedFile);
							} else {
								resolve(file); // Fallback to original
							}
						},
						'image/jpeg',
						0.85 // 85% quality
					);
				};
				img.src = e.target?.result as string;
			};
			reader.readAsDataURL(file);
		});
	}

	async function handleFileSelect(file: File) {
		// Validate file type
		const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
		if (!validTypes.includes(file.type)) {
			error = 'Please upload a valid image file (JPG, PNG, WebP, or GIF)';
			return;
		}

		// Compress if needed
		const processedFile = await compressImage(file);
		uploadedImage = processedFile;
		avatarMode = 'upload';
		selectedGenericAvatar = null;
		error = null;

		// Create preview URL
		const reader = new FileReader();
		reader.onload = (e) => {
			editorImage = e.target?.result as string;
		};
		reader.readAsDataURL(processedFile);

		// Notify parent
		onSelectionChange?.({
			mode: 'upload',
			uploadedFile: processedFile,
			scale
		});
	}

	function handleFileInputChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) handleFileSelect(file);
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;

		const file = e.dataTransfer?.files?.[0];
		if (file) handleFileSelect(file);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
	}

	function handleGenericAvatarSelect(avatarId: string) {
		selectedGenericAvatar = avatarId;
		avatarMode = 'generic';
		uploadedImage = null;
		editorImage = null;
		error = null;

		// Notify parent
		onSelectionChange?.({
			mode: 'generic',
			genericAvatarId: avatarId
		});
	}

	function handleModeSwitch(mode: 'generic' | 'upload') {
		if (mode === 'generic') {
			avatarMode = selectedGenericAvatar ? 'generic' : 'none';
			uploadedImage = null;
			editorImage = null;

			if (selectedGenericAvatar) {
				onSelectionChange?.({
					mode: 'generic',
					genericAvatarId: selectedGenericAvatar
				});
			} else {
				onSelectionChange?.(null);
			}
		} else if (mode === 'upload') {
			avatarMode = 'upload';
			selectedGenericAvatar = null;
			onSelectionChange?.(null);
		}
	}

	function handleScaleChange(newScale: number) {
		scale = newScale;

		// Update parent with new scale
		if (avatarMode === 'upload' && uploadedImage) {
			onSelectionChange?.({
				mode: 'upload',
				uploadedFile: uploadedImage,
				scale: newScale
			});
		}
	}

	function handleClearUpload() {
		avatarMode = 'none';
		uploadedImage = null;
		editorImage = null;
		if (fileInputRef) fileInputRef.value = '';
		onSelectionChange?.(null);
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

	// If both options are disabled, render nothing
	const shouldRender = allowCustomUpload || allowGenericAvatars;

	// If only one option is available, skip the mode selector
	const showModeSelector = allowCustomUpload && allowGenericAvatars;
</script>

{#if shouldRender}
	<div class="space-y-4">
		<!-- Error display -->
		{#if error}
			<div
				class="p-3 bg-error-100 dark:bg-error-500/20 border border-error-300 dark:border-error-500/30 rounded-lg"
			>
				<p class="text-sm text-error-600 dark:text-error-400">{error}</p>
			</div>
		{/if}

		<!-- Tab selector - only show if both options are enabled -->
		{#if showModeSelector}
			<div class="flex bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1">
				<button
					onclick={() => handleModeSwitch('generic')}
					class="flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 {avatarMode ===
						'generic' || avatarMode === 'none'
						? 'bg-white dark:bg-neutral-700 text-warning-600 dark:text-warning-400 shadow-sm'
						: 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}"
				>
					Choose Preset
				</button>
				<button
					onclick={() => handleModeSwitch('upload')}
					class="flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 {avatarMode ===
					'upload'
						? 'bg-white dark:bg-neutral-700 text-warning-600 dark:text-warning-400 shadow-sm'
						: 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}"
				>
					Upload Image
				</button>
			</div>
		{/if}

		<input
			bind:this={fileInputRef}
			type="file"
			accept="image/jpeg,image/png,image/webp,image/gif"
			onchange={handleFileInputChange}
			class="hidden"
		/>

		<!-- Generic avatar selector -->
		{#if allowGenericAvatars && (avatarMode === 'none' || avatarMode === 'generic')}
			<GenericAvatarSelector
				selectedAvatarId={selectedGenericAvatar}
				onSelect={handleGenericAvatarSelect}
			/>
		{/if}

		<!-- Upload tab content -->
		{#if allowCustomUpload && avatarMode === 'upload'}
			<div class="space-y-4">
				<!-- Upload drop zone - only show when no image is uploaded -->
				{#if !uploadedImage}
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
							? 'border-warning-500 bg-warning-50 dark:bg-warning-500/10'
							: 'border-warning-300 dark:border-warning-500/30 hover:border-warning-500 dark:hover:border-warning-500/50 hover:bg-warning-50 dark:hover:bg-warning-500/5'}"
					>
						<div class="flex flex-col items-center gap-4">
							<div class="text-4xl">
								{isDragging ? '📥' : '📷'}
							</div>
							<div>
								<p class="text-warning-500 dark:text-warning-400 font-bold text-lg">
									{isDragging ? 'Drop image here' : 'Choose an image'}
								</p>
								<p class="text-neutral-600 dark:text-neutral-400 text-sm mt-2">
									Click to browse or drag and drop
								</p>
								<p class="text-neutral-600 dark:text-neutral-500 text-xs mt-1">
									JPG, PNG, WebP, or GIF • Max 2MB
								</p>
							</div>
						</div>
					</div>
				{/if}

				<!-- Image editor - show when image is uploaded -->
				{#if uploadedImage && editorImage}
					<div class="space-y-4">
						<div
							class="flex flex-col items-center gap-4 p-4 border-2 border-warning-300 dark:border-warning-500/30 rounded-xl bg-neutral-100 dark:bg-neutral-900/50"
						>
							<!-- TODO: Replace with proper avatar editor library (Cropper.js or svelte-easy-crop) -->
							<div class="relative overflow-hidden rounded-full" style="width: 200px; height: 200px;">
								<img
									src={editorImage}
									alt="Avatar preview"
									class="w-full h-full object-cover"
									style="transform: scale({scale})"
								/>
								<div
									class="absolute inset-0 border-4 border-warning-500/20 rounded-full pointer-events-none"
								></div>
							</div>

							<div class="w-full space-y-2">
								<label for="scale-input" class="block text-sm font-semibold text-warning-500 dark:text-warning-400">
									Zoom: {scale.toFixed(1)}x
								</label>
								<input
									type="range"
									min="1"
									max="3"
									step="0.1"
									bind:value={scale}
									oninput={(e) => handleScaleChange(parseFloat((e.target as HTMLInputElement).value))}
									class="w-full h-2 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer"
								/>
							</div>
						</div>

						<Button variant="ghost" size="sm" onclick={handleClearUpload} class="w-full">
							Choose Different Image
						</Button>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Custom slider styles */
	input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #f59e0b;
		cursor: pointer;
	}

	input[type='range']::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #f59e0b;
		cursor: pointer;
		border: none;
	}
</style>
