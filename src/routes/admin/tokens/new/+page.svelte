<script lang="ts">
	import { goto } from '$app/navigation';
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { notificationStore } from '$lib/stores/notificationStore.svelte';
	import type { ChainType, TokenStandard, TokenCreateRequest } from '$lib/types/token';

	// Form state
	let chain = $state<ChainType>('voi');
	let tokenStandard = $state<TokenStandard>('voi_arc200');
	let contractId = $state<string>('');
	let symbol = $state('');
	let name = $state('');
	let decimals = $state(6);
	let displaySymbol = $state('');
	let displayName = $state('');
	let iconUrl = $state('');
	let isDisplayable = $state(false);
	let isGameEnabled = $state(false);
	let isTreasuryEnabled = $state(false);

	let submitting = $state(false);
	let fetchingMetadata = $state(false);
	let error = $state<string | null>(null);

	// Auto-update token standard options based on chain
	const standardOptions = $derived(() => {
		if (chain === 'voi') {
			return [
				{ value: 'native', label: 'Native (VOI)' },
				{ value: 'voi_asa', label: 'ASA (Algorand Standard Asset)' },
				{ value: 'voi_arc200', label: 'ARC200 Token' }
			];
		} else if (chain === 'base') {
			return [
				{ value: 'native', label: 'Native (ETH)' },
				{ value: 'base_erc20', label: 'ERC20 Token' }
			];
		} else {
			return [
				{ value: 'native', label: 'Native (SOL)' },
				{ value: 'solana_spl', label: 'SPL Token' }
			];
		}
	});

	// Determine if contract ID is needed
	const needsContractId = $derived(tokenStandard !== 'native');

	// Fetch token metadata from chain when contract ID is entered
	const fetchMetadata = async () => {
		if (!contractId || !needsContractId) return;

		const contractIdNum = parseInt(contractId);
		if (isNaN(contractIdNum)) return;

		fetchingMetadata = true;
		try {
			// For ARC200 tokens, try to fetch metadata
			if (tokenStandard === 'voi_arc200') {
				const response = await fetch(`/api/arc200/${contractIdNum}`);
				if (response.ok) {
					const data = await response.json();
					if (data.success && data.data) {
						symbol = data.data.symbol || symbol;
						name = data.data.name || name;
						decimals = data.data.decimals ?? decimals;
						notificationStore.success('Token metadata fetched from chain');
					}
				}
			}
		} catch (err) {
			console.warn('Could not fetch token metadata:', err);
		} finally {
			fetchingMetadata = false;
		}
	};

	const handleSubmit = async () => {
		error = null;

		// Validation
		if (!symbol.trim()) {
			error = 'Symbol is required';
			return;
		}
		if (!name.trim()) {
			error = 'Name is required';
			return;
		}
		if (needsContractId && !contractId.trim()) {
			error = 'Contract ID is required for this token standard';
			return;
		}

		submitting = true;

		try {
			const payload: TokenCreateRequest = {
				chain,
				token_standard: tokenStandard,
				contract_id: needsContractId ? parseInt(contractId) : undefined,
				symbol: symbol.trim(),
				name: name.trim(),
				decimals,
				display_symbol: displaySymbol.trim() || undefined,
				display_name: displayName.trim() || undefined,
				icon_url: iconUrl.trim() || undefined,
				is_displayable: isDisplayable,
				is_game_enabled: isGameEnabled,
				is_treasury_enabled: isTreasuryEnabled
			};

			const response = await fetch('/api/admin/tokens', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const result = await response.json();

			if (result.success) {
				notificationStore.success('Token created successfully');
				goto('/admin/tokens');
			} else {
				error = result.error || 'Failed to create token';
			}
		} catch (err) {
			console.error('Error creating token:', err);
			error = 'Failed to create token';
		} finally {
			submitting = false;
		}
	};
</script>

<svelte:head>
	<title>Add Token - Admin - House of Voi</title>
</svelte:head>

<div class="space-y-8 max-w-3xl mx-auto">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-4xl font-semibold text-neutral-950 dark:text-white uppercase">Add Token</h1>
			<p class="text-neutral-700 dark:text-neutral-300 mt-2">Register a new token for the platform</p>
		</div>
		<a href="/admin/tokens">
			<Button variant="outline" size="sm">Cancel</Button>
		</a>
	</div>

	{#if error}
		<div class="p-4 bg-error-500/10 border border-error-500/30 rounded-lg text-error-600 dark:text-error-400">
			{error}
		</div>
	{/if}

	<Card>
		<CardContent class="p-6">
			<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
				<!-- Chain & Standard -->
				<div class="grid md:grid-cols-2 gap-4">
					<div>
						<label for="chain" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
							Chain
						</label>
						<select
							id="chain"
							bind:value={chain}
							class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
						>
							<option value="voi">VOI (Algorand)</option>
							<option value="base">Base (Ethereum L2)</option>
							<option value="solana">Solana</option>
						</select>
					</div>

					<div>
						<label for="tokenStandard" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
							Token Standard
						</label>
						<select
							id="tokenStandard"
							bind:value={tokenStandard}
							class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
						>
							{#each standardOptions() as opt}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
					</div>
				</div>

				<!-- Contract ID -->
				{#if needsContractId}
					<div>
						<label for="contractId" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
							Contract ID / App ID
						</label>
						<div class="flex gap-2">
							<input
								id="contractId"
								type="text"
								bind:value={contractId}
								placeholder="e.g., 47138068"
								class="flex-1 px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
							/>
							{#if tokenStandard === 'voi_arc200'}
								<Button
									type="button"
									variant="outline"
									size="sm"
									onclick={fetchMetadata}
									disabled={fetchingMetadata || !contractId}
								>
									{fetchingMetadata ? 'Fetching...' : 'Fetch Metadata'}
								</Button>
							{/if}
						</div>
						<p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
							The on-chain application/contract ID
						</p>
					</div>
				{/if}

				<!-- Symbol & Name -->
				<div class="grid md:grid-cols-2 gap-4">
					<div>
						<label for="symbol" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
							Symbol *
						</label>
						<input
							id="symbol"
							type="text"
							bind:value={symbol}
							placeholder="e.g., WAD"
							required
							class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
						/>
					</div>

					<div>
						<label for="name" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
							Name *
						</label>
						<input
							id="name"
							type="text"
							bind:value={name}
							placeholder="e.g., WAD Token"
							required
							class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
						/>
					</div>
				</div>

				<!-- Decimals -->
				<div>
					<label for="decimals" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
						Decimals
					</label>
					<input
						id="decimals"
						type="number"
						bind:value={decimals}
						min="0"
						max="18"
						class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
					/>
					<p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
						Number of decimal places (typically 6 for VOI tokens)
					</p>
				</div>

				<!-- Display Overrides -->
				<div class="border-t border-neutral-200 dark:border-neutral-700 pt-6">
					<h3 class="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-4">Display Overrides (Optional)</h3>
					<div class="grid md:grid-cols-2 gap-4">
						<div>
							<label for="displaySymbol" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
								Display Symbol
							</label>
							<input
								id="displaySymbol"
								type="text"
								bind:value={displaySymbol}
								placeholder="e.g., USDC instead of aUSDC"
								class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
							/>
						</div>

						<div>
							<label for="displayName" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
								Display Name
							</label>
							<input
								id="displayName"
								type="text"
								bind:value={displayName}
								placeholder="Override name for UI"
								class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
							/>
						</div>
					</div>

					<div class="mt-4">
						<label for="iconUrl" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
							Icon URL
						</label>
						<input
							id="iconUrl"
							type="url"
							bind:value={iconUrl}
							placeholder="https://..."
							class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
						/>
					</div>
				</div>

				<!-- Flags -->
				<div class="border-t border-neutral-200 dark:border-neutral-700 pt-6">
					<h3 class="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-4">Permissions</h3>
					<div class="space-y-3">
						<label class="flex items-center gap-3 cursor-pointer">
							<input
								type="checkbox"
								bind:checked={isDisplayable}
								class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
							/>
							<div>
								<span class="text-neutral-900 dark:text-neutral-100 font-medium">Show in wallet balances</span>
								<p class="text-xs text-neutral-500 dark:text-neutral-400">Users will see this token in their wallet</p>
							</div>
						</label>

						<label class="flex items-center gap-3 cursor-pointer">
							<input
								type="checkbox"
								bind:checked={isGameEnabled}
								class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
							/>
							<div>
								<span class="text-neutral-900 dark:text-neutral-100 font-medium">Enable for games</span>
								<p class="text-xs text-neutral-500 dark:text-neutral-400">Allow using this token for game bets</p>
							</div>
						</label>

						<label class="flex items-center gap-3 cursor-pointer">
							<input
								type="checkbox"
								bind:checked={isTreasuryEnabled}
								class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
							/>
							<div>
								<span class="text-neutral-900 dark:text-neutral-100 font-medium">Enable for treasury</span>
								<p class="text-xs text-neutral-500 dark:text-neutral-400">Allow depositing to house pool treasuries</p>
							</div>
						</label>
					</div>
				</div>

				<!-- Submit -->
				<div class="flex justify-end gap-4 pt-4">
					<a href="/admin/tokens">
						<Button variant="outline" type="button">Cancel</Button>
					</a>
					<Button variant="primary" type="submit" disabled={submitting}>
						{submitting ? 'Creating...' : 'Create Token'}
					</Button>
				</div>
			</form>
		</CardContent>
	</Card>
</div>
