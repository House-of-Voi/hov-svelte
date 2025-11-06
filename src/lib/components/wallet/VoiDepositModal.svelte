<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { generateVoiUri } from '$lib/voi/uri-utils';
	import { signTransactions } from '$lib/voi/wallet-utils';
	import { submitTransaction } from '$lib/voi/asa-utils';
	import { page } from '$app/stores';
	import { publicEnv } from '$lib/utils/publicEnv';
	import algosdk from 'algosdk';
	import QRCode from 'qrcode';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		address: string;
		usdcBalance?: { balance: string; decimals: number } | null;
		onSuccess?: () => void;
	}

	let { isOpen, onClose, address, usdcBalance = null, onSuccess }: Props = $props();

	// View state - tracks which screen we're on
	type View = 'selection' | 'transfer' | 'buy';
	let currentView = $state<View>('selection');

	// Transfer tab state
	let qrCodeUrl = $state<string>('');
	let copySuccess = $state(false);
	let amountMicroVoi = $state<number | undefined>(undefined);

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
	let quoteData = $state<any>(null);
	let transactionDetails = $state<{
		blockNumber: number | null;
		timestamp: number | null;
		actualAmountReceived: string | null;
	} | null>(null);
	let isFetchingTxDetails = $state(false);
	
	// Debounce timer for auto-quote
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Generate QR code when modal opens or address/amount changes
	$effect(() => {
		if (isOpen && address) {
			generateQRCode();
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
			const uri = generateVoiUri(address, amountMicroVoi);
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

	async function copyUri() {
		if (!address) return;

		try {
			const uri = generateVoiUri(address, amountMicroVoi);
			await navigator.clipboard.writeText(uri);
			copySuccess = true;
			setTimeout(() => {
				copySuccess = false;
			}, 2000);
		} catch (error) {
			console.error('Failed to copy URI:', error);
		}
	}

	function handleAmountChange(value: string) {
		// Allow empty or valid number
		if (value === '') {
			amountMicroVoi = undefined;
			return;
		}

		const num = parseFloat(value);
		if (!isNaN(num) && num >= 0) {
			// Convert to microVoi (6 decimals)
			amountMicroVoi = Math.floor(num * 1_000_000);
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
		
		// Debounce quote fetching (500ms delay)
		const amount = parseFloat(value);
		if (value && !isNaN(amount) && amount > 0) {
			debounceTimer = setTimeout(() => {
				getQuote();
			}, 500);
		}
	}

	async function getQuote() {
		if (!usdcAmount || parseFloat(usdcAmount) <= 0 || !address) {
			return;
		}

		isLoadingQuote = true;
		quoteError = null;
		
		try {
			// Convert USDC amount to atomic units (6 decimals)
			const usdcDecimals = 6;
			const amountAtomic = BigInt(Math.floor(parseFloat(usdcAmount) * 10 ** usdcDecimals)).toString();
			
			// Call external Swap API via proxy to handle CORS
			// If direct call fails, the proxy endpoint will handle it
			const apiUrl = publicEnv.SWAP_API_URL;
			const requestBody = {
				address,
				inputToken: 302190, // USDC (underlying ASA ID - API will resolve to wrapped ARC200)
				outputToken: 0, // VOI (underlying ASA ID - API will resolve to wrapped ARC200)
				amount: amountAtomic,
				slippageTolerance: 0.01, // 1% default
				poolId: '395553' // USDC/VOI pool
			};

			// Try direct call first, fallback to proxy if CORS fails
			let response: Response;
			try {
				response = await fetch(`${apiUrl}/quote`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(requestBody)
				});
			} catch (corsError) {
				// If CORS fails, use proxy endpoint
				console.log('Direct API call failed, using proxy:', corsError);
				response = await fetch('/api/proxy/swap/quote', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(requestBody)
				});
			}

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || data.message || 'Failed to get quote');
			}

			if (data.quote) {
				// Convert output amount from atomic units to VOI (6 decimals)
				const voiDecimals = 6;
				const outputAmount = BigInt(data.quote.outputAmount);
				const voiAmount = Number(outputAmount) / 10 ** voiDecimals;
				quoteAmount = voiAmount.toFixed(6);
				
				// Extract and convert minimum output amount
				if (data.quote.minimumOutputAmount) {
					const minimumOutputAmount = BigInt(data.quote.minimumOutputAmount);
					const minimumVoiAmount = Number(minimumOutputAmount) / 10 ** voiDecimals;
					minimumAmount = minimumVoiAmount.toFixed(6);
				} else {
					minimumAmount = null;
				}
				
				quoteRate = data.quote.rate;
				priceImpact = data.quote.priceImpact;
				unsignedTransactions = data.unsignedTransactions;
				quoteData = data;
			}
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

	async function executeSwap() {
		if (!unsignedTransactions || unsignedTransactions.length === 0) {
			quoteError = 'No transactions available. Please get a quote first.';
			return;
		}

		isExecutingSwap = true;
		quoteError = null;
		
		try {
			// Decode base64 transactions
			const transactions = unsignedTransactions.map((txnBase64: string) => {
				const binaryString = atob(txnBase64);
				const bytes = new Uint8Array(binaryString.length);
				for (let i = 0; i < binaryString.length; i++) {
					bytes[i] = binaryString.charCodeAt(i);
				}
				return algosdk.decodeUnsignedTransaction(bytes);
			});

			// Get session from page data (contains CDP info if applicable)
			const session = $page.data.session;
			
			// Sign all transactions (wallet-utils handles CDP wallet derivation)
			const signedTxns = await signTransactions(transactions, address, session);

			// Submit transactions as a GROUP (must be submitted together!)
			// Transaction groups must be submitted in a single sendRawTransaction call
			// Submitting them individually breaks the group and causes "incomplete group" errors
			const { getAlgodClient } = await import('$lib/voi/asa-utils');
			const algodClient = getAlgodClient();
			
			// Send all signed transactions as a group in a single call
			const result = await algodClient.sendRawTransaction(signedTxns).do();
			const groupTxId = result.txid || result.txId;
			
			if (!groupTxId) {
				throw new Error('Failed to get transaction ID from group submission');
			}

			swapTxId = groupTxId; // Use the group transaction ID
			
			// Wait for confirmation and fetch transaction details
			isFetchingTxDetails = true;
			try {
				await fetchTransactionDetails(groupTxId);
				swapSuccess = true;
				// Call onSuccess callback to refresh balances
				onSuccess?.();
			} catch (error) {
				console.error('Error fetching transaction details:', error);
				// Still show success even if details fetch fails
				swapSuccess = true;
				// Call onSuccess callback even if details fetch fails
				onSuccess?.();
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
			
			// Wait for confirmation (up to 4 rounds)
			await waitForConfirmation(txId, 4);
			
			// Fetch transaction details
			const txInfo = await algodClient.pendingTransactionInformation(txId).do();
			
			const confirmedRound = txInfo['confirmed-round'];
			const roundTime = txInfo['round-time'];
			
			// Calculate actual amount received from transaction
			// For swap transactions, we need to look at the inner transactions
			// The actual VOI received will be in one of the inner transactions
			let actualAmountReceived: string | null = null;
			
			if (txInfo['inner-txns']) {
				// Look for the VOI transfer in inner transactions
				for (const innerTx of txInfo['inner-txns']) {
					// VOI transfers have payment-transaction with amount > 0
					if (innerTx['payment-transaction'] && innerTx['payment-transaction'].amount) {
						const amount = BigInt(innerTx['payment-transaction'].amount);
						const voiDecimals = 6;
						const voiAmount = Number(amount) / 10 ** voiDecimals;
						// Only count if it's a positive amount (received)
						if (voiAmount > 0) {
							actualAmountReceived = voiAmount.toFixed(6);
							break;
						}
					}
				}
			}
			
			// If we couldn't find it in inner transactions, use the quote amount as fallback
			if (!actualAmountReceived && quoteAmount) {
				actualAmountReceived = quoteAmount;
			}
			
			transactionDetails = {
				blockNumber: confirmedRound || null,
				timestamp: roundTime ? roundTime * 1000 : null, // Convert to milliseconds
				actualAmountReceived
			};
		} catch (error) {
			console.error('Error fetching transaction details:', error);
			// Set partial details if available
			transactionDetails = {
				blockNumber: null,
				timestamp: Date.now(), // Use current time as fallback
				actualAmountReceived: quoteAmount
			};
		}
	}

	function handleClose() {
		currentView = 'selection';
		amountMicroVoi = undefined;
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

	// Dynamic modal title based on current view
	let modalTitle = $derived(
		currentView === 'transfer' ? 'Transfer VOI' :
		currentView === 'buy' ? 'Buy with USDC' :
		'Deposit VOI'
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

	// Format USDC balance with proper precision
	function formatUsdcBalance(balance: string, decimals: number): string {
		const balanceBigInt = BigInt(balance);
		const divisor = BigInt(10 ** decimals);
		const whole = balanceBigInt / divisor;
		const remainder = balanceBigInt % divisor;
		
		if (remainder === 0n) {
			return whole.toString();
		}
		
		// Pad remainder with zeros to match decimals
		const remainderStr = remainder.toString().padStart(decimals, '0');
		// Remove trailing zeros
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
					Choose how you'd like to deposit VOI
				</p>
				
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<!-- Transfer VOI Card -->
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
									Transfer VOI
								</h3>
								<p class="text-sm text-neutral-600 dark:text-neutral-400">
									Send VOI tokens directly to your address using a wallet or QR code
								</p>
							</div>
						</div>
					</Card>

					<!-- Buy with USDC Card -->
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
									Exchange your USDC for VOI tokens instantly
								</p>
							</div>
						</div>
					</Card>
				</div>
			</div>
		{/if}

		<!-- Transfer VOI View -->
		{#if currentView === 'transfer'}
			<div class="space-y-6">
				<!-- Instructions -->
				<div class="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg">
					<p class="text-sm text-primary-700 dark:text-primary-300">
						Send VOI tokens directly to your address. You can scan the QR code with a Voi-compatible wallet
						or copy the address manually.
					</p>
				</div>

				<!-- Address Display -->
				<div class="space-y-3">
					<label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Your Voi Address</label>
					<div class="flex items-center gap-2 p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg">
						<code class="flex-1 font-mono text-sm text-neutral-900 dark:text-neutral-100 break-all">
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

				<!-- Optional Amount Input -->
				<div class="space-y-3">
					<label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
						Amount (VOI) <span class="text-xs text-neutral-500">(Optional)</span>
					</label>
					<Input
						type="number"
						value={amountMicroVoi ? (amountMicroVoi / 1_000_000).toString() : ''}
						oninput={(e) => {
							handleAmountChange((e.target as HTMLInputElement).value);
						}}
						placeholder="Enter amount (optional)"
						step="0.000001"
						min="0"
					/>
					<p class="text-xs text-neutral-500 dark:text-neutral-400">
						If specified, the QR code will include the amount for convenience.
					</p>
				</div>

				<!-- QR Code -->
				<div class="flex flex-col items-center space-y-4">
					<div class="p-4 bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700">
						{#if qrCodeUrl}
							<img src={qrCodeUrl} alt="Voi Deposit QR Code" class="w-64 h-64" />
						{:else}
							<div class="w-64 h-64 flex items-center justify-center text-neutral-400">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="64"
									height="64"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
									<path d="M3 7h18M7 3v18"></path>
								</svg>
							</div>
						{/if}
					</div>
					<p class="text-sm text-neutral-600 dark:text-neutral-400 text-center">
						Scan with a Voi-compatible wallet to deposit
					</p>
					<Button variant="outline" size="sm" onclick={copyUri}>
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
							class="mr-2"
						>
							<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
							<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
						</svg>
						Copy Deposit URI
					</Button>
				</div>
			</div>
		{/if}

		<!-- Buy with USDC View -->
		{#if currentView === 'buy'}
			<div class="space-y-6">
				<!-- Instructions (hidden when showing confirmation) -->
				{#if !swapSuccess}
					<div class="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg">
						<p class="text-sm text-primary-700 dark:text-primary-300">
							Exchange your USDC for VOI tokens. Enter the amount you want to spend, and we'll show you exactly how much VOI you'll receive.
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

				<!-- Quote Display (auto-updates as user types, hidden when showing confirmation) -->
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
						<!-- Header -->
						<div class="text-center">
							<p class="text-sm font-medium text-neutral-700 dark:text-neutral-300">What you'll get</p>
						</div>
						
						<!-- Exchange Display -->
						<div class="flex flex-col sm:flex-row items-center gap-3">
							<!-- Input Card: USDC -->
							<div class="w-full sm:flex-1 p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg">
								<div class="space-y-1">
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
							
							<!-- Output Card: VOI -->
							<div class="w-full sm:flex-1 p-4 bg-success-50 dark:bg-success-900/20 border-2 border-success-300 dark:border-success-700 rounded-lg">
								<div class="space-y-2">
									<p class="text-xs font-medium text-success-700 dark:text-success-300 uppercase tracking-wide">You'll receive</p>
									<p class="text-3xl font-bold text-success-600 dark:text-success-400 font-mono">
										{quoteAmount}
									</p>
									<p class="text-sm font-medium text-success-700 dark:text-success-300">VOI</p>
									{#if minimumAmount}
										<div class="pt-2 mt-2 border-t border-success-200 dark:border-success-800">
											<p class="text-xs text-success-600 dark:text-success-400">
												<span class="font-semibold">Minimum:</span> {minimumAmount} VOI
											</p>
											<p class="text-xs text-success-500 dark:text-success-500 mt-1">
												(accounts for market changes)
											</p>
										</div>
									{/if}
								</div>
							</div>
						</div>
						
						<!-- Additional Info -->
						{#if priceImpact !== null && priceImpact > 0.01}
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
							<!-- Amount Paid -->
							<div class="flex justify-between items-center">
								<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Amount Paid:</span>
								<span class="text-sm font-bold text-neutral-900 dark:text-neutral-100 font-mono">
									{usdcAmount} USDC
								</span>
							</div>
							
							<!-- Amount Received -->
							<div class="flex justify-between items-center">
								<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Amount Received:</span>
								<span class="text-sm font-bold text-success-600 dark:text-success-400 font-mono">
									{transactionDetails?.actualAmountReceived || quoteAmount || 'N/A'} VOI
								</span>
							</div>
							
							<!-- Transaction ID -->
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
							
							<!-- Date/Time -->
							{#if transactionDetails?.timestamp}
								<div class="flex justify-between items-center">
									<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Date & Time:</span>
									<span class="text-sm text-neutral-600 dark:text-neutral-400">
										{formatTimestamp(transactionDetails.timestamp)}
									</span>
								</div>
							{/if}
							
							<!-- Block Number -->
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

				<!-- Buy Button (hidden when showing confirmation) -->
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
						{isExecutingSwap ? 'Processing...' : 'Buy VOI'}
					</Button>
				{/if}
			</div>
		{/if}
	</div>
</Modal>
