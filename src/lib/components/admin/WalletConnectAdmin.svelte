<script lang="ts">
	/**
	 * WalletConnectAdmin Component
	 *
	 * Allows admins to connect wallets for deploying machines.
	 * Supports external wallets (Kibisis, etc.) via avm-wallet-svelte.
	 * Returns the connected address for use in deployment.
	 * Includes balance checking to ensure sufficient funds for deployment.
	 */
	import { Web3Wallet, connectedWallets, signTransactions } from 'avm-wallet-svelte';
	import algosdk from 'algosdk';
	import { PUBLIC_WALLETCONNECT_PROJECT_ID, PUBLIC_VOI_NODE_URL } from '$env/static/public';

	interface Props {
		/** Callback when a wallet is selected for deployment */
		onWalletSelected?: (address: string) => void;
		/** Currently selected address */
		selectedAddress?: string;
		/** Error message to display */
		error?: string;
		/** Whether connection is disabled */
		disabled?: boolean;
		/** Minimum required balance in microVOI (optional) */
		minRequiredBalance?: bigint;
	}

	let { onWalletSelected, selectedAddress = '', error = '', disabled = false, minRequiredBalance }: Props = $props();

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
		projectName: 'House of Voi Admin',
		projectDescription: 'Deploy game machines to the blockchain',
		projectUrl: 'https://houseofvoi.com',
		projectIcons: ['https://houseofvoi.com/icon.png']
	};

	// Balance tracking for connected wallets
	let walletBalances = $state<Map<string, bigint>>(new Map());
	let loadingBalances = $state(false);

	function shortAddress(address: string): string {
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	function formatBalance(microVoi: bigint): string {
		return (Number(microVoi) / 1_000_000).toFixed(4);
	}

	async function fetchWalletBalance(address: string): Promise<bigint> {
		try {
			const accountInfo = await algodClient.accountInformation(address).do();
			// Handle both algosdk 2.x and 3.x response formats
			const amount = accountInfo.amount ?? accountInfo['amount'] ?? 0;
			return BigInt(amount);
		} catch (err) {
			console.warn(`Failed to fetch balance for ${address}:`, err);
			return 0n;
		}
	}

	async function refreshBalances() {
		if (!$connectedWallets || $connectedWallets.length === 0) return;

		loadingBalances = true;
		try {
			const newBalances = new Map<string, bigint>();
			await Promise.all(
				$connectedWallets.map(async (wallet) => {
					const balance = await fetchWalletBalance(wallet.address);
					newBalances.set(wallet.address, balance);
				})
			);
			walletBalances = newBalances;
		} finally {
			loadingBalances = false;
		}
	}

	// Refresh balances when wallets change
	$effect(() => {
		if ($connectedWallets && $connectedWallets.length > 0) {
			refreshBalances();
		}
	});

	function selectWallet(address: string) {
		if (disabled) return;

		// Check balance if minimum is specified
		if (minRequiredBalance) {
			const balance = walletBalances.get(address) ?? 0n;
			if (balance < minRequiredBalance) {
				// Allow selection but show warning
				console.warn(`Wallet ${address} has insufficient balance: ${balance} < ${minRequiredBalance}`);
			}
		}

		onWalletSelected?.(address);
	}

	function hasSufficientBalance(address: string): boolean {
		if (!minRequiredBalance) return true;
		const balance = walletBalances.get(address) ?? 0n;
		return balance >= minRequiredBalance;
	}

	const connectedCount = $derived($connectedWallets?.length || 0);
	const hasSelectedWallet = $derived(
		selectedAddress && $connectedWallets?.some((w) => w.address === selectedAddress)
	);
	const selectedWalletBalance = $derived(
		selectedAddress ? walletBalances.get(selectedAddress) ?? 0n : 0n
	);
	const selectedWalletHasSufficientBalance = $derived(
		!minRequiredBalance || selectedWalletBalance >= minRequiredBalance
	);
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
			Deployer Wallet
		</h3>
		{#if connectedCount > 0}
			<span class="text-xs text-success-600 dark:text-success-400 font-medium">
				{connectedCount} connected
			</span>
		{/if}
	</div>

	<!-- Connected Wallets List -->
	{#if $connectedWallets && $connectedWallets.length > 0}
		<div class="space-y-2">
			{#each $connectedWallets as wallet (wallet.address)}
				<button
					type="button"
					onclick={() => selectWallet(wallet.address)}
					disabled={disabled}
					class="w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all {selectedAddress ===
					wallet.address
						? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500'
						: 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-700'}
					{disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
				>
					<div
						class="w-8 h-8 rounded-full flex items-center justify-center {selectedAddress ===
						wallet.address
							? 'bg-primary-500 text-white'
							: 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'}"
					>
						{#if selectedAddress === wallet.address}
							<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
							</svg>
						{:else}
							<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
								/>
							</svg>
						{/if}
					</div>
					<div class="flex-1 text-left">
						<div class="flex items-center gap-2">
							<span class="font-mono text-sm text-neutral-700 dark:text-neutral-300">
								{shortAddress(wallet.address)}
							</span>
							<span class="text-xs text-neutral-500 dark:text-neutral-400">
								{wallet.app}
							</span>
						</div>
						{#if walletBalances.has(wallet.address)}
							{@const balance = walletBalances.get(wallet.address) ?? 0n}
							{@const sufficient = hasSufficientBalance(wallet.address)}
							<div class="flex items-center gap-1 mt-0.5">
								<span class="text-xs {sufficient ? 'text-neutral-500 dark:text-neutral-400' : 'text-warning-500'}">
									{formatBalance(balance)} VOI
								</span>
								{#if !sufficient && minRequiredBalance}
									<span class="text-xs text-warning-500">
										(need {formatBalance(minRequiredBalance)})
									</span>
								{/if}
							</div>
						{:else if loadingBalances}
							<span class="text-xs text-neutral-400">Loading balance...</span>
						{/if}
					</div>
					{#if selectedAddress === wallet.address}
						<span class="text-xs font-medium text-primary-600 dark:text-primary-400">Selected</span>
					{/if}
				</button>
			{/each}
		</div>
	{:else}
		<div class="text-center py-6 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-600">
			<p class="text-neutral-500 dark:text-neutral-400 text-sm mb-3">
				Connect a wallet to deploy machines
			</p>
		</div>
	{/if}

	<!-- Web3Wallet Connect Button -->
	{#if !disabled}
		<div class="avm-wallet-container">
			<Web3Wallet
				{algodClient}
				{availableWallets}
				allowWatchAccounts={false}
				{wcProject}
			/>
		</div>
	{/if}

	{#if error}
		<div class="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg py-2.5 px-3.5 text-sm text-error-600 dark:text-error-400">
			{error}
		</div>
	{/if}

	{#if hasSelectedWallet}
		{#if selectedWalletHasSufficientBalance}
			<div class="bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg py-2.5 px-3.5 text-sm text-success-600 dark:text-success-400">
				<span class="font-medium">Ready to deploy</span> - Transactions will be signed with{' '}
				<span class="font-mono">{shortAddress(selectedAddress)}</span>
			</div>
		{:else}
			<div class="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg py-2.5 px-3.5 text-sm text-warning-600 dark:text-warning-400">
				<span class="font-medium">Insufficient balance</span> - Wallet has{' '}
				<span class="font-mono">{formatBalance(selectedWalletBalance)} VOI</span> but deployment requires{' '}
				<span class="font-mono">{minRequiredBalance ? formatBalance(minRequiredBalance) : '?'} VOI</span>
			</div>
		{/if}
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
