<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import { formatBalance } from '$lib/voi/balances';
	import { createAssetTransferTransaction, submitTransaction, waitForConfirmation, checkAssetOptIn } from '$lib/voi/asa-utils';
	import { signTransaction } from '$lib/voi/wallet-utils';
	import { page } from '$app/stores';
	import type { AssetBalance } from '$lib/voi/balances';
	import type { SessionInfo } from '$lib/auth/session';

	const AUSDC_ASSET_ID = 302190;
	const BLOCK_EXPLORER_BASE = 'https://block.voi.network/explorer/transaction/';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		onSuccess?: () => void;
		usdcBalance: AssetBalance | null;
		address: string;
		session: SessionInfo | null;
	}

	let { isOpen, onClose, onSuccess, usdcBalance, address, session }: Props = $props();

	let destinationAddress = $state('');
	let amount = $state('');
	let selectedAccountId = $state<string | null>(null);
	let linkedAccounts = $state<Array<{ id?: string; address: string; chain: string; type?: string }>>([]);
	let loadingAccounts = $state(false);
	let isProcessing = $state(false);
	let txId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let destinationOptedIn = $state<boolean | null>(null);
	let checkingOptIn = $state(false);

	// enVoi search state
	let envoiSearchQuery = $state('');
	let envoiSearchResults = $state<Array<{ name: string; address: string; avatar?: string }>>([]);
	let isSearchingEnvoi = $state(false);
	let showEnvoiResults = $state(false);
	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let addressInputRef: HTMLDivElement;

	// Fetch linked accounts when modal opens
	$effect(() => {
		if (isOpen) {
			fetchLinkedAccounts();
		} else {
			// Only reset when modal closes (user intentionally closes it)
			resetForm();
			txId = null;
			if (searchDebounceTimer) {
				clearTimeout(searchDebounceTimer);
				searchDebounceTimer = null;
			}
			showEnvoiResults = false;
		}
	});

	// Close enVoi results when clicking outside or pressing Escape
	// Also update dropdown position on scroll/resize
	$effect(() => {
		if (showEnvoiResults || isSearchingEnvoi) {
			const handleClickOutside = (e: MouseEvent) => {
				const target = e.target as HTMLElement;
				if (addressInputRef && !addressInputRef.contains(target)) {
					// Check if click is outside the dropdown too
					const dropdown = document.querySelector('[data-envoi-dropdown]');
					if (dropdown && !dropdown.contains(target)) {
						showEnvoiResults = false;
					}
				}
			};
			const handleEscape = (e: KeyboardEvent) => {
				if (e.key === 'Escape' && (showEnvoiResults || isSearchingEnvoi)) {
					e.stopPropagation(); // Prevent modal from closing
					showEnvoiResults = false;
					isSearchingEnvoi = false;
				}
			};
			const handleScroll = () => {
				// Trigger reactivity to update dropdown position
				if (addressInputRef) {
					// Force re-render by touching the reactive state
					showEnvoiResults = showEnvoiResults;
				}
			};
			document.addEventListener('click', handleClickOutside);
			document.addEventListener('keydown', handleEscape, true); // Use capture phase to intercept before modal
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
				// Filter to only Voi accounts
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
		destinationOptedIn = null;
		checkingOptIn = false;
		envoiSearchQuery = '';
		envoiSearchResults = [];
		showEnvoiResults = false;
		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
			searchDebounceTimer = null;
		}
	}

	function handleAccountSelect(accountAddress: string) {
		destinationAddress = accountAddress;
		selectedAccountId = accountAddress;
		// Check opt-in status when address is selected
		checkDestinationOptIn(accountAddress);
	}

	async function checkDestinationOptIn(addr: string) {
		if (!addr || addr.length !== 58) {
			destinationOptedIn = null;
			return;
		}
		checkingOptIn = true;
		destinationOptedIn = null;
		try {
			const isOptedIn = await checkAssetOptIn(addr, AUSDC_ASSET_ID);
			destinationOptedIn = isOptedIn;
		} catch (err) {
			console.error('Error checking opt-in:', err);
			destinationOptedIn = null;
		} finally {
			checkingOptIn = false;
		}
	}

	// Check opt-in when address changes manually
	$effect(() => {
		if (destinationAddress && destinationAddress.length === 58 && validateAddress(destinationAddress)) {
			checkDestinationOptIn(destinationAddress);
		} else {
			destinationOptedIn = null;
		}
	});

	function validateAddress(addr: string): boolean {
		return addr.length === 58 && /^[A-Z2-7]+$/.test(addr);
	}

	function isEnvoiName(query: string): boolean {
		if (!query || query.trim() === '') {
			return false;
		}
		// If it's a valid 58-char address, it's not an enVoi name
		if (validateAddress(query)) {
			return false;
		}
		// If it looks like a name (contains letters, numbers, dots, hyphens, and is not 58 chars)
		// enVoi names typically contain dots and are shorter than 58 chars
		return /^[a-zA-Z0-9.-]+$/.test(query.trim()) && query.trim().length >= 2 && query.trim().length < 58;
	}

	async function searchEnvoiNames(query: string) {
		if (!query || query.length < 2) {
			envoiSearchResults = [];
			showEnvoiResults = false;
			return;
		}

		// Don't search if it's a valid address
		if (validateAddress(query)) {
			envoiSearchResults = [];
			showEnvoiResults = false;
			return;
		}

		// Clear existing debounce timer
		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
		}

		// Debounce the search
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
				// Extract results - enVoi API returns {results: [{name, address, metadata}]}
				// metadata.avatar contains the avatar URL
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

	async function resolveEnvoiName(name: string): Promise<string | null> {
		try {
			const response = await fetch(`https://api.envoi.sh/api/address/${encodeURIComponent(name)}`);
			if (!response.ok) {
				if (response.status === 404) {
					return null;
				}
				throw new Error(`Envoi API error: ${response.status}`);
			}

			const data = await response.json();
			// Extract address from response - enVoi API returns {results: [{name, address, ...}]}
			const results = data.results || [];
			if (results.length > 0 && results[0].address) {
				const address = results[0].address;
				if (validateAddress(address)) {
					return address;
				}
			}
			// Fallback to old format (direct address property)
			const address = data.address || data.addr || (typeof data === 'string' ? data : null);
			if (address && typeof address === 'string' && validateAddress(address)) {
				return address;
			}
			return null;
		} catch (err) {
			console.error('Envoi resolve error:', err);
			return null;
		}
	}

	async function handleEnvoiNameSelect(name: string) {
		showEnvoiResults = false;
		envoiSearchQuery = '';
		
		// Find the selected result from search results (it already has the address)
		const selectedResult = envoiSearchResults.find(r => r.name === name);
		
		if (selectedResult && selectedResult.address) {
			// Use the address directly from search results - no need for another API call
			destinationAddress = selectedResult.address;
			selectedAccountId = null;
			envoiSearchResults = [];
			// Check opt-in status for the address
			checkDestinationOptIn(selectedResult.address);
		} else {
			// Fallback: try to resolve if address wasn't in search results (shouldn't happen, but safety check)
			const resolvedAddress = await resolveEnvoiName(name);
			if (resolvedAddress) {
				destinationAddress = resolvedAddress;
				selectedAccountId = null;
				envoiSearchResults = [];
				checkDestinationOptIn(resolvedAddress);
			} else {
				error = `Failed to resolve enVoi name "${name}". Please check the name or enter an address manually.`;
				envoiSearchResults = [];
			}
		}
	}

	function clearAddressInput() {
		destinationAddress = '';
		selectedAccountId = null;
		destinationOptedIn = null;
		checkingOptIn = false;
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

		if (!usdcBalance) {
			return { valid: false, error: 'USDC balance not available' };
		}

		// Convert amount to smallest unit (considering decimals)
		const decimals = usdcBalance.decimals;
		const divisor = BigInt(10 ** decimals);
		const amountInSmallestUnit = BigInt(Math.floor(numAmount * Number(divisor)));
		const availableBalance = BigInt(usdcBalance.balance);

		if (amountInSmallestUnit > availableBalance) {
			return { valid: false, error: 'Insufficient balance' };
		}

		return { valid: true };
	}

	function setMaxAmount() {
		if (!usdcBalance) return;
		const formatted = formatBalance(usdcBalance.balance, usdcBalance.decimals);
		amount = formatted;
	}

	function getAvailableBalance(): string {
		if (!usdcBalance) return '0.00';
		return formatBalance(usdcBalance.balance, usdcBalance.decimals);
	}

	async function handleWithdraw() {
		error = null;

		// Validate address
		if (!destinationAddress || !validateAddress(destinationAddress)) {
			error = 'Please enter a valid Voi address (58 characters, base32 format)';
			return;
		}

		// Validate amount
		const amountValidation = validateAmount(amount);
		if (!amountValidation.valid) {
			error = amountValidation.error || 'Invalid amount';
			return;
		}

		// Don't allow sending to self
		if (destinationAddress === address) {
			error = 'Cannot send USDC to your own address';
			return;
		}

		// Check if destination is opted in (if we haven't checked yet, check now)
		if (destinationOptedIn === null) {
			checkingOptIn = true;
			try {
				const isOptedIn = await checkAssetOptIn(destinationAddress, AUSDC_ASSET_ID);
				destinationOptedIn = isOptedIn;
				if (!isOptedIn) {
					error = 'Destination address is not opted into USDC. The recipient must opt into USDC before you can send funds.';
					checkingOptIn = false;
					return;
				}
			} catch (err) {
				console.error('Error checking opt-in:', err);
				error = 'Failed to verify destination address. Please try again.';
				checkingOptIn = false;
				return;
			} finally {
				checkingOptIn = false;
			}
		}

		// If we've checked and they're not opted in, block the transfer
		if (destinationOptedIn === false) {
			error = 'Destination address is not opted into USDC. The recipient must opt into USDC before you can send funds.';
			return;
		}

		isProcessing = true;
		error = null;

		try {
			if (!usdcBalance) {
				throw new Error('USDC balance not available');
			}

			// Convert amount to smallest unit
			const decimals = usdcBalance.decimals;
			const divisor = BigInt(10 ** decimals);
			const numAmount = parseFloat(amount);
			const amountInSmallestUnit = BigInt(Math.floor(numAmount * Number(divisor)));

			// Create asset transfer transaction
			const transferTxn = await createAssetTransferTransaction(
				address,
				destinationAddress,
				amountInSmallestUnit,
				AUSDC_ASSET_ID
			);

			// Sign transaction
			const signedBlob = await signTransaction(transferTxn, address, session);

			// Submit transaction
			const transactionId = await submitTransaction(signedBlob);
			if (!transactionId || transactionId === 'undefined') {
				throw new Error('Failed to get transaction ID from submission');
			}
			txId = transactionId;

			// Wait for confirmation (wait up to 4 rounds)
			const confirmed = await waitForConfirmation(transactionId, 4);
			if (!confirmed) {
				// Don't throw error - transaction was submitted, just show warning
				// User can check the block explorer link
				console.warn('Transaction confirmation timeout, but transaction was submitted:', transactionId);
			}

			// Success - refresh balance but DON'T close modal (user needs to see confirmation)
			onSuccess?.();
		} catch (err) {
			console.error('Withdrawal error:', err);
			error = err instanceof Error ? err.message : 'Failed to process withdrawal. Please try again.';
		} finally {
			isProcessing = false;
		}
	}

	function handleClose() {
		if (!isProcessing) {
			resetForm();
			onClose();
		}
	}

	function getExplorerUrl(txId: string): string {
		return `${BLOCK_EXPLORER_BASE}${txId}`;
	}

	const isValidAddress = $derived(destinationAddress ? validateAddress(destinationAddress) : false);
	const amountValidation = $derived(amount ? validateAmount(amount) : { valid: false });
	const canWithdraw = $derived(
		isValidAddress &&
		amountValidation.valid &&
		!isProcessing &&
		destinationAddress !== address &&
		destinationOptedIn !== false &&
		!checkingOptIn
	);
</script>

<Modal isOpen={isOpen} onClose={handleClose} title="Withdraw USDC" size="md">
	<div class="space-y-6">
		<!-- Balance Info -->
		{#if usdcBalance}
			<div class="p-4 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-700 rounded-lg">
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Available Balance:</span>
					<span class="text-lg font-bold text-warning-600 dark:text-warning-400 font-mono">
						{getAvailableBalance()} USDC
					</span>
				</div>
			</div>
		{/if}

		<!-- Destination Address Selection -->
		<div class="space-y-3">
			<!-- Linked Accounts Dropdown -->
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
								destinationOptedIn = null;
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
						bind:value={destinationAddress}
						placeholder="Enter Voi address or enVoi name"
						maxlength={100}
						disabled={isProcessing}
						error={destinationAddress && !isValidAddress && !isSearchingEnvoi && destinationAddress.length === 58 ? 'Invalid address format' : undefined}
						class="font-mono text-sm"
						oninput={(e) => {
							const newValue = (e.target as HTMLInputElement).value;
							destinationAddress = newValue;
							
							// Clear selected account when typing manually
							if (selectedAccountId && destinationAddress !== selectedAccountId) {
								selectedAccountId = null;
							}
							// Reset opt-in status when address changes
							if (destinationAddress.length !== 58) {
								destinationOptedIn = null;
							}

							// Handle enVoi name search
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

			<!-- enVoi Search Results Dropdown - Positioned outside modal overflow container -->
			{#if showEnvoiResults && envoiSearchResults.length > 0 && addressInputRef}
				{@const inputRect = addressInputRef.getBoundingClientRect()}
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
										e.currentTarget.style.display = 'none';
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

			<!-- Loading indicator for enVoi search -->
			{#if isSearchingEnvoi && envoiSearchQuery && addressInputRef}
				{@const inputRect = addressInputRef.getBoundingClientRect()}
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
		</div>

		<!-- Destination Opt-in Status -->
		{#if checkingOptIn && isValidAddress}
			<div class="p-3 bg-neutral-50 dark:bg-neutral-900/20 border border-neutral-200 dark:border-neutral-700 rounded-lg">
				<p class="text-sm text-neutral-600 dark:text-neutral-400 flex items-center gap-2">
					<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
					</svg>
					Checking if destination address is opted into USDC...
				</p>
			</div>
		{:else if destinationOptedIn === false && isValidAddress}
			<div class="p-3 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-700 rounded-lg">
				<p class="text-sm text-error-700 dark:text-error-300">
					⚠️ Destination address is not opted into USDC. The recipient must opt into USDC before you can send funds to this address.
				</p>
			</div>
		{:else if destinationOptedIn === true && isValidAddress}
			<div class="p-3 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-700 rounded-lg">
				<p class="text-sm text-success-700 dark:text-success-300">
					✓ Destination address is opted into USDC. Transfer is ready.
				</p>
			</div>
		{/if}

		<!-- Amount Input -->
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Amount (USDC)</label>
				<button
					type="button"
					onclick={setMaxAmount}
					disabled={isProcessing || !usdcBalance}
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
				placeholder="0.00"
				step="0.01"
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
							Withdrawal Successful!
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
					onclick={handleWithdraw}
					disabled={!canWithdraw}
					loading={isProcessing}
					class="flex-1"
				>
					Withdraw USDC
				</Button>
			{/if}
		</div>
	</div>
</Modal>

