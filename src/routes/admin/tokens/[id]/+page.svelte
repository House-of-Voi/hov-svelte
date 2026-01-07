<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { notificationStore } from '$lib/stores/notificationStore.svelte';
	import type { Token, TokenUpdateRequest } from '$lib/types/token';

	let token = $state<Token | null>(null);
	let loading = $state(true);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	// Form state (initialized from token)
	let symbol = $state('');
	let name = $state('');
	let decimals = $state(6);
	let displaySymbol = $state('');
	let displayName = $state('');
	let iconUrl = $state('');
	let isDisplayable = $state(false);
	let isGameEnabled = $state(false);
	let isTreasuryEnabled = $state(false);

	const tokenId = $derived($page.params.id);

	const fetchToken = async () => {
		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/admin/tokens/${tokenId}`);
			const result = await response.json();

			if (result.success && result.data) {
				const loadedToken = result.data;
				token = loadedToken;
				// Initialize form state
				symbol = loadedToken.symbol;
				name = loadedToken.name;
				decimals = loadedToken.decimals;
				displaySymbol = loadedToken.display_symbol || '';
				displayName = loadedToken.display_name || '';
				iconUrl = loadedToken.icon_url || '';
				isDisplayable = loadedToken.is_displayable;
				isGameEnabled = loadedToken.is_game_enabled;
				isTreasuryEnabled = loadedToken.is_treasury_enabled;
			} else {
				error = result.error || 'Failed to load token';
			}
		} catch (err) {
			console.error('Error fetching token:', err);
			error = 'Failed to load token';
		} finally {
			loading = false;
		}
	};

	const handleSubmit = async () => {
		if (!token) return;

		error = null;
		submitting = true;

		try {
			const payload: TokenUpdateRequest = {
				symbol: symbol.trim(),
				name: name.trim(),
				decimals,
				display_symbol: displaySymbol.trim() || null,
				display_name: displayName.trim() || null,
				icon_url: iconUrl.trim() || null,
				is_displayable: isDisplayable,
				is_game_enabled: isGameEnabled,
				is_treasury_enabled: isTreasuryEnabled
			};

			const response = await fetch(`/api/admin/tokens/${tokenId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const result = await response.json();

			if (result.success) {
				notificationStore.success('Token updated successfully');
				goto('/admin/tokens');
			} else {
				error = result.error || 'Failed to update token';
			}
		} catch (err) {
			console.error('Error updating token:', err);
			error = 'Failed to update token';
		} finally {
			submitting = false;
		}
	};

	const handleDelete = async () => {
		if (!token) return;
		if (token.token_standard === 'native') {
			notificationStore.error('Native tokens cannot be deleted');
			return;
		}

		if (!confirm(`Are you sure you want to deactivate ${token.symbol}? This will disable all features for this token.`)) {
			return;
		}

		try {
			const response = await fetch(`/api/admin/tokens/${tokenId}`, {
				method: 'DELETE'
			});

			const result = await response.json();

			if (result.success) {
				notificationStore.success('Token deactivated');
				goto('/admin/tokens');
			} else {
				notificationStore.error(result.error || 'Failed to deactivate token');
			}
		} catch (err) {
			console.error('Error deleting token:', err);
			notificationStore.error('Failed to deactivate token');
		}
	};

	const getStandardLabel = (standard: string) => {
		const labels: Record<string, string> = {
			native: 'Native',
			voi_asa: 'ASA',
			voi_arc200: 'ARC200',
			base_erc20: 'ERC20',
			solana_spl: 'SPL'
		};
		return labels[standard] || standard;
	};

	onMount(() => {
		fetchToken();
	});
</script>

<svelte:head>
	<title>{token ? `Edit ${token.symbol}` : 'Edit Token'} - Admin - House of Voi</title>
</svelte:head>

