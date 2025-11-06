<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
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
	}

	let { isOpen, onClose, address, usdcBalance = null }: Props = $props();

	// Tab state
	type Tab = 'transfer' | 'buy';
	let activeTab = $state<Tab>('transfer');

	// Transfer tab state
	let qrCodeUrl = $state<string>('');
	let copySuccess = $state(false);
	let amountMicroVoi = $state<number | undefined>(undefined);

	// Buy tab state
	let usdcAmount = $state('');
	let quoteAmount = $state<string | null>(null);
	let quoteRate = $state<number | null>(null);
	let priceImpact = $state<number | null>(null);
	let quoteError = $state<string | null>(null);
	let isLoadingQuote = $state(false);
	let isExecutingSwap = $state(false);
	let swapSuccess = $state(false);
	let swapTxId = $state<string | null>(null);
	let unsignedTransactions = $state<string[] | null>(null);
	let quoteData = $state<any>(null);
	
	// Debounce timer for auto-quote
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Generate QR code when modal opens or address/amount changes
	$effect(() => {
		if (isOpen && address) {
			generateQRCode();
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
				quoteRate = data.quote.rate;
				priceImpact = data.quote.priceImpact;
				unsignedTransactions = data.unsignedTransactions;
				quoteData = data;
			}
		} catch (error) {
			console.error('Error getting quote:', error);
			quoteError = error instanceof Error ? error.message : 'Failed to get quote';
			quoteAmount = null;
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
			swapSuccess = true;
			
			// Reset form after successful swap
			setTimeout(() => {
				usdcAmount = '';
				quoteAmount = null;
				quoteRate = null;
				priceImpact = null;
				unsignedTransactions = null;
				quoteData = null;
				swapSuccess = false;
				swapTxId = null;
			}, 5000);
		} catch (error) {
			console.error('Error executing swap:', error);
			quoteError = error instanceof Error ? error.message : 'Failed to execute swap';
			swapSuccess = false;
		} finally {
			isExecutingSwap = false;
		}
	}

	function handleClose() {
		activeTab = 'transfer';
		amountMicroVoi = undefined;
		usdcAmount = '';
		quoteAmount = null;
		quoteRate = null;
		priceImpact = null;
		quoteError = null;
		unsignedTransactions = null;
		quoteData = null;
		swapSuccess = false;
		swapTxId = null;
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}
		onClose();
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

<Modal isOpen={isOpen} onClose={handleClose} title="Deposit VOI" size="md">
	<div class="space-y-6">
		<!-- Tab Selector -->
		<div class="flex gap-2 border-b border-neutral-200 dark:border-neutral-700">
			<button
				type="button"
				onclick={() => {
					activeTab = 'transfer';
				}}
				class="px-4 py-2 text-sm font-medium transition-colors border-b-2 {activeTab === 'transfer'
					? 'border-primary-500 text-primary-600 dark:text-primary-400'
					: 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'}"
			>
				Transfer VOI
			</button>
			<button
				type="button"
				onclick={() => {
					activeTab = 'buy';
				}}
				class="px-4 py-2 text-sm font-medium transition-colors border-b-2 {activeTab === 'buy'
					? 'border-primary-500 text-primary-600 dark:text-primary-400'
					: 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'}"
			>
				Buy with USDC
			</button>
		</div>

		<!-- Transfer VOI Tab -->
		{#if activeTab === 'transfer'}
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

		<!-- Buy with USDC Tab -->
		{#if activeTab === 'buy'}
			<div class="space-y-6">
				<!-- Instructions -->
				<div class="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg">
					<p class="text-sm text-primary-700 dark:text-primary-300">
						Buy VOI tokens with USDC. Enter an amount to see the current exchange rate and complete your purchase.
					</p>
				</div>

				<!-- USDC Balance Display -->
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

				<!-- Quote Display (auto-updates as user types) -->
				{#if isLoadingQuote}
					<div class="p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg">
						<p class="text-sm text-neutral-600 dark:text-neutral-400 text-center">Loading quote...</p>
					</div>
				{:else if quoteError}
					<div class="p-4 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-700 rounded-lg">
						<p class="text-sm text-error-700 dark:text-error-300">{quoteError}</p>
					</div>
				{:else if quoteAmount && !quoteError}
					<div class="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-700 rounded-lg space-y-3">
						<div class="space-y-2">
							<p class="text-sm font-medium text-success-700 dark:text-success-300">Purchase Quote:</p>
							<p class="text-2xl font-bold text-success-600 dark:text-success-400">
								{usdcAmount} USDC ≈ {quoteAmount} VOI
							</p>
							{#if quoteRate}
								<p class="text-xs text-success-600 dark:text-success-400">
									Rate: {quoteRate.toFixed(6)} VOI per USDC
								</p>
							{/if}
							{#if priceImpact !== null && priceImpact > 0.01}
								<p class="text-xs text-warning-600 dark:text-warning-400">
									Price Impact: {(priceImpact * 100).toFixed(4)}%
								</p>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Success Message -->
				{#if swapSuccess && swapTxId}
					<div class="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-700 rounded-lg">
						<div class="space-y-2">
							<p class="text-sm font-medium text-success-700 dark:text-success-300">Purchase Successful!</p>
							<p class="text-xs text-success-600 dark:text-success-400">
								Transaction ID: <code class="font-mono">{swapTxId}</code>
							</p>
						</div>
					</div>
				{/if}

				<!-- Buy Button -->
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
			</div>
		{/if}
	</div>
</Modal>
