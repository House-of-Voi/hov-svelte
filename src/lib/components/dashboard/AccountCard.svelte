<script lang="ts">
	/**
	 * AccountCard Component
	 *
	 * Individual account card - clicking the card switches/unlocks the account.
	 * Delete button is a separate click target in the corner.
	 */
	import type { GameAccountInfo } from '$lib/auth/session';

	interface Props {
		account: GameAccountInfo;
		isActive: boolean;
		isUnlocked: boolean;
		balance?: string;
		onCardClick: () => void;
		onRemove: () => void;
	}

	let { account, isActive, isUnlocked, balance, onCardClick, onRemove }: Props = $props();

	function shortAddress(address: string): string {
		return `${address.slice(0, 4)}...${address.slice(-4)}`;
	}

	function getAuthMethodDisplay(): { icon: string; label: string } {
		switch (account.cdpRecoveryMethod) {
			case 'email':
				return { icon: '📧', label: 'Email' };
			case 'sms':
				return { icon: '📱', label: 'SMS' };
			case 'google':
				return { icon: '🔵', label: 'Google' };
			case 'mnemonic':
				return { icon: '🔑', label: 'Mnemonic' };
			default:
				return { icon: '🔐', label: 'CDP' };
		}
	}

	function handleCardClick(e: MouseEvent) {
		// Don't trigger card click if clicking the delete button
		const target = e.target as HTMLElement;
		if (target.closest('.delete-btn')) return;
		onCardClick();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onCardClick();
		}
	}

	const authMethod = $derived(getAuthMethodDisplay());
	const statusLabel = $derived(isActive ? 'Active' : isUnlocked ? 'Ready' : 'Locked');
</script>

<div
	class="relative flex flex-col p-4 rounded-xl border-2 transition-all min-w-[180px] max-w-[220px] flex-shrink-0 cursor-pointer select-none
		{isActive
		? 'border-primary-400 bg-primary-50 dark:border-primary-600 dark:bg-primary-950/30'
		: isUnlocked
			? 'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md'
			: 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 hover:border-warning-300 dark:hover:border-warning-700 hover:shadow-md'}"
	onclick={handleCardClick}
	onkeydown={handleKeyDown}
	role="button"
	tabindex="0"
>
	<!-- Delete button (top right, separate click target) -->
	<button
		onclick={(e) => {
			e.stopPropagation();
			onRemove();
		}}
		class="delete-btn absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-error-100 hover:text-error-600 dark:hover:bg-error-900/50 dark:hover:text-error-400 transition-colors opacity-0 group-hover:opacity-100"
		title="Remove account"
		style="opacity: 1;"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path d="M18 6L6 18M6 6l12 12"></path>
		</svg>
	</button>

	<!-- Status Badge -->
	<div class="flex items-center gap-2 mb-2">
		<span
			class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
				{isActive
				? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
				: isUnlocked
					? 'bg-success-100 dark:bg-success-900/40 text-success-700 dark:text-success-300'
					: 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'}"
		>
			{#if isActive}
				<span class="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse"></span>
			{:else if !isUnlocked}
				<span>🔒</span>
			{/if}
			{statusLabel}
		</span>
	</div>

	<!-- Address -->
	<div class="mb-2">
		<span class="font-mono text-sm font-medium text-neutral-800 dark:text-neutral-200">
			{account.nickname || shortAddress(account.voiAddress)}
		</span>
	</div>

	<!-- Auth method -->
	<div class="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 mb-3">
		<span>{authMethod.icon}</span>
		<span>{authMethod.label}</span>
		{#if account.cdpRecoveryHint}
			<span class="text-neutral-400 truncate max-w-[60px]">({account.cdpRecoveryHint})</span>
		{/if}
	</div>

	<!-- Balance -->
	<div class="mt-auto pt-2 border-t border-neutral-200 dark:border-neutral-700">
		{#if balance !== undefined}
			<span class="text-sm font-semibold text-neutral-900 dark:text-white font-mono">
				{balance}
			</span>
			<span class="text-xs text-neutral-500 ml-1">USDC</span>
		{:else}
			<span class="text-xs text-neutral-400">Loading...</span>
		{/if}
	</div>

	<!-- Click hint -->
	<div class="mt-2 text-center">
		{#if isActive}
			<span class="text-xs text-primary-600 dark:text-primary-400">Current Account</span>
		{:else if isUnlocked}
			<span class="text-xs text-neutral-500">Click to switch</span>
		{:else}
			<span class="text-xs text-warning-600 dark:text-warning-400">Click to unlock</span>
		{/if}
	</div>
</div>
