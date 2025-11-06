<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import { generateVoiUri } from '$lib/voi/uri-utils';
	import QRCode from 'qrcode';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		address: string;
		usdcBalance?: { balance: string; decimals: number } | null;
	}

	let { isOpen, onClose, address, usdcBalance = null }: Props = $props();

	// Tab state
	type Tab = 'transfer' | 'swap';
	let activeTab = $state<Tab>('transfer');

	// Transfer tab state
	let qrCodeUrl = $state<string>('');
	let copySuccess = $state(false);
	let amountMicroVoi = $state<number | undefined>(undefined);

	// Swap tab state
	let usdcAmount = $state('');
	let quoteAmount = $state<string | null>(null);
	let isLoadingQuote = $state(false);

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
	}

	async function getQuote() {
		if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
			return;
		}

		// Placeholder: show mock quote
		// This will be replaced with actual DEX integration later
		isLoadingQuote = true;
		setTimeout(() => {
			// Mock conversion: 1 USDC ≈ 1.5 VOI (placeholder)
			const usdc = parseFloat(usdcAmount);
			const voiAmount = usdc * 1.5;
			quoteAmount = voiAmount.toFixed(6);
			isLoadingQuote = false;
		}, 500);
	}

	function handleClose() {
		activeTab = 'transfer';
		amountMicroVoi = undefined;
		usdcAmount = '';
		quoteAmount = null;
		onClose();
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
					activeTab = 'swap';
				}}
				class="px-4 py-2 text-sm font-medium transition-colors border-b-2 {activeTab === 'swap'
					? 'border-primary-500 text-primary-600 dark:text-primary-400'
					: 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'}"
			>
				Swap USDC → VOI
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

		<!-- Swap USDC → VOI Tab -->
		{#if activeTab === 'swap'}
			<div class="space-y-6">
				<!-- Instructions -->
				<div class="p-4 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-700 rounded-lg">
					<p class="text-sm text-warning-700 dark:text-warning-300">
						<strong>Coming Soon:</strong> DEX swap functionality is being implemented. You can enter an amount
						to see a placeholder quote, but the actual swap will be available in a future update.
					</p>
				</div>

				<!-- USDC Balance Display -->
				{#if usdcBalance}
					<div class="p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg">
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Available USDC:</span>
							<span class="text-lg font-bold text-warning-600 dark:text-warning-400 font-mono">
								{(BigInt(usdcBalance.balance) / BigInt(10 ** usdcBalance.decimals)).toString()}
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
				</div>

				<!-- Quote Button -->
				<Button
					variant="primary"
					size="md"
					onclick={getQuote}
					disabled={!usdcAmount || parseFloat(usdcAmount) <= 0 || isLoadingQuote}
					loading={isLoadingQuote}
					class="w-full"
				>
					Get Quote
				</Button>

				<!-- Quote Display -->
				{#if quoteAmount}
					<div class="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-700 rounded-lg">
						<div class="space-y-2">
							<p class="text-sm font-medium text-success-700 dark:text-success-300">Estimated Quote:</p>
							<p class="text-2xl font-bold text-success-600 dark:text-success-400">
								{usdcAmount} USDC ≈ {quoteAmount} VOI
							</p>
							<p class="text-xs text-success-600 dark:text-success-400 italic">
								* This is a placeholder quote. Actual swap rates will vary.
							</p>
						</div>
					</div>
				{/if}

				<!-- Note -->
				<div class="p-3 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg">
					<p class="text-xs text-neutral-600 dark:text-neutral-400">
						DEX swap functionality will be implemented in a future update. For now, please use the Transfer VOI
						option to deposit tokens directly.
					</p>
				</div>
			</div>
		{/if}
	</div>
</Modal>

