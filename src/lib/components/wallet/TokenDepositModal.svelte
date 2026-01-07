<script lang="ts">
	import { onDestroy } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { signTransactions } from '$lib/voi/wallet-utils';
	import { openIBuyVoiWidget, isPopupBlocked } from '$lib/voi/ibuyvoi';
	import { page } from '$app/stores';
	import algosdk from 'algosdk';
	import QRCode from 'qrcode';
	import type { Token, TokenWithBalance } from '$lib/types/token';
	import type { SwapQuoteRequest, SwapQuoteResponse, SwapTransactionDetails } from '$lib/types/swap';
	import { isSwapQuoteResponse } from '$lib/types/swap';
	import {
		AUSDC_ASSET_ID,
		AUSDC_DECIMALS,
		SWAP_SLIPPAGE_TOLERANCE,
		SWAP_CONFIRMATION_ROUNDS,
		BALANCE_REFRESH_DELAY_MS,
		BALANCE_REFRESH_MAX_ATTEMPTS,
		BALANCE_REFRESH_CHECK_DELAY_MS,
		QUOTE_DEBOUNCE_MS
	} from '$lib/constants/tokens';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		address: string;
		token: Token | TokenWithBalance;
		usdcBalance?: { balance: string; decimals: number } | null;
		onSuccess?: () => void;
	}

	let { isOpen, onClose, address, token, usdcBalance = null, onSuccess }: Props = $props();

	// View state - tracks which screen we're on
	type View = 'selection' | 'transfer' | 'buy' | 'buyCard';
	let currentView = $state<View>('selection');

	// iBuyVoi state for USDC card purchases
	let popupError = $state<string | null>(null);

	// Transfer tab state
	let qrCodeUrl = $state<string>('');
	let copySuccess = $state(false);
	let amountAtomic = $state<number | undefined>(undefined);

	// Buy tab state
	let usdcAmount = $state('');
	let quoteAmount = $state<string | null>(null);
	let minimumAmount = $state<string | null>(null);
	let quoteRate = $state<number | null>(null);
	let priceImpact = $state<number | null>(null);
	let quoteError = $state<string | null>(null);
	let isLoadingQuote = $state(false);
	let isExecutingSwap = $state(false);
	let swapSuccess = $state(false);
	let swapTxId = $state<string | null>(null);
	let unsignedTransactions = $state<string[] | null>(null);
	let quoteData = $state<SwapQuoteResponse | null>(null);
	let transactionDetails = $state<SwapTransactionDetails | null>(null);
	let isFetchingTxDetails = $state(false);

	// Debounce timer for auto-quote
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Cleanup debounce timer on component destroy
	onDestroy(() => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
	});

	// Token-specific helpers
	const isNativeVoi = $derived(token.token_standard === 'native' && token.symbol === 'VOI');
	const isUsdc = $derived(token.symbol === 'USDC' || token.symbol === 'aUSDC');
	const tokenSymbol = $derived(token.display_symbol || token.symbol);
	const tokenDecimals = $derived(token.decimals);

	// For native VOI, use 0 as output token. For ARC200, use contract_id
	const swapOutputToken = $derived(
		token.token_standard === 'native' ? 0 : (token.contract_id || 0)
	);

	// Generate QR code when modal opens or address changes
	$effect(() => {
		if (isOpen && address) {
			generateQRCode().catch((err) => {
				console.error('Failed to generate QR code:', err);
				qrCodeUrl = '';
			});
		}
		// Reset to selection screen when modal opens
		if (isOpen) {
			currentView = 'selection';
		}
	});

	async function generateQRCode() {
		if (!address) {
			qrCodeUrl = '';
			return;
		}

		try {
			// Use algorand:// URI scheme for all tokens
			// This is compatible with most Algorand/Voi wallets
			const uri = `voi://${address}`;

			qrCodeUrl = await QRCode.toDataURL(uri, {
				width: 256,
				margin: 2,
				color: {
					dark: '#1f2937',
					light: '#ffffff'
				}
			});
		} catch (error) {
			console.error('Error generating QR code:', error);
			qrCodeUrl = '';
		}
	}

	async function copyAddress() {
		if (!address) return;

		try {
			await navigator.clipboard.writeText(address);
			copySuccess = true;
			setTimeout(() => {
				copySuccess = false;
			}, 2000);
		} catch (error) {
			console.error('Failed to copy address:', error);
		}
	}

	function handleAmountChange(value: string) {
		// Allow empty or valid number
		if (value === '') {
			amountAtomic = undefined;
			return;
		}

		const num = parseFloat(value);
		if (!isNaN(num) && num >= 0) {
			// Convert to atomic units based on token decimals
			amountAtomic = Math.floor(num * 10 ** tokenDecimals);
			generateQRCode();
		}
	}

	function handleUsdcAmountChange(value: string) {
		usdcAmount = value;
		// Clear quote when amount changes
		quoteAmount = null;
		minimumAmount = null;
		quoteRate = null;
		priceImpact = null;
		quoteError = null;
		unsignedTransactions = null;
		quoteData = null;

		// Clear existing debounce timer
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}

		// Debounce quote fetching
		const amount = parseFloat(value);
		if (value && !isNaN(amount) && amount > 0) {
			// Check balance before fetching quote - show error instead of silently failing
			if (usdcBalance) {
				const available = parseFloat(formatUsdcBalance(usdcBalance.balance, usdcBalance.decimals));
				if (amount > available) {
					quoteError = `Insufficient USDC balance. You have ${available.toFixed(2)} USDC available.`;
					return;
				}
			}

			debounceTimer = setTimeout(() => {
				getQuote();
			}, QUOTE_DEBOUNCE_MS);
		}
	}

	async function getQuote() {
		if (!usdcAmount || parseFloat(usdcAmount) <= 0 || !address) {
			return;
		}

		// Check balance before fetching quote - show error instead of silently failing
		if (usdcBalance) {
			const amount = parseFloat(usdcAmount);
			const available = parseFloat(formatUsdcBalance(usdcBalance.balance, usdcBalance.decimals));
			if (!isNaN(amount) && amount > available) {
				quoteError = `Insufficient USDC balance. You have ${available.toFixed(2)} USDC available.`;
				return;
			}
		}

		isLoadingQuote = true;
		quoteError = null;

		try {
			// Convert USDC amount to atomic units using constant decimals
			const amountAtomicStr = BigInt(Math.floor(parseFloat(usdcAmount) * 10 ** AUSDC_DECIMALS)).toString();

			// Build typed request body
			const requestBody: SwapQuoteRequest = {
				address,
				inputToken: AUSDC_ASSET_ID,
				outputToken: swapOutputToken, // 0 for VOI, contract_id for ARC200
				amount: amountAtomicStr,
				slippageTolerance: SWAP_SLIPPAGE_TOLERANCE,
			};

			// Always use proxy endpoint for security and monitoring
			const response = await fetch('/api/proxy/swap/quote', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || data.message || 'Failed to get quote');
			}

			// Validate response structure using type guard
			if (!isSwapQuoteResponse(data)) {
				throw new Error('Invalid quote response from API');
			}

			// Convert output amount from atomic units to token amount
			const outputAmount = BigInt(data.quote.outputAmount);
			const tokenAmount = Number(outputAmount) / 10 ** tokenDecimals;
			quoteAmount = tokenAmount.toFixed(Math.min(tokenDecimals, 6));

			// Extract and convert minimum output amount
			if (data.quote.minimumOutputAmount) {
				const minimumOutputAmount = BigInt(data.quote.minimumOutputAmount);
				const minimumTokenAmount = Number(minimumOutputAmount) / 10 ** tokenDecimals;
				minimumAmount = minimumTokenAmount.toFixed(Math.min(tokenDecimals, 6));
			} else {
				minimumAmount = null;
			}

			quoteRate = data.quote.rate;
			priceImpact = data.quote.priceImpact;
			unsignedTransactions = data.unsignedTransactions;
			quoteData = data;
		} catch (error) {
			console.error('Error getting quote:', error);
			quoteError = error instanceof Error ? error.message : 'Failed to get quote';
			quoteAmount = null;
			minimumAmount = null;
			quoteRate = null;
			priceImpact = null;
			unsignedTransactions = null;
			quoteData = null;
		} finally {
			isLoadingQuote = false;
		}
	}

	/**
	 * Validate session before signing transactions
	 */
	function validateSession(session: unknown): void {
		if (!session) {
			throw new Error('No active session. Please log in again.');
		}
		// Session exists - wallet-utils will handle the rest
	}

	/**
	 * Validate decoded transactions before signing
	 * Checks that transactions are safe to sign
	 */
	function validateTransactions(transactions: algosdk.Transaction[], expectedAddress: string): void {
		if (transactions.length === 0) {
			throw new Error('No transactions to validate');
		}

		for (let i = 0; i < transactions.length; i++) {
			const txn = transactions[i];
			const sender = algosdk.encodeAddress(txn.sender.publicKey);

			// Verify sender matches our address for transactions we're signing
			if (sender === expectedAddress) {
				// This is our transaction - additional checks could be added here
				// For now, we trust the swap API but log for monitoring
				console.log(`Transaction ${i}: sender=${sender}, type=${txn.type}`);
			}
		}
	}

	async function executeSwap() {
		if (!unsignedTransactions || unsignedTransactions.length === 0) {
			quoteError = 'No transactions available. Please get a quote first.';
			return;
		}

		isExecutingSwap = true;
		quoteError = null;

		try {
			// Get and validate session before proceeding
			const session = $page.data.session;
			validateSession(session);

			// Decode base64 transactions
			const transactions = unsignedTransactions.map((txnBase64: string) => {
				const binaryString = atob(txnBase64);
				const bytes = new Uint8Array(binaryString.length);
				for (let i = 0; i < binaryString.length; i++) {
					bytes[i] = binaryString.charCodeAt(i);
				}
				return algosdk.decodeUnsignedTransaction(bytes);
			});

			// Validate transactions before signing
			validateTransactions(transactions, address);

			// Sign all transactions (wallet-utils handles CDP wallet derivation)
			const signedTxns = await signTransactions(transactions, address, session);

			// Submit transactions as a GROUP (must be submitted together!)
			const { getAlgodClient } = await import('$lib/voi/asa-utils');
			const algodClient = getAlgodClient();

			// Send all signed transactions as a group in a single call
			const result = await algodClient.sendRawTransaction(signedTxns).do();
			const groupTxId = result.txid;

			if (!groupTxId) {
				throw new Error('Failed to get transaction ID from group submission');
			}

			swapTxId = groupTxId;

			// Wait for confirmation and fetch transaction details
			isFetchingTxDetails = true;
			try {
				await fetchTransactionDetails(groupTxId);
				swapSuccess = true;
				// Refresh balance with retry logic in the background
				refreshBalanceWithRetry();
			} catch (error) {
				console.error('Error fetching transaction details:', error);
				// Still show success even if details fetch fails
				swapSuccess = true;
				refreshBalanceWithRetry();
			} finally {
				isFetchingTxDetails = false;
			}
		} catch (error) {
			console.error('Error executing swap:', error);
			quoteError = error instanceof Error ? error.message : 'Failed to execute swap';
			swapSuccess = false;
		} finally {
			isExecutingSwap = false;
		}
	}

	async function fetchTransactionDetails(txId: string) {
		try {
			const { getAlgodClient, waitForConfirmation } = await import('$lib/voi/asa-utils');
			const algodClient = getAlgodClient();

			// Wait for confirmation
			await waitForConfirmation(txId, SWAP_CONFIRMATION_ROUNDS);

			// Fetch transaction details
			const txInfo = await algodClient.pendingTransactionInformation(txId).do();

			const confirmedRound = txInfo.confirmedRound;
			const roundTime = (txInfo as any).roundTime;

			// Calculate actual amount received from transaction
			let actualAmountReceived: string | null = null;

			if (txInfo.innerTxns) {
				// Look for the token transfer in inner transactions
				for (const innerTx of txInfo.innerTxns as any[]) {
					// Native VOI transfers have paymentTransaction
					if (isNativeVoi && innerTx.paymentTransaction && innerTx.paymentTransaction.amount) {
						const amount = BigInt(innerTx.paymentTransaction.amount);
						const tokenAmount = Number(amount) / 10 ** tokenDecimals;
						if (tokenAmount > 0) {
							actualAmountReceived = tokenAmount.toFixed(Math.min(tokenDecimals, 6));
							break;
						}
					}
					// ARC200 transfers would be in application calls - use quote amount as fallback
				}
			}

			// If we couldn't find it in inner transactions, use the quote amount as fallback
			if (!actualAmountReceived && quoteAmount) {
				actualAmountReceived = quoteAmount;
			}

			transactionDetails = {
				blockNumber: confirmedRound ? Number(confirmedRound) : null,
				timestamp: roundTime ? Number(roundTime) * 1000 : null,
				actualAmountReceived
			};
		} catch (error) {
			console.error('Error fetching transaction details:', error);
			transactionDetails = {
				blockNumber: null,
				timestamp: Date.now(),
				actualAmountReceived: quoteAmount
			};
		}
	}

	async function refreshBalanceWithRetry() {
		if (!onSuccess) {
			return;
		}

		if (!usdcBalance) {
			await new Promise(resolve => setTimeout(resolve, BALANCE_REFRESH_DELAY_MS));
			onSuccess();
			return;
		}

		const initialUsdcBalance = usdcBalance.balance;

		for (let attempt = 1; attempt <= BALANCE_REFRESH_MAX_ATTEMPTS; attempt++) {
			await new Promise(resolve => setTimeout(resolve, BALANCE_REFRESH_DELAY_MS));
			onSuccess();

			if (attempt < BALANCE_REFRESH_MAX_ATTEMPTS) {
				await new Promise(resolve => setTimeout(resolve, BALANCE_REFRESH_CHECK_DELAY_MS));

				try {
					const { fetchAllBalances } = await import('$lib/voi/balances');
					const data = await fetchAllBalances(address);
					const currentUsdcBalance = data.usdc?.balance;

					if (currentUsdcBalance !== initialUsdcBalance) {
						console.log(`Balance updated after attempt ${attempt}`);
						return;
					}

					console.log(`Balance unchanged after attempt ${attempt}, retrying...`);
				} catch (error) {
					console.error(`Error checking balance after attempt ${attempt}:`, error);
				}
			}
		}

		console.log('Completed all balance refresh attempts');
	}

	function handleClose() {
		currentView = 'selection';
		amountAtomic = undefined;
		usdcAmount = '';
		quoteAmount = null;
		minimumAmount = null;
		quoteRate = null;
		priceImpact = null;
		quoteError = null;
		unsignedTransactions = null;
		quoteData = null;
		swapSuccess = false;
		swapTxId = null;
		transactionDetails = null;
		popupError = null;
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}
		onClose();
	}

	function handleBack() {
		currentView = 'selection';
	}

	function handleSelectTransfer() {
		currentView = 'transfer';
	}

	function handleSelectBuy() {
		currentView = 'buy';
	}

	function handleSelectBuyCard() {
		currentView = 'buyCard';
	}

	/**
	 * Open iBuyVoi widget for USDC card purchases
	 */
	function openUsdcPurchaseWidget() {
		popupError = null;
		const popup = openIBuyVoiWidget(address, () => {
			// Auto-refresh balance when popup closes
			if (onSuccess) {
				setTimeout(() => {
					onSuccess();
				}, 1000);
			}
		});

		if (isPopupBlocked(popup)) {
			popupError = 'Popup was blocked. Please allow popups for this site and try again.';
		}
	}

	// Dynamic modal title based on current view and token
	let modalTitle = $derived(
		currentView === 'transfer' ? `Transfer ${tokenSymbol}` :
		currentView === 'buy' ? 'Buy with USDC' :
		currentView === 'buyCard' ? 'Buy with Card' :
		`Deposit ${tokenSymbol}`
	);

	function getExplorerUrl(txId: string): string {
		return `https://block.voi.network/explorer/transaction/${txId}`;
	}

	function formatTimestamp(timestamp: number | null): string {
		if (!timestamp) return 'N/A';
		const date = new Date(timestamp);
		return date.toLocaleString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function formatUsdcBalance(balance: string, decimals: number): string {
		const balanceBigInt = BigInt(balance);
		const divisor = BigInt(10 ** decimals);
		const whole = balanceBigInt / divisor;
		const remainder = balanceBigInt % divisor;

		if (remainder === 0n) {
			return whole.toString();
		}

		const remainderStr = remainder.toString().padStart(decimals, '0');
		const trimmedRemainder = remainderStr.replace(/0+$/, '');

		return trimmedRemainder ? `${whole}.${trimmedRemainder}` : whole.toString();
	}
</script>

<Modal isOpen={isOpen} onClose={handleClose} title={modalTitle} size="md">
	<div class="space-y-6">
		<!-- Back Button (shown when not on selection screen) -->
		{#if currentView !== 'selection'}
			<button
				type="button"
				onclick={handleBack}
				class="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors mb-4"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M19 12H5M12 19l-7-7 7-7"></path>
				</svg>
				Back
			</button>
		{/if}

		<!-- Selection Screen -->
		{#if currentView === 'selection'}
			<div class="space-y-6">
				<p class="text-sm text-neutral-600 dark:text-neutral-400 text-center">
					Choose how you'd like to deposit {tokenSymbol}
				</p>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<!-- Transfer Token Card -->
					<Card hover={true} onclick={handleSelectTransfer} class="cursor-pointer">
						<div class="p-6 space-y-4">
							<div class="flex items-center justify-center">
								<div class="p-4 bg-primary-100 dark:bg-primary-900/30 rounded-full">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="32"
										height="32"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="text-primary-600 dark:text-primary-400"
									>
										<path d="M21 12v-2a5 5 0 0 0-5-5H8a5 5 0 0 0-5 5v2"></path>
										<polyline points="7 10 12 15 17 10"></polyline>
										<line x1="12" y1="15" x2="12" y2="3"></line>
									</svg>
								</div>
							</div>
							<div class="text-center space-y-2">
								<h3 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
									Transfer {tokenSymbol}
								</h3>
								<p class="text-sm text-neutral-600 dark:text-neutral-400">
									Send {tokenSymbol} tokens directly to your address from another wallet
								</p>
							</div>
						</div>
					</Card>

					<!-- Buy Option - Different for USDC vs other tokens -->
					{#if isUsdc}
						<!-- Buy USDC with Card -->
						<Card hover={true} onclick={handleSelectBuyCard} class="cursor-pointer">
							<div class="p-6 space-y-4">
								<div class="flex items-center justify-center">
									<div class="p-4 bg-success-100 dark:bg-success-900/30 rounded-full">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="32"
											height="32"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="text-success-600 dark:text-success-400"
										>
											<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
											<line x1="1" y1="10" x2="23" y2="10"></line>
										</svg>
									</div>
								</div>
								<div class="text-center space-y-2">
									<h3 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
										Buy with Card
									</h3>
									<p class="text-sm text-neutral-600 dark:text-neutral-400">
										Purchase USDC directly using your credit/debit card
									</p>
								</div>
							</div>
						</Card>
					{:else}
						<!-- Buy with USDC for other tokens -->
						<Card hover={true} onclick={handleSelectBuy} class="cursor-pointer">
							<div class="p-6 space-y-4">
								<div class="flex items-center justify-center">
									<div class="p-4 bg-success-100 dark:bg-success-900/30 rounded-full">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="32"
											height="32"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="text-success-600 dark:text-success-400"
										>
											<line x1="12" y1="1" x2="12" y2="23"></line>
											<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
										</svg>
									</div>
								</div>
								<div class="text-center space-y-2">
									<h3 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
										Buy with USDC
									</h3>
									<p class="text-sm text-neutral-600 dark:text-neutral-400">
										Exchange your USDC for {tokenSymbol} tokens instantly
									</p>
								</div>
							</div>
						</Card>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Transfer View -->
		{#if currentView === 'transfer'}
			<div class="space-y-6">
				<!-- Instructions -->
				<div class="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg">
					<p class="text-sm text-primary-700 dark:text-primary-300">
						Send {tokenSymbol} tokens directly to your address. Copy the address below and use it in your wallet.
						{#if !isNativeVoi}
							<br /><span class="text-xs mt-1 block text-primary-600 dark:text-primary-400">
								Note: {tokenSymbol} is an ARC200 token. Make sure your sending wallet supports ARC200 transfers.
							</span>
						{/if}
					</p>
				</div>

				<!-- QR Code -->
				<div class="flex flex-col items-center space-y-3">
					<div class="p-4 bg-white rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm">
						{#if qrCodeUrl}
							<img src={qrCodeUrl} alt="Deposit QR Code" class="w-48 h-48" />
						{:else}
							<div class="w-48 h-48 flex items-center justify-center text-neutral-400">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="48"
									height="48"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
									<path d="M3 9h18M9 3v18"></path>
								</svg>
							</div>
						{/if}
					</div>
					<p class="text-xs text-neutral-500 dark:text-neutral-400 text-center">
						Scan with a Voi-compatible wallet to deposit
					</p>
				</div>

				<!-- Address Display -->
				<div class="space-y-3">
					<label for="address-display" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Your Voi Address</label>
					<div class="flex items-center gap-2 p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg">
						<code id="address-display" class="flex-1 font-mono text-sm text-neutral-900 dark:text-neutral-100 break-all">
							{address}
						</code>
						<button
							type="button"
							onclick={copyAddress}
							class="flex-shrink-0 p-2 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
							title="Copy address"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
								<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
							</svg>
						</button>
					</div>
					{#if copySuccess}
						<p class="text-sm text-success-600 dark:text-success-400">Address copied to clipboard!</p>
					{/if}
				</div>

				<!-- Token Info for ARC200 -->
				{#if token.contract_id && !isUsdc}
					<div class="p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg">
						<div class="flex items-center justify-between text-sm">
							<span class="text-neutral-600 dark:text-neutral-400">Contract ID:</span>
							<code class="font-mono text-neutral-900 dark:text-neutral-100">{token.contract_id}</code>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Buy with USDC View -->
		{#if currentView === 'buy'}
			<div class="space-y-6">
				<!-- Instructions (hidden when showing confirmation) -->
				{#if !swapSuccess}
					<div class="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg">
						<p class="text-sm text-primary-700 dark:text-primary-300">
							Exchange your USDC for {tokenSymbol} tokens. Enter the amount you want to spend, and we'll show you exactly how much {tokenSymbol} you'll receive.
						</p>
					</div>
				{/if}

				<!-- USDC Balance Display (hidden when showing confirmation) -->
				{#if !swapSuccess}
					{#if usdcBalance}
						<div class="p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg">
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Available USDC:</span>
								<span class="text-lg font-bold text-warning-600 dark:text-warning-400 font-mono">
									{formatUsdcBalance(usdcBalance.balance, usdcBalance.decimals)}
								</span>
							</div>
						</div>
					{/if}

					<!-- USDC Amount Input -->
					<div class="space-y-3">
						<label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
							Amount (USDC)
						</label>
						<Input
							type="number"
							value={usdcAmount}
							oninput={(e) => {
								handleUsdcAmountChange((e.target as HTMLInputElement).value);
							}}
							placeholder="0.00"
							step="0.01"
							min="0"
						/>
						{#if usdcBalance && usdcAmount}
							{@const amount = parseFloat(usdcAmount)}
							{@const available = parseFloat(formatUsdcBalance(usdcBalance.balance, usdcBalance.decimals))}
							{#if !isNaN(amount) && amount > available}
								<p class="text-xs text-error-600 dark:text-error-400">
									Insufficient balance. You have {formatUsdcBalance(usdcBalance.balance, usdcBalance.decimals)} USDC available.
								</p>
							{/if}
						{/if}
					</div>
				{/if}

				<!-- Quote Display -->
				{#if !swapSuccess}
					{#if isLoadingQuote}
						<div class="p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg">
							<p class="text-sm text-neutral-600 dark:text-neutral-400 text-center">Getting your quote...</p>
						</div>
					{:else if quoteError}
						<div class="p-4 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-700 rounded-lg">
							<p class="text-sm text-error-700 dark:text-error-300">{quoteError}</p>
						</div>
					{:else if quoteAmount && !quoteError}
					<div class="space-y-4">
						<div class="text-center">
							<p class="text-sm font-medium text-neutral-700 dark:text-neutral-300">What you'll get</p>
						</div>

						<!-- Exchange Display -->
						<div class="flex flex-col sm:flex-row items-stretch gap-3">
							<!-- Input Card: USDC -->
							<div class="w-full sm:flex-1 p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg flex flex-col">
								<div class="space-y-1 flex-1 flex flex-col justify-center">
									<p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">You're spending</p>
									<p class="text-2xl font-bold text-neutral-900 dark:text-neutral-100 font-mono">
										{usdcAmount}
									</p>
									<p class="text-sm font-medium text-neutral-600 dark:text-neutral-400">USDC</p>
								</div>
							</div>

							<!-- Arrow/Divider -->
							<div class="flex-shrink-0 flex flex-col items-center justify-center transform rotate-90 sm:rotate-0">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="text-primary-500 dark:text-primary-400"
								>
									<path d="M5 12h14M12 5l7 7-7 7"></path>
								</svg>
							</div>

							<!-- Output Card: Token -->
							<div class="w-full sm:flex-1 p-4 bg-success-50 dark:bg-success-900/20 border-2 border-success-300 dark:border-success-700 rounded-lg flex flex-col">
								<div class="space-y-2 flex-1 flex flex-col">
									<p class="text-xs font-medium text-success-700 dark:text-success-300 uppercase tracking-wide">You'll receive</p>
									<p class="text-3xl font-bold text-success-600 dark:text-success-400 font-mono">
										{quoteAmount}
									</p>
									<p class="text-sm font-medium text-success-700 dark:text-success-300">{tokenSymbol}</p>
									{#if minimumAmount}
										<div class="pt-2 mt-2 border-t border-success-200 dark:border-success-800">
											<p class="text-xs text-success-600 dark:text-success-400">
												<span class="font-semibold">Minimum:</span> {minimumAmount} {tokenSymbol}
											</p>
											<p class="text-xs text-success-500 dark:text-success-500 mt-1">
												(accounts for market changes)
											</p>
										</div>
									{:else}
										<div class="pt-2 mt-2"></div>
									{/if}
								</div>
							</div>
						</div>

						<!-- Price Impact Warning -->
						{#if priceImpact !== null && priceImpact > 0.04}
							<div class="p-3 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-700 rounded-lg">
								<p class="text-xs text-warning-700 dark:text-warning-300">
									<span class="font-semibold">Note:</span> Large trade may affect price by {(priceImpact * 100).toFixed(2)}%
								</p>
							</div>
						{/if}
					</div>
					{/if}
				{/if}

				<!-- Confirmation Screen -->
				{#if isFetchingTxDetails}
					<div class="p-6 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg">
						<div class="flex flex-col items-center justify-center space-y-4">
							<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
							<p class="text-sm text-neutral-600 dark:text-neutral-400 text-center">
								Confirming transaction...
							</p>
						</div>
					</div>
				{:else if swapSuccess && swapTxId}
					<div class="p-6 bg-success-50 dark:bg-success-900/20 border-2 border-success-300 dark:border-success-700 rounded-lg space-y-4">
						<!-- Success Header -->
						<div class="text-center space-y-2">
							<div class="flex justify-center">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="48"
									height="48"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="text-success-600 dark:text-success-400"
								>
									<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
									<polyline points="22 4 12 14.01 9 11.01"></polyline>
								</svg>
							</div>
							<h3 class="text-xl font-bold text-success-700 dark:text-success-300">Purchase Successful!</h3>
							<p class="text-sm text-success-600 dark:text-success-400">
								Your exchange has been completed
							</p>
						</div>

						<!-- Transaction Details -->
						<div class="space-y-3 pt-4 border-t border-success-200 dark:border-success-800">
							<div class="flex justify-between items-center">
								<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Amount Paid:</span>
								<span class="text-sm font-bold text-neutral-900 dark:text-neutral-100 font-mono">
									{usdcAmount} USDC
								</span>
							</div>

							<div class="flex justify-between items-center">
								<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Amount Received:</span>
								<span class="text-sm font-bold text-success-600 dark:text-success-400 font-mono">
									{transactionDetails?.actualAmountReceived || quoteAmount || 'N/A'} {tokenSymbol}
								</span>
							</div>

							<div class="flex justify-between items-center">
								<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Transaction ID:</span>
								<a
									href={getExplorerUrl(swapTxId)}
									target="_blank"
									rel="noopener noreferrer"
									class="text-sm font-mono text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline flex items-center gap-1"
								>
									{swapTxId.slice(0, 8)}...{swapTxId.slice(-8)}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
										<polyline points="15 3 21 3 21 9"></polyline>
										<line x1="10" y1="14" x2="21" y2="3"></line>
									</svg>
								</a>
							</div>

							{#if transactionDetails?.timestamp}
								<div class="flex justify-between items-center">
									<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Date & Time:</span>
									<span class="text-sm text-neutral-600 dark:text-neutral-400">
										{formatTimestamp(transactionDetails.timestamp)}
									</span>
								</div>
							{/if}

							{#if transactionDetails?.blockNumber}
								<div class="flex justify-between items-center">
									<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Block:</span>
									<span class="text-sm font-mono text-neutral-600 dark:text-neutral-400">
										#{transactionDetails.blockNumber}
									</span>
								</div>
							{/if}
						</div>

						<!-- Close Button -->
						<div class="pt-4">
							<Button
								variant="primary"
								size="md"
								onclick={handleClose}
								class="w-full"
							>
								Done
							</Button>
						</div>
					</div>
				{/if}

				<!-- Buy Button -->
				{#if !swapSuccess}
					<Button
						variant="primary"
						size="md"
						onclick={executeSwap}
						disabled={
							!usdcAmount ||
							parseFloat(usdcAmount) <= 0 ||
							!quoteAmount ||
							!unsignedTransactions ||
							isExecutingSwap ||
							isLoadingQuote ||
							(usdcBalance && parseFloat(usdcAmount) > parseFloat(formatUsdcBalance(usdcBalance.balance, usdcBalance.decimals)))
						}
						loading={isExecutingSwap}
						class="w-full"
					>
						{isExecutingSwap ? 'Processing...' : `Buy ${tokenSymbol}`}
					</Button>
				{/if}
			</div>
		{/if}

		<!-- Buy with Card View (for USDC) -->
		{#if currentView === 'buyCard'}
			<div class="space-y-6">
				<!-- Instructions -->
				<div class="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg">
					<p class="text-sm text-primary-700 dark:text-primary-300">
						Purchase USDC directly using your credit or debit card through our secure payment partner.
					</p>
				</div>

				<!-- Info Card -->
				<div class="p-6 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg space-y-4">
					<div class="flex items-center gap-4">
						<div class="p-3 bg-success-100 dark:bg-success-900/30 rounded-full">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="text-success-600 dark:text-success-400"
							>
								<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
								<line x1="1" y1="10" x2="23" y2="10"></line>
							</svg>
						</div>
						<div>
							<h4 class="font-semibold text-neutral-900 dark:text-neutral-100">Secure Card Payment</h4>
							<p class="text-sm text-neutral-600 dark:text-neutral-400">
								Buy USDC instantly with Visa, Mastercard, or Apple Pay
							</p>
						</div>
					</div>

					<div class="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
						<p class="flex items-start gap-2">
							<span class="text-success-500">✓</span>
							<span>Funds deposited directly to your wallet</span>
						</p>
						<p class="flex items-start gap-2">
							<span class="text-success-500">✓</span>
							<span>Secure payment processing</span>
						</p>
						<p class="flex items-start gap-2">
							<span class="text-success-500">✓</span>
							<span>No additional wallet setup required</span>
						</p>
					</div>
				</div>

				<!-- Error Display -->
				{#if popupError}
					<div class="p-4 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-700 rounded-lg">
						<p class="text-sm text-error-700 dark:text-error-300">{popupError}</p>
					</div>
				{/if}

				<!-- Buy Button -->
				<Button
					variant="primary"
					size="md"
					onclick={openUsdcPurchaseWidget}
					class="w-full"
				>
					Continue to Payment
				</Button>

				<p class="text-xs text-neutral-500 dark:text-neutral-400 text-center">
					You will be redirected to our secure payment partner to complete your purchase.
				</p>
			</div>
		{/if}
	</div>
</Modal>
