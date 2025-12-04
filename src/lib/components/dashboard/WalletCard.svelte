<script lang="ts">
	/**
	 * WalletCard Component
	 *
	 * Primary wallet display card for the dashboard.
	 * USDC is the primary currency, with other tokens (VOI, etc.) as secondary.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { fetchAllBalances, formatBalance, formatUsdValue } from '$lib/voi/balances';
	import { openIBuyVoiWidget, isPopupBlocked } from '$lib/voi/ibuyvoi';
	import type { AssetBalance } from '$lib/voi/balances';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import AccountPrepModal from '$lib/components/wallet/AccountPrepModal.svelte';
	import UsdcWithdrawModal from '$lib/components/wallet/UsdcWithdrawModal.svelte';
	import VoiDepositModal from '$lib/components/wallet/VoiDepositModal.svelte';
	import VoiWithdrawModal from '$lib/components/wallet/VoiWithdrawModal.svelte';
	import SwapPlaceholderModal from '$lib/components/wallet/SwapPlaceholderModal.svelte';
	import {
		checkAssetOptIn,
		createAssetOptInTransaction,
		verifyAssetOptIn,
		submitTransaction,
		waitForConfirmation
	} from '$lib/voi/asa-utils';
	import {
		requestVoi,
		waitForVoiReceipt,
		hasSufficientVoi,
		type FountainError
	} from '$lib/voi/fountain-client';
	import { signTransaction } from '$lib/voi/wallet-utils';

	interface Props {
		address: string;
	}

	let { address }: Props = $props();

	const AUSDC_ASSET_ID = 302190;

	// Balance state
	let usdcBalance = $state<AssetBalance | null>(null);
	let otherTokens = $state<AssetBalance[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let lastFetched = $state<Date | null>(null);
	let depositStatus = $state<string | null>(null);

	// Account preparation modal state
	let showPrepModal = $state(false);
	let prepModalStep = $state<'checking' | 'requesting' | 'preparing' | 'ready' | 'error'>(
		'checking'
	);
	let prepModalError = $state('');
	let isPreparingAccount = $state(false);

	// Modal states
	let showUsdcWithdrawModal = $state(false);
	let showVoiDepositModal = $state(false);
	let showVoiWithdrawModal = $state(false);
	let swapModal = $state<{
		isOpen: boolean;
		tokenSymbol: string;
		action: 'deposit' | 'withdraw';
	}>({
		isOpen: false,
		tokenSymbol: '',
		action: 'deposit'
	});

	const loadBalances = async () => {
		loading = true;
		error = null;

		try {
			const data = await fetchAllBalances(address);
			usdcBalance = data.usdc;
			otherTokens = data.otherTokens;
			lastFetched = new Date();
		} catch (err) {
			console.error('Error loading balances:', err);
			error = 'Failed to load balances';
		} finally {
			loading = false;
		}
	};

	onMount(() => {
		loadBalances();
	});

	$effect(() => {
		if (address) {
			loadBalances();
		}
	});

	// Prepare account for USDC deposits
	const prepareAndDeposit = async () => {
		try {
			prepModalStep = 'checking';
			const isOptedIn = await checkAssetOptIn(address, AUSDC_ASSET_ID);

			if (isOptedIn) {
				openDepositWidget();
				return;
			}

			showPrepModal = true;
			isPreparingAccount = true;
			await runAccountPreparation();
		} catch (err) {
			console.error('[Deposit Flow] Error preparing account:', err);
			error = 'Failed to prepare account. Please try again.';
			setTimeout(() => {
				error = null;
			}, 5000);
		}
	};

	const runAccountPreparation = async () => {
		try {
			prepModalStep = 'checking';
			const hasSufficient = await hasSufficientVoi(address);

			if (!hasSufficient) {
				prepModalStep = 'requesting';
				try {
					const { getVoiBalance } = await import('$lib/voi/fountain-client');
					const initialBalance = await getVoiBalance(address);
					const fountainResponse = await requestVoi(address);

					if (fountainResponse.success) {
						const received = await waitForVoiReceipt(address, initialBalance, 20, 1000);
						if (!received) {
							throw new Error('Timeout waiting for VOI tokens. Please try again.');
						}
					}
				} catch (err) {
					const fountainError = err as FountainError;
					if (fountainError.rateLimited) {
						throw new Error(fountainError.message || 'Rate limit reached. Please try again later.');
					}
					throw err;
				}
			}

			prepModalStep = 'preparing';
			const optInTxn = await createAssetOptInTransaction(address, AUSDC_ASSET_ID);
			const session = $page.data.session;
			const signedBlob = await signTransaction(optInTxn, address, session);
			const txId = await submitTransaction(signedBlob);
			await waitForConfirmation(txId, 10);

			const verified = await verifyAssetOptIn(address, AUSDC_ASSET_ID, 15, 1000);
			if (!verified) {
				throw new Error(
					'Failed to verify opt-in. The transaction may still be processing. Please refresh and try again.'
				);
			}

			prepModalStep = 'ready';
			setTimeout(() => {
				showPrepModal = false;
				isPreparingAccount = false;
				openDepositWidget();
			}, 1500);
		} catch (err) {
			console.error('Account preparation error:', err);
			prepModalStep = 'error';
			prepModalError =
				err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
			isPreparingAccount = false;
		}
	};

	const openDepositWidget = () => {
		const popup = openIBuyVoiWidget(address, () => {
			depositStatus = 'Refreshing balance...';
			setTimeout(() => {
				loadBalances();
				depositStatus = null;
			}, 1000);
		});

		if (isPopupBlocked(popup)) {
			error = 'Popup was blocked. Please allow popups for this site.';
			setTimeout(() => {
				error = null;
			}, 5000);
		}
	};

	const handlePrepModalRetry = () => {
		prepModalError = '';
		isPreparingAccount = true;
		runAccountPreparation();
	};

	const closePrepModal = () => {
		if (!isPreparingAccount) {
			showPrepModal = false;
			prepModalStep = 'checking';
			prepModalError = '';
		}
	};

	const handleRefresh = () => {
		loadBalances();
	};

	// Handle token deposit (for non-VOI tokens, show placeholder)
	const handleTokenDeposit = (token: AssetBalance) => {
		if (token.symbol === 'VOI') {
			showVoiDepositModal = true;
			return;
		}
		swapModal = { isOpen: true, tokenSymbol: token.symbol, action: 'deposit' };
	};

	// Handle token withdraw (for non-VOI tokens, show placeholder)
	const handleTokenWithdraw = (token: AssetBalance) => {
		if (token.symbol === 'VOI') {
			showVoiWithdrawModal = true;
			return;
		}
		swapModal = { isOpen: true, tokenSymbol: token.symbol, action: 'withdraw' };
	};

	const closeSwapModal = () => {
		swapModal = { isOpen: false, tokenSymbol: '', action: 'deposit' };
	};

	// Derived values
	const formattedUsdcBalance = $derived(
		usdcBalance ? formatBalance(usdcBalance.balance, usdcBalance.decimals) : '0.00'
	);

	// Get VOI balance for modals
	const voiBalance = $derived(otherTokens.find((t) => t.symbol === 'VOI') || null);
</script>

<Card>
	<CardContent className="p-6">
		<!-- Header -->
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-neutral-950 dark:text-white">Wallet</h2>
			<button
				onclick={handleRefresh}
				disabled={loading}
				class="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 disabled:text-neutral-400 transition-colors"
			>
				{loading ? 'Refreshing...' : 'Refresh'}
			</button>
		</div>

		{#if loading && !lastFetched}
			<div class="flex items-center justify-center py-8">
				<p class="text-neutral-600 dark:text-neutral-400">Loading...</p>
			</div>
		{:else}
			<div class="space-y-5">
				<!-- Primary USDC Balance -->
				<div class="text-center pb-4 border-b border-neutral-200 dark:border-neutral-800">
					<div class="text-sm text-neutral-500 dark:text-neutral-400 mb-1">Primary Balance</div>
					<div class="text-4xl font-bold text-neutral-950 dark:text-white font-mono">
						${formattedUsdcBalance}
						<span class="text-lg font-normal text-neutral-500">USDC</span>
					</div>

					<!-- USDC Actions -->
					<div class="flex gap-3 mt-4">
						<Button variant="primary" size="md" onclick={prepareAndDeposit} class="flex-1">
							Deposit
						</Button>
						<Button
							variant="secondary"
							size="md"
							onclick={() => (showUsdcWithdrawModal = true)}
							class="flex-1"
							disabled={!usdcBalance || loading}
						>
							Withdraw
						</Button>
					</div>
				</div>

				<!-- Other Tokens -->
				{#if otherTokens.length > 0}
					<div>
						<div class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3">
							Other Tokens
						</div>
						<div class="space-y-2">
							{#each otherTokens as token (token.symbol)}
								{@const formattedBalance = formatBalance(token.balance, token.decimals)}
								{@const formattedUsd = formatUsdValue(token.usdValue)}
								<div
									class="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg"
								>
									<div class="flex items-center gap-3">
										{#if token.imageUrl}
											<img
												src={token.imageUrl}
												alt={token.symbol}
												class="w-6 h-6 rounded-full"
												onerror={(e) => (e.currentTarget as HTMLImageElement).classList.add('hidden')}
											/>
										{:else}
											<div
												class="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-medium"
											>
												{token.symbol.charAt(0)}
											</div>
										{/if}
										<div>
											<div class="font-medium text-neutral-800 dark:text-neutral-200 text-sm">
												{token.symbol}
											</div>
											<div class="text-xs text-neutral-500">{token.name}</div>
										</div>
									</div>

									<div class="flex items-center gap-3">
										<div class="text-right">
											<div class="font-mono text-sm font-medium text-neutral-800 dark:text-neutral-200">
												{formattedBalance}
											</div>
											<div class="text-xs text-neutral-500">{formattedUsd}</div>
										</div>

										<!-- Inline +/- buttons -->
										<div class="flex gap-1">
											<button
												onclick={() => handleTokenDeposit(token)}
												class="w-7 h-7 flex items-center justify-center rounded-md bg-success-100 dark:bg-success-900/30 text-success-600 dark:text-success-400 hover:bg-success-200 dark:hover:bg-success-900/50 transition-colors"
												title="Deposit {token.symbol}"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													width="14"
													height="14"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2.5"
												>
													<path d="M12 5v14M5 12h14"></path>
												</svg>
											</button>
											<button
												onclick={() => handleTokenWithdraw(token)}
												class="w-7 h-7 flex items-center justify-center rounded-md bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors"
												title="Withdraw {token.symbol}"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													width="14"
													height="14"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2.5"
												>
													<path d="M5 12h14"></path>
												</svg>
											</button>
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Status Messages -->
				{#if error}
					<div
						class="p-3 bg-error-100 dark:bg-error-900/30 border border-error-300 dark:border-error-700 rounded-lg"
					>
						<p class="text-sm text-error-600 dark:text-error-400 text-center">{error}</p>
					</div>
				{/if}

				{#if depositStatus}
					<div
						class="p-3 bg-primary-100 dark:bg-primary-900/30 border border-primary-300 dark:border-primary-700 rounded-lg"
					>
						<p class="text-sm text-primary-600 dark:text-primary-400 text-center">{depositStatus}</p>
					</div>
				{/if}

				<!-- Last Updated -->
				{#if lastFetched}
					<p class="text-xs text-neutral-500 text-center">
						Updated {lastFetched.toLocaleTimeString()}
					</p>
				{/if}
			</div>
		{/if}
	</CardContent>
</Card>

<!-- Modals -->
<AccountPrepModal
	isOpen={showPrepModal}
	onClose={closePrepModal}
	onComplete={handlePrepModalRetry}
	currentStep={prepModalStep}
	errorMessage={prepModalError}
	isProcessing={isPreparingAccount}
/>

<UsdcWithdrawModal
	isOpen={showUsdcWithdrawModal}
	onClose={() => (showUsdcWithdrawModal = false)}
	onSuccess={() => loadBalances()}
	{usdcBalance}
	{address}
	session={$page.data.session}
/>

<VoiDepositModal
	isOpen={showVoiDepositModal}
	onClose={() => (showVoiDepositModal = false)}
	onSuccess={() => loadBalances()}
	{address}
	{usdcBalance}
/>

<VoiWithdrawModal
	isOpen={showVoiWithdrawModal}
	onClose={() => (showVoiWithdrawModal = false)}
	onSuccess={() => loadBalances()}
	{address}
	{voiBalance}
	{usdcBalance}
	session={$page.data.session}
/>

<SwapPlaceholderModal
	isOpen={swapModal.isOpen}
	onClose={closeSwapModal}
	tokenSymbol={swapModal.tokenSymbol}
	action={swapModal.action}
/>
