<script lang="ts">
	interface Props {
		/** Current mode (0=bonus, 1=credit/free-play, 2=VOI, 4=ARC200) */
		mode: number;
		/** Mode enabled bitmask from contract (0-7) */
		modeEnabled: number;
		/** Available credits (for credit mode) */
		credits?: number;
		/** Available bonus spins (for bonus mode) */
		bonusSpins?: number;
		/** Whether selector is disabled */
		disabled?: boolean;
		/** Callback when mode changes */
		onModeChange: (mode: number) => void;
	}

	let {
		mode,
		modeEnabled = 7,
		credits = 0,
		bonusSpins = 0,
		disabled = false,
		onModeChange
	}: Props = $props();

	const allModes = [
		{ value: 1, label: 'Credit', icon: '💳', description: 'Play with free-play credits' },
		{ value: 2, label: 'VOI', icon: '🌐', description: 'Play with VOI tokens' },
		{ value: 4, label: 'ARC200', icon: '🪙', description: 'Play with ARC200 tokens' }
	];

	/**
	 * Check if a mode is enabled in the contract
	 * modeEnabled is a bitmask: 1=credit (free-play), 2=VOI, 4=ARC200
	 * Bonus mode (0) is not selectable - it's automatic when user has bonus spins
	 */
	function isModeEnabled(modeValue: number): boolean {
		// Check if the bit is set in modeEnabled
		return (modeEnabled & modeValue) === modeValue;
	}

	// Filter modes to only show enabled ones (exclude bonus mode - it's automatic)
	const enabledModes = $derived(
		allModes.filter((m) => isModeEnabled(m.value))
	);

	// Ensure current mode is valid - if not, switch to first available enabled mode
	$effect(() => {
		if (enabledModes.length > 0 && !isModeEnabled(mode) && mode !== 0) {
			// Current mode is not enabled, switch to first available enabled mode
			const firstEnabled = enabledModes.find(m => isModeEnabled(m.value));
			if (firstEnabled) {
				onModeChange(firstEnabled.value);
			}
		}
	});

	function handleModeChange(newMode: number) {
		if (disabled) return;
		onModeChange(newMode);
	}

	function isModeAvailable(modeValue: number): boolean {
		// First check if mode is enabled in contract
		if (!isModeEnabled(modeValue)) {
			return false;
		}
		// Then check user-specific availability
		if (modeValue === 1) return credits > 0;
		// VOI and ARC200 modes always available if enabled
		return true;
	}
</script>

<div class="mode-selector">
	{#if enabledModes.length === 2}
		<!-- Toggle between two modes -->
		{@const mode1 = enabledModes[0]}
		{@const mode2 = enabledModes[1]}
		{@const available1 = isModeAvailable(mode1.value)}
		{@const available2 = isModeAvailable(mode2.value)}
		<div class="mode-toggle">
			<button
				class="mode-toggle-option"
				class:active={mode === mode1.value}
				class:unavailable={!available1}
				onclick={() => handleModeChange(mode1.value)}
				disabled={disabled || !available1}
				title={!available1 ? `Not available` : mode1.description}
			>
				<span class="mode-toggle-icon">{mode1.icon}</span>
				<span class="mode-toggle-label">{mode1.label}</span>
				{#if mode1.value === 1 && credits > 0}
					<span class="mode-toggle-badge">{credits}</span>
				{/if}
			</button>
			<button
				class="mode-toggle-option"
				class:active={mode === mode2.value}
				class:unavailable={!available2}
				onclick={() => handleModeChange(mode2.value)}
				disabled={disabled || !available2}
				title={!available2 ? `Not available` : mode2.description}
			>
				<span class="mode-toggle-icon">{mode2.icon}</span>
				<span class="mode-toggle-label">{mode2.label}</span>
			</button>
		</div>
	{:else}
		<!-- Fallback to buttons if more than 2 modes -->
		<div class="mode-options">
			{#each enabledModes as modeOption}
				{@const available = isModeAvailable(modeOption.value)}
				<button
					class="mode-option"
					class:active={mode === modeOption.value}
					class:unavailable={!available}
					onclick={() => handleModeChange(modeOption.value)}
					disabled={disabled || !available}
					title={!available ? `Not available` : modeOption.description}
				>
					<span class="mode-option-icon">{modeOption.icon}</span>
					<span class="mode-option-label">{modeOption.label}</span>
					{#if modeOption.value === 1 && credits > 0}
						<span class="mode-option-badge">{credits}</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.mode-selector {
		@apply flex flex-col;
	}

	.mode-toggle {
		@apply flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-700 rounded-lg;
		@apply border border-neutral-300 dark:border-neutral-600;
	}

	.mode-toggle-option {
		@apply flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded transition-colors relative;
		@apply text-neutral-700 dark:text-neutral-300 text-sm font-medium;
		@apply disabled:opacity-50 disabled:cursor-not-allowed;
	}

	.mode-toggle-option.active {
		@apply bg-white dark:bg-neutral-800 text-primary-600 dark:text-primary-400 shadow-sm;
	}

	.mode-toggle-option.unavailable {
		@apply opacity-50 cursor-not-allowed;
	}

	.mode-toggle-icon {
		@apply text-base;
	}

	.mode-toggle-label {
		@apply text-xs;
	}

	.mode-toggle-badge {
		@apply absolute -top-1 -right-1 text-xs bg-primary-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold text-[10px];
	}

	.mode-toggle-option.active .mode-toggle-badge {
		@apply bg-primary-600 dark:bg-primary-400 text-white;
	}

	/* Fallback for more than 2 modes */
	.mode-options {
		@apply flex gap-2;
	}

	.mode-option {
		@apply flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 rounded transition-colors;
		@apply border border-neutral-300 dark:border-neutral-600 relative text-neutral-800 dark:text-neutral-200;
		@apply disabled:opacity-50 disabled:cursor-not-allowed text-sm;
	}

	.mode-option.active {
		@apply bg-primary-500 border-primary-400 text-white shadow-sm;
	}

	.mode-option.unavailable {
		@apply opacity-50 cursor-not-allowed;
	}

	.mode-option-icon {
		@apply text-base;
	}

	.mode-option-label {
		@apply text-xs font-medium;
	}

	.mode-option-badge {
		@apply absolute -top-1 -right-1 text-xs bg-primary-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold text-[10px];
	}

	.mode-option.active .mode-option-badge {
		@apply bg-white text-primary-500;
	}
</style>

