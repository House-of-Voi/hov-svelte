<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { formatBalance } from '$lib/voi/balances';
	import { createPaymentTransaction, submitTransaction, waitForConfirmation } from '$lib/voi/asa-utils';
	import { signTransaction } from '$lib/voi/wallet-utils';
	import { page } from '$app/stores';
	import { publicEnv } from '$lib/utils/publicEnv';
	import type { AssetBalance } from '$lib/voi/balances';
	import type { SessionInfo } from '$lib/auth/session';
	import algosdk from 'algosdk';

	const BLOCK_EXPLORER_BASE = 'https://block.voi.network/explorer/transaction/';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		address: string;
		voiBalance: AssetBalance | null;
		usdcBalance?: { balance: string; decimals: number } | null;
		session: SessionInfo | null;
		onSuccess?: () => void;
	}

	let { isOpen, onClose, address, voiBalance, usdcBalance = null, session, onSuccess }: Props = $props();

	// View state - tracks which screen we're on
	type View = 'selection' | 'transfer' | 'sell';
	let currentView = $state<View>('selection');

	// Transfer tab state
	let destinationAddress = $state('');
	let amount = $state('');
	let selectedAccountId = $state<string | null>(null);
	let linkedAccounts = $state<Array<{ id?: string; address: string; chain: string; type?: string }>>([]);
	let loadingAccounts = $state(false);
	let isProcessing = $state(false);
	let txId = $state<string | null>(null);
	let error = $state<string | null>(null);

	// enVoi search state
	let envoiSearchQuery = $state('');
	let envoiSearchResults = $state<Array<{ name: string; address: string; avatar?: string }>>([]);
	let isSearchingEnvoi = $state(false);
	let showEnvoiResults = $state(false);
	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let addressInputRef = $state<HTMLDivElement | null>(null);

	// Sell tab state
	let voiAmount = $state('');
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

	// Reset to selection screen when modal opens
	$effect(() => {
		if (isOpen) {
			currentView = 'selection';
		} else {
			resetForm();
		}
	});

	// Close enVoi results when clicking outside or pressing Escape
	$effect(() => {
		if (showEnvoiResults || isSearchingEnvoi) {
			const handleClickOutside = (e: MouseEvent) => {
				const target = e.target as HTMLElement;
				if (addressInputRef && !addressInputRef.contains(target)) {
					const dropdown = document.querySelector('[data-envoi-dropdown]');
					if (dropdown && !dropdown.contains(target)) {
						showEnvoiResults = false;
					}
				}
			};
			const handleEscape = (e: KeyboardEvent) => {
				if (e.key === 'Escape' && (showEnvoiResults || isSearchingEnvoi)) {
					e.stopPropagation();
					showEnvoiResults = false;
					isSearchingEnvoi = false;
				}
			};
			const handleScroll = () => {
				if (addressInputRef) {
					showEnvoiResults = showEnvoiResults;
				}
			};
			document.addEventListener('click', handleClickOutside);
			document.addEventListener('keydown', handleEscape, true);
			window.addEventListener('scroll', handleScroll, true);
			window.addEventListener('resize', handleScroll);
			return () => {
				document.removeEventListener('click', handleClickOutside);
				document.removeEventListener('keydown', handleEscape, true);
				window.removeEventListener('scroll', handleScroll, true);
				window.removeEventListener('resize', handleScroll);
			};
		}
	});

	async function fetchLinkedAccounts() {
		loadingAccounts = true;
		try {
			const response = await fetch('/api/profile/accounts');
			const result = await response.json();
			if (result.success && result.data?.accounts) {
				linkedAccounts = result.data.accounts.filter((acc: any) => acc.chain === 'voi');
			}
		} catch (err) {
			console.error('Failed to fetch linked accounts:', err);
		} finally {
			loadingAccounts = false;
		}
	}

	function resetForm() {
		destinationAddress = '';
		amount = '';
		selectedAccountId = null;
		txId = null;
		error = null;
		envoiSearchQuery = '';
		envoiSearchResults = [];
		showEnvoiResults = false;
		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
			searchDebounceTimer = null;
		}
		voiAmount = '';
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
			debounceTimer = null;
		}
	}

	function handleAccountSelect(accountAddress: string) {
		destinationAddress = accountAddress;
		selectedAccountId = accountAddress;
	}

	function validateAddress(addr: string): boolean {
		return addr.length === 58 && /^[A-Z2-7]+$/.test(addr);
	}

	function isEnvoiName(query: string): boolean {
		if (!query || query.trim() === '') {
			return false;
		}
		if (validateAddress(query)) {
			return false;
		}
		return /^[a-zA-Z0-9.-]+$/.test(query.trim()) && query.trim().length >= 2 && query.trim().length < 58;
	}

	async function searchEnvoiNames(query: string) {
		if (!query || query.length < 2) {
			envoiSearchResults = [];
			showEnvoiResults = false;
			return;
		}

		if (validateAddress(query)) {
			envoiSearchResults = [];
			showEnvoiResults = false;
			return;
		}

		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
		}

		searchDebounceTimer = setTimeout(async () => {
			try {
				isSearchingEnvoi = true;
				const searchUrl = new URL('https://api.envoi.sh/api/search');
				searchUrl.searchParams.set('pattern', query);

				const response = await fetch(searchUrl.toString());
				if (!response.ok) {
					throw new Error(`Envoi API error: ${response.status}`);
				}

				const data = await response.json();
				const rawResults = data.results || [];
				const results = rawResults.slice(0, 5).map((item: any) => ({
					name: String(item.name || ''),
					address: String(item.address || ''),
					avatar: item.metadata?.avatar || undefined
				})).filter((item: { name: string; address: string }) => item.name && item.name.length > 0);
				
				envoiSearchResults = results;
				showEnvoiResults = results.length > 0;
			} catch (err) {
				console.error('Envoi search error:', err);
				envoiSearchResults = [];
				showEnvoiResults = false;
			} finally {
				isSearchingEnvoi = false;
			}
		}, 300);
	}

	async function handleEnvoiNameSelect(name: string) {
		showEnvoiResults = false;
		envoiSearchQuery = '';
		
		const selectedResult = envoiSearchResults.find(r => r.name === name);
		
		if (selectedResult && selectedResult.address) {
			destinationAddress = selectedResult.address;
			selectedAccountId = null;
			envoiSearchResults = [];
		} else {
			error = `Failed to resolve enVoi name "${name}". Please check the name or enter an address manually.`;
			envoiSearchResults = [];
		}
	}

	function clearAddressInput() {
		destinationAddress = '';
		selectedAccountId = null;
		envoiSearchQuery = '';
		envoiSearchResults = [];
		showEnvoiResults = false;
		error = null;
		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
			searchDebounceTimer = null;
		}
	}

	function validateAmount(amt: string): { valid: boolean; error?: string } {
		if (!amt || amt.trim() === '') {
			return { valid: false, error: 'Please enter an amount' };
		}

		const numAmount = parseFloat(amt);
		if (isNaN(numAmount) || numAmount <= 0) {
			return { valid: false, error: 'Amount must be greater than 0' };
		}

		if (!voiBalance) {
			return { valid: false, error: 'VOI balance not available' };
		}

		const decimals = voiBalance.decimals;
		const divisor = BigInt(10 ** decimals);
		const amountInSmallestUnit = BigInt(Math.floor(numAmount * Number(divisor)));
		const availableBalance = BigInt(voiBalance.balance);

		// Account for transaction fee (approximately 0.001 VOI = 1000 microVOI)
		const transactionFee = BigInt(1000);
		const totalRequired = amountInSmallestUnit + transactionFee;

		if (totalRequired > availableBalance) {
			return { valid: false, error: 'Insufficient balance (accounting for transaction fees)' };
		}

		return { valid: true };
	}

	function setMaxAmount() {
		if (!voiBalance) return;
		const formatted = formatBalance(voiBalance.balance, voiBalance.decimals);
		// Subtract a small amount for transaction fees
		const numAmount = parseFloat(formatted);
		const maxAmount = Math.max(0, numAmount - 0.001);
		amount = maxAmount.toFixed(6);
	}

	function getAvailableBalance(): string {
		if (!voiBalance) return '0.000000';
		return formatBalance(voiBalance.balance, voiBalance.decimals);
	}

	async function handleTransfer() {
		error = null;

		if (!destinationAddress || !validateAddress(destinationAddress)) {
			error = 'Please enter a valid Voi address (58 characters, base32 format)';
			return;
		}

		const amountValidation = validateAmount(amount);
		if (!amountValidation.valid) {
			error = amountValidation.error || 'Invalid amount';
			return;
		}

		if (destinationAddress === address) {
			error = 'Cannot send VOI to your own address';
			return;
		}

		isProcessing = true;
		error = null;

		try {
			if (!voiBalance) {
				throw new Error('VOI balance not available');
			}

			const decimals = voiBalance.decimals;
			const divisor = BigInt(10 ** decimals);
			const numAmount = parseFloat(amount);
			const amountInSmallestUnit = BigInt(Math.floor(numAmount * Number(divisor)));

			// Create payment transaction
			const paymentTxn = await createPaymentTransaction(
				address,
				destinationAddress,
				amountInSmallestUnit
			);

			// Sign transaction
			const signedBlob = await signTransaction(paymentTxn, address, session);

			// Submit transaction
			const transactionId = await submitTransaction(signedBlob);
			if (!transactionId || transactionId === 'undefined') {
				throw new Error('Failed to get transaction ID from submission');
			}
			txId = transactionId;

			// Wait for confirmation
			const confirmed = await waitForConfirmation(transactionId, 4);
			if (!confirmed) {
				console.warn('Transaction confirmation timeout, but transaction was submitted:', transactionId);
			}

			// Wait a moment for blockchain state to propagate before refreshing balances
			setTimeout(() => {
				onSuccess?.();
			}, 1000);
		} catch (err) {
			console.error('Transfer error:', err);
			error = err instanceof Error ? err.message : 'Failed to process transfer. Please try again.';
		} finally {
			isProcessing = false;
		}
	}

	function handleVoiAmountChange(value: string) {
		voiAmount = value;
		quoteAmount = null;
		minimumAmount = null;
		quoteRate = null;
		priceImpact = null;
		quoteError = null;
		unsignedTransactions = null;
		quoteData = null;
		
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}
		
		const amount = parseFloat(value);
		if (value && !isNaN(amount) && amount > 0) {
			debounceTimer = setTimeout(() => {
				getQuote();
			}, 500);
		}
	}

	async function getQuote() {
		if (!voiAmount || parseFloat(voiAmount) <= 0 || !address) {
			return;
		}

		isLoadingQuote = true;
		quoteError = null;
		
		try {
			const voiDecimals = 6;
			const amountAtomic = BigInt(Math.floor(parseFloat(voiAmount) * 10 ** voiDecimals)).toString();
			
			const apiUrl = publicEnv.SWAP_API_URL;
			const requestBody = {
				address,
				inputToken: 0, // VOI (native token)
				outputToken: 302190, // USDC
				amount: amountAtomic,
				slippageTolerance: 0.01,
				poolId: '395553'
			};

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
				const usdcDecimals = 6;
				const outputAmount = BigInt(data.quote.outputAmount);
				const usdcAmount = Number(outputAmount) / 10 ** usdcDecimals;
				quoteAmount = usdcAmount.toFixed(6);
				
				if (data.quote.minimumOutputAmount) {
					const minimumOutputAmount = BigInt(data.quote.minimumOutputAmount);
					const minimumUsdcAmount = Number(minimumOutputAmount) / 10 ** usdcDecimals;
					minimumAmount = minimumUsdcAmount.toFixed(6);
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
			const transactions = unsignedTransactions.map((txnBase64: string) => {
				const binaryString = atob(txnBase64);
				const bytes = new Uint8Array(binaryString.length);
				for (let i = 0; i < binaryString.length; i++) {
					bytes[i] = binaryString.charCodeAt(i);
				}
				return algosdk.decodeUnsignedTransaction(bytes);
			});

			const session = $page.data.session;
			const { signTransactions } = await import('$lib/voi/wallet-utils');
			const signedTxns = await signTransactions(transactions, address, session);

			const { getAlgodClient } = await import('$lib/voi/asa-utils');
			const algodClient = getAlgodClient();
			
			const result = await algodClient.sendRawTransaction(signedTxns).do();
			const groupTxId = result.txid;
			
			if (!groupTxId) {
				throw new Error('Failed to get transaction ID from group submission');
			}

			swapTxId = groupTxId;
			
			isFetchingTxDetails = true;
			try {
				await fetchTransactionDetails(groupTxId);
				swapSuccess = true;
				// Refresh USDC balance with retry logic in the background (don't await)
				refreshUsdcBalanceWithRetry();
			} catch (error) {
				console.error('Error fetching transaction details:', error);
				swapSuccess = true;
				// Refresh USDC balance with retry logic in the background even if details fetch fails
				refreshUsdcBalanceWithRetry();
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

	async function refreshUsdcBalanceWithRetry() {
		if (!onSuccess) {
			return;
		}

		if (!usdcBalance) {
			// If no initial balance, just call onSuccess once after delay
			await new Promise(resolve => setTimeout(resolve, 4000));
			onSuccess();
			return;
		}

		// Store initial USDC balance for comparison
		const initialUsdcBalance = usdcBalance.balance;
		const maxAttempts = 5;
		
		// Try up to 5 times, waiting 4 seconds between each attempt
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			// Wait 4 seconds before this attempt
			await new Promise(resolve => setTimeout(resolve, 4000));
			
			// Refresh balances
			onSuccess();
			
			// Wait a moment for the balance to update, then check (except on last attempt)
			if (attempt < maxAttempts) {
				await new Promise(resolve => setTimeout(resolve, 1000));
				
				// Fetch current balance to check if it changed
				try {
					const { fetchAllBalances } = await import('$lib/voi/balances');
					const data = await fetchAllBalances(address);
					const currentUsdcBalance = data.usdc?.balance;
					
					// If balance has changed, we're done
					if (currentUsdcBalance !== initialUsdcBalance) {
						console.log(`USDC balance updated after attempt ${attempt}`);
						return;
					}
					
					console.log(`USDC balance unchanged after attempt ${attempt}, retrying...`);
				} catch (error) {
					console.error(`Error checking USDC balance after attempt ${attempt}:`, error);
					// Continue to next attempt even if check fails
				}
			}
		}
		
		console.log('Completed all USDC balance refresh attempts');
	}

	async function fetchTransactionDetails(txId: string) {
		try {
			const { getAlgodClient, waitForConfirmation } = await import('$lib/voi/asa-utils');
			const algodClient = getAlgodClient();
			
			await waitForConfirmation(txId, 4);
			
			const txInfo: any = await algodClient.pendingTransactionInformation(txId).do();
			
			const confirmedRound = txInfo['confirmed-round'] || txInfo.confirmedRound;
			const roundTime = txInfo['round-time'] || txInfo.roundTime;
			
			let actualAmountReceived: string | null = null;
			
			const innerTxns = txInfo['inner-txns'] || txInfo.innerTxns || [];
			if (innerTxns.length > 0) {
				for (const innerTx of innerTxns) {
					if (innerTx['asset-transfer-transaction'] && innerTx['asset-transfer-transaction'].amount) {
						const assetId = innerTx['asset-transfer-transaction']['asset-id'];
						if (assetId === 302190) { // USDC asset ID
							const amount = BigInt(innerTx['asset-transfer-transaction'].amount);
							const usdcDecimals = 6;
							const usdcAmount = Number(amount) / 10 ** usdcDecimals;
							if (usdcAmount > 0) {
								actualAmountReceived = usdcAmount.toFixed(6);
								break;
							}
						}
					}
				}
			}
			
			if (!actualAmountReceived && quoteAmount) {
				actualAmountReceived = quoteAmount;
			}
			
			transactionDetails = {
				blockNumber: confirmedRound || null,
				timestamp: roundTime ? roundTime * 1000 : null,
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

	function handleClose() {
		if (!isProcessing && !isExecutingSwap) {
			resetForm();
			currentView = 'selection';
			onClose();
		}
	}

	function handleBack() {
		currentView = 'selection';
	}

	function handleSelectTransfer() {
		currentView = 'transfer';
		fetchLinkedAccounts();
	}

	function handleSelectSell() {
		currentView = 'sell';
	}

	let modalTitle = $derived(
		currentView === 'transfer' ? 'Transfer VOI' :
		currentView === 'sell' ? 'Sell for USDC' :
		'Withdraw VOI'
	);
	
	function getExplorerUrl(txId: string): string {
		return `${BLOCK_EXPLORER_BASE}${txId}`;
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

	const isValidAddress = $derived(destinationAddress ? validateAddress(destinationAddress) : false);
	const amountValidation = $derived(amount ? validateAmount(amount) : { valid: false });
	const canTransfer = $derived(
		isValidAddress &&
		amountValidation.valid &&
		!isProcessing &&
		destinationAddress !== address
	);

	const voiAmountValidation = $derived(voiAmount ? {
		valid: voiAmount && parseFloat(voiAmount) > 0 && voiBalance && parseFloat(voiAmount) <= parseFloat(getAvailableBalance())
	} : { valid: false });
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
					Choose how you'd like to withdraw VOI
				</p>
				
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<!-- Transfer VOI Card -->
					<button
						type="button"
						onclick={handleSelectTransfer}
						class="w-full text-left"
					>
						<Card hover={true} class="cursor-pointer">
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
											<polyline points="7 14 12 9 17 14"></polyline>
											<line x1="12" y1="9" x2="12" y2="21"></line>
										</svg>
									</div>
								</div>
								<div class="text-center space-y-2">
									<h3 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
										Transfer VOI
									</h3>
									<p class="text-sm text-neutral-600 dark:text-neutral-400">
										Send VOI tokens directly to another account
									</p>
								</div>
							</div>
						</Card>
					</button>

					<!-- Sell for USDC Card -->
					<button
						type="button"
						onclick={handleSelectSell}
						class="w-full text-left"
					>
						<Card hover={true} class="cursor-pointer">
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
										Sell for USDC
									</h3>
									<p class="text-sm text-neutral-600 dark:text-neutral-400">
										Exchange your VOI tokens for USDC instantly
									</p>
								</div>
							</div>
						</Card>
					</button>
				</div>
			</div>
		{/if}

		<!-- Transfer VOI View -->
		{#if currentView === 'transfer'}
			<div class="space-y-6">
				<!-- Balance Info -->
				{#if voiBalance}
					<div class="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg">
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Available Balance:</span>
							<span class="text-lg font-bold text-primary-600 dark:text-primary-400 font-mono">
								{getAvailableBalance()} VOI
							</span>
						</div>
					</div>
				{/if}

				<!-- Destination Address Selection -->
				<div class="space-y-3">
					{#if linkedAccounts.length > 0}
						<label for="destination-address" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
							Destination Address
						</label>

						<div class="space-y-2">
							<select
								id="destination-address"
								value={selectedAccountId || ''}
								onchange={(e) => {
									const addr = (e.target as HTMLSelectElement).value;
									if (addr) {
										handleAccountSelect(addr);
									} else {
										selectedAccountId = null;
										destinationAddress = '';
									}
								}}
								class="w-full rounded-xl border-2 border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-3 text-sm text-neutral-950 dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:border-primary-500"
								disabled={isProcessing}
							>
								<option value="">Select a linked account...</option>
								{#each linkedAccounts as account}
									<option value={account.address}>
										{account.address.slice(0, 6)}...{account.address.slice(-4)}
										{#if account.type === 'derived'}
											(Primary)
										{/if}
									</option>
								{/each}
							</select>
						</div>
					{/if}

					<!-- Manual Address Input with Clear Button and enVoi Search -->
					<div class="relative" bind:this={addressInputRef}>
						<div class="relative [&>div>input]:pr-10">
							<Input
								type="text"
								label={linkedAccounts.length > 0 ? 'Or Enter Address Manually' : 'Destination Address'}
								value={destinationAddress}
								placeholder="Enter Voi address or enVoi name"
								maxlength={100}
								disabled={isProcessing}
								error={destinationAddress && !isValidAddress && !isSearchingEnvoi && destinationAddress.length === 58 ? 'Invalid address format' : undefined}
								class="font-mono text-sm"
								oninput={(e) => {
									const newValue = (e.target as HTMLInputElement).value;
									destinationAddress = newValue;
									
									if (selectedAccountId && destinationAddress !== selectedAccountId) {
										selectedAccountId = null;
									}

									if (isEnvoiName(destinationAddress)) {
										envoiSearchQuery = destinationAddress;
										searchEnvoiNames(destinationAddress);
									} else {
										envoiSearchQuery = '';
										envoiSearchResults = [];
										showEnvoiResults = false;
									}
								}}
							/>
							{#if destinationAddress}
								<button
									type="button"
									onclick={clearAddressInput}
									disabled={isProcessing}
									class="absolute right-3 top-[2.75rem] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors z-10"
									title="Clear address"
								>
									<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
								</button>
							{/if}
						</div>
					</div>

					<!-- enVoi Search Results Dropdown -->
					{#if showEnvoiResults && envoiSearchResults.length > 0 && addressInputRef}
						{@const inputRect = addressInputRef?.getBoundingClientRect()}
						{#if inputRect}
						<div
							data-envoi-dropdown
							class="fixed z-[60] bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg shadow-lg max-h-60 overflow-y-auto"
							style="left: {inputRect.left}px; top: {inputRect.bottom + 4}px; width: {inputRect.width}px;"
							onclick={(e) => e.stopPropagation()}
						>
							{#each envoiSearchResults as result}
								<button
									type="button"
									onclick={() => handleEnvoiNameSelect(result.name)}
									class="w-full px-4 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-3"
								>
									{#if result.avatar}
										<img
											src={result.avatar}
											alt={result.name}
											class="w-8 h-8 rounded-full object-cover flex-shrink-0"
											onerror={(e) => {
												(e.currentTarget as HTMLImageElement).style.display = 'none';
											}}
										/>
									{:else}
										<div class="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0">
											<svg class="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
												/>
											</svg>
										</div>
									{/if}
									<div class="flex-1 min-w-0">
										<div class="font-medium text-neutral-900 dark:text-white truncate">{result.name}</div>
										<div class="text-xs text-neutral-500 dark:text-neutral-400 truncate font-mono">
											{result.address.slice(0, 6)}...{result.address.slice(-4)}
										</div>
									</div>
									<svg class="w-4 h-4 text-primary-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M13 10V3L4 14h7v7l9-11h-7z"
										/>
									</svg>
								</button>
							{/each}
						</div>
						{/if}
					{/if}

					<!-- Loading indicator for enVoi search -->
					{#if isSearchingEnvoi && envoiSearchQuery && addressInputRef}
						{@const inputRect = addressInputRef?.getBoundingClientRect()}
						{#if inputRect}
						<div
							class="fixed z-[60] bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg shadow-lg px-4 py-2"
							style="left: {inputRect.left}px; top: {inputRect.bottom + 4}px; width: {inputRect.width}px;"
						>
							<div class="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
								<svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
									<path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									/>
								</svg>
							Searching enVoi names...
						</div>
					</div>
						{/if}
				{/if}
			</div>

				<!-- Amount Input -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Amount (VOI)</label>
						<button
							type="button"
							onclick={setMaxAmount}
							disabled={isProcessing || !voiBalance}
							class="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Max
						</button>
					</div>
					<Input
						type="number"
						value={amount}
						oninput={(e) => {
							amount = (e.target as HTMLInputElement).value;
						}}
						placeholder="0.000000"
						step="0.000001"
						min="0"
						disabled={isProcessing}
						error={amount && !amountValidation.valid ? amountValidation.error : undefined}
					/>
				</div>

				<!-- Error Message -->
				{#if error}
					<div class="p-3 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-700 rounded-lg">
						<p class="text-sm text-error-600 dark:text-error-400">{error}</p>
					</div>
				{/if}

				<!-- Success State with Transaction Link -->
				{#if txId && !isProcessing && !error}
					<div class="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-700 rounded-lg">
						<div class="flex items-center gap-3 mb-3">
							<svg
								class="w-6 h-6 text-success-500 flex-shrink-0"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<div class="flex-1">
								<p class="text-base font-semibold text-success-700 dark:text-success-300">
									Transfer Successful!
								</p>
							</div>
						</div>
						<div class="space-y-2">
							<div class="flex items-center justify-between text-sm">
								<span class="text-neutral-600 dark:text-neutral-400">Transaction ID:</span>
								<span class="font-mono text-success-700 dark:text-success-300">
									{txId.slice(0, 8)}...{txId.slice(-8)}
								</span>
							</div>
							<a
								href={getExplorerUrl(txId)}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
							>
								View on Block Explorer
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
									/>
								</svg>
							</a>
						</div>
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex gap-3 pt-2">
					<Button variant="secondary" size="md" onclick={handleClose} disabled={isProcessing} class="flex-1">
						{txId ? 'Close' : 'Cancel'}
					</Button>
					{#if !txId}
						<Button
							variant="primary"
							size="md"
							onclick={handleTransfer}
							disabled={!canTransfer}
							loading={isProcessing}
							class="flex-1"
						>
							Transfer VOI
						</Button>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Sell for USDC View -->
		{#if currentView === 'sell'}
			<div class="space-y-6">
				{#if !swapSuccess}
					<div class="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg">
						<p class="text-sm text-primary-700 dark:text-primary-300">
							Exchange your VOI for USDC tokens. Enter the amount you want to sell, and we'll show you exactly how much USDC you'll receive.
						</p>
					</div>
				{/if}

				{#if !swapSuccess}
					{#if voiBalance}
						<div class="p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg">
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Available VOI:</span>
								<span class="text-lg font-bold text-primary-600 dark:text-primary-400 font-mono">
									{getAvailableBalance()}
								</span>
							</div>
						</div>
					{/if}

					<div class="space-y-3">
						<label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
							Amount (VOI)
						</label>
						<Input
							type="number"
							value={voiAmount}
							oninput={(e) => {
								handleVoiAmountChange((e.target as HTMLInputElement).value);
							}}
							placeholder="0.000000"
							step="0.000001"
							min="0"
						/>
						{#if voiBalance && voiAmount}
							{@const amount = parseFloat(voiAmount)}
							{@const available = parseFloat(getAvailableBalance())}
							{#if !isNaN(amount) && amount > available}
								<p class="text-xs text-error-600 dark:text-error-400">
									Insufficient balance. You have {getAvailableBalance()} VOI available.
								</p>
							{/if}
						{/if}
					</div>
				{/if}

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
						
						<div class="flex flex-col sm:flex-row items-center gap-3">
							<div class="w-full sm:flex-1 p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg">
								<div class="space-y-1">
									<p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">You're selling</p>
									<p class="text-2xl font-bold text-neutral-900 dark:text-neutral-100 font-mono">
										{voiAmount}
									</p>
									<p class="text-sm font-medium text-neutral-600 dark:text-neutral-400">VOI</p>
								</div>
							</div>
							
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
							
							<div class="w-full sm:flex-1 p-4 bg-success-50 dark:bg-success-900/20 border-2 border-success-300 dark:border-success-700 rounded-lg">
								<div class="space-y-2">
									<p class="text-xs font-medium text-success-700 dark:text-success-300 uppercase tracking-wide">You'll receive</p>
									<p class="text-3xl font-bold text-success-600 dark:text-success-400 font-mono">
										{quoteAmount}
									</p>
									<p class="text-sm font-medium text-success-700 dark:text-success-300">USDC</p>
									{#if minimumAmount}
										<div class="pt-2 mt-2 border-t border-success-200 dark:border-success-800">
											<p class="text-xs text-success-600 dark:text-success-400">
												<span class="font-semibold">Minimum:</span> {minimumAmount} USDC
											</p>
											<p class="text-xs text-success-500 dark:text-success-500 mt-1">
												(accounts for market changes)
											</p>
										</div>
									{/if}
								</div>
							</div>
						</div>
						
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
							<h3 class="text-xl font-bold text-success-700 dark:text-success-300">Sale Successful!</h3>
							<p class="text-sm text-success-600 dark:text-success-400">
								Your exchange has been completed
							</p>
						</div>
						
						<div class="space-y-3 pt-4 border-t border-success-200 dark:border-success-800">
							<div class="flex justify-between items-center">
								<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Amount Sold:</span>
								<span class="text-sm font-bold text-neutral-900 dark:text-neutral-100 font-mono">
									{voiAmount} VOI
								</span>
							</div>
							
							<div class="flex justify-between items-center">
								<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Amount Received:</span>
								<span class="text-sm font-bold text-success-600 dark:text-success-400 font-mono">
									{transactionDetails?.actualAmountReceived || quoteAmount || 'N/A'} USDC
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

				{#if !swapSuccess}
					<Button
						variant="primary"
						size="md"
						onclick={executeSwap}
						disabled={
							!voiAmount ||
							parseFloat(voiAmount) <= 0 ||
							!quoteAmount ||
							!unsignedTransactions ||
							isExecutingSwap ||
							isLoadingQuote ||
							(voiBalance && parseFloat(voiAmount) > parseFloat(getAvailableBalance()))
						}
						loading={isExecutingSwap}
						class="w-full"
					>
						{isExecutingSwap ? 'Processing...' : 'Sell VOI'}
					</Button>
				{/if}
			</div>
		{/if}
	</div>
</Modal>