<div class="space-y-8 max-w-3xl mx-auto">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-4xl font-semibold text-neutral-950 dark:text-white uppercase">
				{#if token}Edit {token.symbol}{:else}Edit Token{/if}
			</h1>
			<p class="text-neutral-700 dark:text-neutral-300 mt-2">Update token settings</p>
		</div>
		<a href="/admin/tokens">
			<Button variant="outline" size="sm">Back to Tokens</Button>
		</a>
	</div>

	{#if error}
		<div class="p-4 bg-error-500/10 border border-error-500/30 rounded-lg text-error-600 dark:text-error-400">
			{error}
		</div>
	{/if}

	{#if loading}
		<Card>
			<CardContent class="p-8 text-center text-neutral-500">Loading token...</CardContent>
		</Card>
	{:else if !token}
		<Card>
			<CardContent class="p-8 text-center">
				<div class="text-neutral-500 mb-4">Token not found</div>
				<a href="/admin/tokens">
					<Button variant="outline">Back to Tokens</Button>
				</a>
			</CardContent>
		</Card>
	{:else}
		<!-- Token Info (Read-only) -->
		<Card>
			<CardContent class="p-6">
				<h2 class="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-4">Token Information</h2>
				<dl class="grid md:grid-cols-2 gap-4 text-sm">
					<div>
						<dt class="text-neutral-500 dark:text-neutral-400">Chain</dt>
						<dd class="text-neutral-900 dark:text-neutral-100 font-medium uppercase">{token.chain}</dd>
					</div>
					<div>
						<dt class="text-neutral-500 dark:text-neutral-400">Standard</dt>
						<dd class="text-neutral-900 dark:text-neutral-100 font-medium">{getStandardLabel(token.token_standard)}</dd>
					</div>
					{#if token.contract_id}
						<div>
							<dt class="text-neutral-500 dark:text-neutral-400">Contract ID</dt>
							<dd class="text-neutral-900 dark:text-neutral-100 font-mono">{token.contract_id}</dd>
						</div>
					{/if}
					<div>
						<dt class="text-neutral-500 dark:text-neutral-400">Status</dt>
						<dd>
							{#if token.is_active}
								<span class="text-success-600 dark:text-success-400 font-medium">Active</span>
							{:else}
								<span class="text-neutral-500 font-medium">Inactive</span>
							{/if}
						</dd>
					</div>
				</dl>
			</CardContent>
		</Card>

		<!-- Edit Form -->
		<Card>
			<CardContent class="p-6">
				<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
					<!-- Symbol & Name -->
					<div class="grid md:grid-cols-2 gap-4">
						<div>
							<label for="symbol" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
								Symbol
							</label>
							<input
								id="symbol"
								type="text"
								bind:value={symbol}
								class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
							/>
						</div>

						<div>
							<label for="name" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
								Name
							</label>
							<input
								id="name"
								type="text"
								bind:value={name}
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
					</div>

					<!-- Display Overrides -->
					<div class="border-t border-neutral-200 dark:border-neutral-700 pt-6">
						<h3 class="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-4">Display Overrides</h3>
						<div class="grid md:grid-cols-2 gap-4">
							<div>
								<label for="displaySymbol" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
									Display Symbol
								</label>
								<input
									id="displaySymbol"
									type="text"
									bind:value={displaySymbol}
									placeholder="Leave empty to use symbol"
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
									placeholder="Leave empty to use name"
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

					<!-- Actions -->
					<div class="flex justify-between gap-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
						<div>
							{#if token.token_standard !== 'native'}
								<Button
									variant="outline"
									type="button"
									onclick={handleDelete}
									class="border-error-500/50 text-error-500 hover:bg-error-500/10"
								>
									Deactivate Token
								</Button>
							{/if}
						</div>
						<div class="flex gap-4">
							<a href="/admin/tokens">
								<Button variant="outline" type="button">Cancel</Button>
							</a>
							<Button variant="primary" type="submit" disabled={submitting}>
								{submitting ? 'Saving...' : 'Save Changes'}
							</Button>
						</div>
					</div>
				</form>
			</CardContent>
		</Card>
	{/if}
</div>
