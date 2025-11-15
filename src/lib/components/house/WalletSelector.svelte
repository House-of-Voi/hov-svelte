<script lang="ts">
	import { Web3Wallet } from 'avm-wallet-svelte';
	import { houseWallet } from '$lib/stores/houseWallet.svelte';
	import algosdk from 'algosdk';
	import { browser } from '$app/environment';
	import { formatCurrency, truncateAddress } from '$lib/utils/format';
	import { PUBLIC_WALLETCONNECT_PROJECT_ID, PUBLIC_VOI_NODE_URL } from '$env/static/public';

	interface Props {
		voiAddress?: string | null; // CDP-derived Voi address from session
		onSourceChange?: (source: 'cdp' | 'external', address: string) => void;
	}

	let { voiAddress = null, onSourceChange }: Props = $props();

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

	// Initialize CDP wallet when component mounts
	$effect(() => {
		if (voiAddress) {
			houseWallet.initializeCdpWallet(voiAddress);
		}
	});

	// Check linked status when external wallet connects
	$effect(() => {
		if (houseWallet.isExternalConnected && houseWallet.externalWallet) {
			houseWallet.checkExternalWalletLinked('').catch(console.error);
		}
	});

	// Handle source selection
	function handleSourceSelect(source: 'cdp' | 'external') {
		houseWallet.setActiveSource(source);

		const address =
			source === 'cdp' ? houseWallet.cdpAddress : houseWallet.externalWallet?.address;
		if (address && onSourceChange) {
			onSourceChange(source, address);
		}
	}

	// Handle wallet linking
	let isLinking = $state(false);
	let linkSuccess = $state(false);

	async function handleLinkWallet() {
		isLinking = true;
		linkSuccess = false;
		try {
			const success = await houseWallet.linkExternalWallet();
			if (success) {
				linkSuccess = true;
				// Refresh the linked status
				await houseWallet.checkExternalWalletLinked('');

				// Clear success message after 3 seconds
				setTimeout(() => {
					linkSuccess = false;
				}, 3000);
			}
		} catch (error) {
			console.error('Error linking wallet:', error);
		} finally {
			isLinking = false;
		}
	}
</script>

