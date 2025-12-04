<script lang="ts">
	/**
	 * ExternalWalletConnect Component
	 *
	 * Simple component to connect external wallets via avm-wallet-svelte.
	 * Shows connected wallets and allows connecting new ones.
	 */
	import { Web3Wallet, connectedWallets } from 'avm-wallet-svelte';
	import { houseWallet } from '$lib/stores/houseWallet.svelte';
	import algosdk from 'algosdk';
	import { PUBLIC_WALLETCONNECT_PROJECT_ID, PUBLIC_VOI_NODE_URL } from '$env/static/public';

	// Algorand client configuration for avm-wallet-svelte
	const algodClient = new algosdk.Algodv2(
		'',
		PUBLIC_VOI_NODE_URL || 'https://testnet-api.voi.nodly.io',
		''
	);

	// Available wallets for avm-wallet-svelte
	const availableWallets = ['Kibisis', 'Lute', 'VoiWallet', 'BiatecWallet', 'WalletConnect'];

	// WalletConnect project configuration
	const wcProject = {
		projectId: PUBLIC_WALLETCONNECT_PROJECT_ID || '',
		projectName: 'House of Voi',
		projectDescription: 'Manage your house pool contributions',
		projectUrl: 'https://houseofvoi.com',
		projectIcons: ['https://houseofvoi.com/icon.png']
	};

	function shortAddress(address: string): string {
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	const connectedCount = $derived($connectedWallets?.length || 0);
</script>

<div class="card p-4 md:p-5">
	<div class="flex items-center justify-between mb-3">
		<h3 class="text-sm font-semibold text-neutral-600 dark:text-neutral-400">External Wallets</h3>
		{#if connectedCount > 0}
			<span class="text-xs text-success-600 dark:text-success-400 font-medium">
				{connectedCount} connected
			</span>
		{/if}
	</div>

	<!-- Connected Wallets List -->
	{#if $connectedWallets && $connectedWallets.length > 0}
		<div class="mb-3 space-y-2">
			{#each $connectedWallets as wallet (wallet.address)}
				<div class="flex items-center gap-2 px-3 py-2 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg">
					<span class="text-success-600 dark:text-success-400">✓</span>
					<span class="font-mono text-sm text-neutral-700 dark:text-neutral-300 flex-1">
						{shortAddress(wallet.address)}
					</span>
					<span class="text-xs text-neutral-500 dark:text-neutral-400">{wallet.app}</span>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Web3Wallet Connect Button -->
	<div class="avm-wallet-container">
		<Web3Wallet
			{algodClient}
			{availableWallets}
			allowWatchAccounts={false}
			{wcProject}
		/>
	</div>

	{#if houseWallet.error}
		<div class="mt-3 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg py-2.5 px-3.5 text-sm text-error-600 dark:text-error-400 flex items-center justify-between">
			{houseWallet.error}
			<button onclick={() => houseWallet.clearError()} class="text-error-500 text-lg leading-none hover:text-error-700">×</button>
		</div>
	{/if}
</div>

<style>
	/* AVM Wallet Container - Styling for avm-wallet-svelte component */

	/* Main connect button - override blue-500 with neutral styling */
	.avm-wallet-container :global(.wallet-container > div:first-child) {
		@apply bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg py-2 px-3 text-neutral-900 dark:text-white;
		background-color: rgb(245 245 245) !important;
	}

	.avm-wallet-container :global(.wallet-container > div:first-child:hover) {
		@apply bg-neutral-200 dark:bg-neutral-600 border-primary-300 dark:border-primary-700;
		background-color: rgb(229 229 229) !important;
	}

	/* Override the default blue button text color and alignment */
	.avm-wallet-container :global(.wallet-container > div:first-child span) {
		@apply text-neutral-800 dark:text-white;
		color: rgb(38 38 38) !important;
		text-align: left !important;
		margin-left: 0 !important;
	}

	:global(.dark) .avm-wallet-container :global(.wallet-container > div:first-child) {
		background-color: rgb(64 64 64) !important;
	}

	:global(.dark) .avm-wallet-container :global(.wallet-container > div:first-child:hover) {
		background-color: rgb(82 82 82) !important;
	}

	:global(.dark) .avm-wallet-container :global(.wallet-container > div:first-child span) {
		color: rgb(255 255 255) !important;
	}

	/* Dropdown wallet list box */
	.avm-wallet-container :global(.walletListBox) {
		@apply bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg;
	}

	/* Connect/Disconnect buttons - keep their colored backgrounds visible */
	.avm-wallet-container :global(.wallet-item button.bg-blue-500),
	.avm-wallet-container :global(.wallet-item button.bg-green-500),
	.avm-wallet-container :global(.wallet-item button.bg-red-500) {
		color: white !important;
	}

	/* Wallet item rows - ensure text is visible in light mode */
	.avm-wallet-container :global(.wallet-item) {
		@apply text-neutral-900 dark:text-white;
	}

	/* Wallet name (has font-medium class) */
	.avm-wallet-container :global(.wallet-item .font-medium) {
		color: rgb(23 23 23) !important;
	}

	:global(.dark) .avm-wallet-container :global(.wallet-item .font-medium) {
		color: rgb(255 255 255) !important;
	}

	/* Connected wallet address buttons */
	.avm-wallet-container :global(.wallet-item button.truncate),
	.avm-wallet-container :global(.wallet-item button.flex-grow) {
		@apply text-neutral-700 dark:text-neutral-300;
		color: rgb(64 64 64) !important;
	}

	:global(.dark) .avm-wallet-container :global(.wallet-item button.truncate),
	:global(.dark) .avm-wallet-container :global(.wallet-item button.flex-grow) {
		color: rgb(212 212 212) !important;
	}

	.avm-wallet-container :global(.wallet-item button.truncate:hover),
	.avm-wallet-container :global(.wallet-item button.flex-grow:hover) {
		@apply bg-neutral-100 dark:bg-neutral-700;
	}

	/* Override gray hover backgrounds in wallet list */
	.avm-wallet-container :global(.hover\:bg-gray-100:hover) {
		background-color: rgb(245 245 245) !important;
	}

	:global(.dark) .avm-wallet-container :global(.dark\:hover\:bg-gray-700:hover) {
		background-color: rgb(64 64 64) !important;
	}

	/* Fix text in wallet list that uses dark:text-white without light mode equivalent */
	.avm-wallet-container :global(.dark\:text-white) {
		color: rgb(23 23 23);
	}

	:global(.dark) .avm-wallet-container :global(.dark\:text-white) {
		color: rgb(255 255 255);
	}
</style>