<div class="wallet-selector">
	<div class="selector-header">
		<h3>Select Wallet</h3>
		<p>Choose which wallet to use for deposits and withdrawals</p>
	</div>

	<div class="wallet-options">
		<!-- CDP Wallet Option -->
		<button
			onclick={() => handleSourceSelect('cdp')}
			disabled={!houseWallet.isCdpAvailable}
			class="wallet-card {houseWallet.activeSource === 'cdp' ? 'active' : ''} {!houseWallet.isCdpAvailable
				? 'disabled'
				: ''}"
		>
			<div class="wallet-card-header">
				<div class="wallet-icon">
					<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
						/>
					</svg>
					<span class="wallet-name">CDP Wallet</span>
				</div>
				{#if houseWallet.activeSource === 'cdp'}
					<div class="selected-badge">
						<svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
							<path
								fill-rule="evenodd"
								d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
				{/if}
			</div>

			{#if houseWallet.isCdpAvailable && houseWallet.cdpAddress}
				<div class="wallet-details">
					<div class="wallet-address">{truncateAddress(houseWallet.cdpAddress)}</div>
					<div class="wallet-balance">
						{formatCurrency(Number(houseWallet.cdpBalance))} <span>VOI</span>
					</div>
				</div>
			{:else}
				<div class="wallet-unavailable">Not available</div>
			{/if}
		</button>

		<!-- External Wallet Option -->
		<button
			onclick={() => handleSourceSelect('external')}
			disabled={!houseWallet.isExternalConnected}
			class="wallet-card {houseWallet.activeSource === 'external' ? 'active' : ''} {!houseWallet.isExternalConnected
				? 'disabled'
				: ''}"
		>
			<div class="wallet-card-header">
				<div class="wallet-icon">
					<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
						/>
					</svg>
					<span class="wallet-name">External Wallet</span>
				</div>
				{#if houseWallet.activeSource === 'external'}
					<div class="selected-badge">
						<svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
							<path
								fill-rule="evenodd"
								d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
				{/if}
			</div>

			{#if houseWallet.isExternalConnected && houseWallet.externalWallet}
				<div class="wallet-details">
					<div class="avm-wallet-container">
						<Web3Wallet
							{algodClient}
							{availableWallets}
							allowWatchAccounts={false}
							{wcProject}
						/>
					</div>
					<div class="wallet-provider">
						{houseWallet.externalWallet.provider}
						{#if !houseWallet.externalWallet.isLinked}
							<span class="unlinked-badge">⚠ Not linked</span>
						{/if}
					</div>
					<div class="wallet-balance">
						{formatCurrency(Number(houseWallet.externalBalance))} <span>VOI</span>
					</div>
				</div>
			{:else}
				<div class="wallet-unavailable">Not connected</div>
			{/if}
		</button>
	</div>

	<!-- Link Wallet Prompt -->
	{#if houseWallet.isExternalConnected && houseWallet.externalWallet && !houseWallet.externalWallet.isLinked && !linkSuccess}
		<div class="link-prompt">
			<div class="prompt-icon">
				<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			</div>
			<div class="prompt-content">
				<h4>Link Wallet to Profile</h4>
				<p>
					To use this wallet for deposits and withdrawals, you need to link it to your profile by
					signing a proof-of-ownership message.
				</p>
				<button onclick={handleLinkWallet} disabled={isLinking} class="link-button">
					{#if isLinking}
						<div class="button-spinner"></div>
						<span>Linking...</span>
					{:else}
						<span>Sign & Link Wallet</span>
					{/if}
				</button>
			</div>
		</div>
	{/if}

	<!-- Link Success Message -->
	{#if linkSuccess}
		<div class="success-message">
			<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<div>
				<h4>Wallet Linked Successfully!</h4>
				<p>Your external wallet is now linked to your profile and can be used for house pool operations.</p>
			</div>
		</div>
	{/if}

	<!-- Error Display -->
	{#if houseWallet.error}
		<div class="error-message">
			<div>{houseWallet.error}</div>
			<button onclick={() => houseWallet.clearError()} class="dismiss-button">Dismiss</button>
		</div>
	{/if}
</div>

<style>
	.wallet-selector {
		background: rgba(255, 255, 255, 0.03);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 20px;
		padding: 2rem;
		margin-bottom: 2rem;
	}

	.selector-header {
		margin-bottom: 1.5rem;
	}

	.selector-header h3 {
		font-family: 'Syne', sans-serif;
		font-size: 1.25rem;
		font-weight: 700;
		margin: 0 0 0.5rem 0;
		color: #ffffff;
		letter-spacing: -0.01em;
	}

	.selector-header p {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.6);
		margin: 0;
	}

	/* Wallet Options */
	.wallet-options {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.wallet-card {
		background: rgba(0, 0, 0, 0.2);
		border: 2px solid rgba(255, 255, 255, 0.08);
		border-radius: 16px;
		padding: 1.25rem;
		text-align: left;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.wallet-card:hover:not(.disabled) {
		background: rgba(0, 0, 0, 0.3);
		border-color: rgba(212, 175, 55, 0.3);
		transform: translateY(-2px);
	}

	.wallet-card.active {
		background: linear-gradient(135deg, rgba(212, 175, 55, 0.15) 0%, rgba(212, 175, 55, 0.05) 100%);
		border-color: rgba(212, 175, 55, 0.5);
	}

	.wallet-card.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.wallet-card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.wallet-icon {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		color: rgba(255, 255, 255, 0.9);
	}

	.wallet-icon svg {
		color: #d4af37;
	}

	.wallet-name {
		font-weight: 600;
		font-size: 0.9375rem;
	}

	.selected-badge {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #d4af37;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #0a0d1a;
	}

	.wallet-details {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.wallet-address {
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 0.8125rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.wallet-balance {
		font-family: 'Syne', sans-serif;
		font-size: 1.125rem;
		font-weight: 600;
		color: #10b981;
	}

	.wallet-balance span {
		font-size: 0.875rem;
		color: rgba(16, 185, 129, 0.7);
		margin-left: 0.25rem;
	}

	.wallet-provider {
		font-size: 0.8125rem;
		color: rgba(255, 255, 255, 0.6);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.unlinked-badge {
		font-size: 0.75rem;
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.15);
		padding: 0.125rem 0.5rem;
		border-radius: 6px;
	}

	.wallet-unavailable {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.4);
	}

	/* Link Prompt */
	.link-prompt {
		background: rgba(251, 191, 36, 0.1);
		border: 1px solid rgba(251, 191, 36, 0.3);
		border-radius: 16px;
		padding: 1.25rem;
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.prompt-icon {
		color: #fbbf24;
		flex-shrink: 0;
	}

	.prompt-content h4 {
		font-family: 'Syne', sans-serif;
		font-size: 1rem;
		font-weight: 600;
		margin: 0 0 0.5rem 0;
		color: #fbbf24;
	}

	.prompt-content p {
		font-size: 0.875rem;
		color: rgba(251, 191, 36, 0.9);
		margin: 0 0 1rem 0;
		line-height: 1.5;
	}

	.link-button {
		background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
		color: #0a0d1a;
		border: none;
		border-radius: 10px;
		padding: 0.75rem 1.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.link-button:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(251, 191, 36, 0.4);
	}

	.link-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.button-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(10, 13, 26, 0.3);
		border-top-color: #0a0d1a;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Success Message */
	.success-message {
		background: rgba(16, 185, 129, 0.1);
		border: 1px solid rgba(16, 185, 129, 0.3);
		border-radius: 16px;
		padding: 1.25rem;
		display: flex;
		gap: 1rem;
		color: #10b981;
		margin-bottom: 1rem;
	}

	.success-message h4 {
		font-family: 'Syne', sans-serif;
		font-size: 1rem;
		font-weight: 600;
		margin: 0 0 0.5rem 0;
	}

	.success-message p {
		font-size: 0.875rem;
		color: rgba(16, 185, 129, 0.9);
		margin: 0;
	}

	/* Error Message */
	.error-message {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 16px;
		padding: 1.25rem;
		color: #ef4444;
		font-size: 0.875rem;
	}

	.dismiss-button {
		background: none;
		border: none;
		color: #ef4444;
		text-decoration: underline;
		cursor: pointer;
		margin-top: 0.5rem;
		font-size: 0.875rem;
	}

	.dismiss-button:hover {
		color: #dc2626;
	}

	/* AVM Wallet Styling */
	:global(.avm-wallet-container) {
		margin: 0.5rem 0;
	}

	:global(.avm-wallet-container button),
	:global(.avm-wallet-container [role='button']) {
		background: rgba(255, 255, 255, 0.05) !important;
		color: rgba(255, 255, 255, 0.9) !important;
		border: 1px solid rgba(255, 255, 255, 0.1) !important;
		border-radius: 8px !important;
		padding: 0.5rem 1rem !important;
		font-size: 0.8125rem !important;
		font-weight: 500 !important;
		transition: all 0.3s ease !important;
	}

	:global(.avm-wallet-container button:hover),
	:global(.avm-wallet-container [role='button']:hover) {
		background: rgba(255, 255, 255, 0.08) !important;
		border-color: rgba(212, 175, 55, 0.3) !important;
		transform: translateY(-1px) !important;
	}

	:global(.avm-wallet-container div[class*='modal']),
	:global(.avm-wallet-container div[class*='dropdown']),
	:global(.avm-wallet-container div[class*='menu']) {
		background: #121728 !important;
		border: 1px solid rgba(255, 255, 255, 0.1) !important;
		border-radius: 12px !important;
		box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5) !important;
	}

	:global(.avm-wallet-container div[class*='wallet']),
	:global(.avm-wallet-container [role='menuitem']),
	:global(.avm-wallet-container [role='option']) {
		background: rgba(255, 255, 255, 0.03) !important;
		color: rgba(255, 255, 255, 0.9) !important;
		border-radius: 8px !important;
		margin: 0.25rem !important;
	}

	:global(.avm-wallet-container div[class*='wallet']:hover),
	:global(.avm-wallet-container [role='menuitem']:hover),
	:global(.avm-wallet-container [role='option']:hover) {
		background: rgba(255, 255, 255, 0.05) !important;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.wallet-selector {
			padding: 1.5rem;
		}

		.wallet-options {
			grid-template-columns: 1fr;
		}
	}
</style>
