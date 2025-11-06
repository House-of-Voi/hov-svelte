<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { getInitializedCdp } from '$lib/auth/cdpClient';
	import { deriveAlgorandAccountFromEVM } from '$lib/chains/algorand-derive';
	import { buildProofOfOwnershipTransaction } from '$lib/chains/algorand-browser';
	import algosdk from 'algosdk';

	import type { SessionInfo } from '$lib/auth/session';

	interface Props {
		children: any;
		session?: SessionInfo | null;
	}

	let { children, session = null }: Props = $props();

	let isEstablishing = $state(false);
	let error = $state<string | null>(null);

	/**
	 * Establishes the Voi session by:
	 * 1. Checking if session already has voiAddress
	 * 2. If not, deriving it from CDP and storing it via API
	 * 3. Redirecting to /auth if no session exists
	 */
	async function establishVoiSession() {
		if (!browser) return;

		try {
			isEstablishing = true;
			error = null;

		// Check if we already have a Voi address in session
		// CDP is the source of truth - never fall back to API/DB
		if (session?.voiAddress) {
			// Session already has Voi address - nothing to do
			console.log('✅ Voi address already in session:', session.voiAddress);
			return;
		}

		// Need to establish Voi session
		// 1. Get CDP SDK
		const cdpSdk = await getInitializedCdp();
		const user = await cdpSdk.getCurrentUser();

		// CDP session is the source of truth - if no user, CDP is not signed in
		// This means the user needs to re-authenticate
		if (!user) {
			console.warn('No CDP user found - CDP session not active, redirecting to auth');
			await goto('/auth');
			return;
		}

		// 2. Get EVM accounts
		const evmAccounts = user.evmAccounts || [];
		if (evmAccounts.length === 0) {
			throw new Error('No Coinbase EVM accounts available for this session.');
		}

		// 3. Export Base private key
		let exportedPrivateKey: string | null = null;
		let baseWalletAddress: string | null = null;

		for (const candidate of evmAccounts) {
			const formatted = candidate.startsWith('0x')
				? (candidate as `0x${string}`)
				: (`0x${candidate.replace(/^0x/, '')}` as `0x${string}`);

			try {
				const { privateKey } = await cdpSdk.exportEvmAccount({
					evmAccount: formatted,
				});

				if (privateKey) {
					exportedPrivateKey = privateKey;
					baseWalletAddress = formatted;
					break;
				}
			} catch (exportError) {
				console.warn('CDP key export failed for candidate', candidate, exportError);
			}
		}

		if (!exportedPrivateKey || !baseWalletAddress) {
			throw new Error('Failed to export Base private key from CDP wallet.');
		}

		// 4. Derive Voi account from EVM private key
		const derivedAccount = deriveAlgorandAccountFromEVM(exportedPrivateKey);

		// Clean up private key immediately
		exportedPrivateKey = '';

		// 5. Build and sign proof transaction
		// Use a simple challenge token (timestamp + random)
		const challengeToken = `voi-session-${Date.now()}-${Math.random().toString(36)}`;
		const voiAddressStr = typeof derivedAccount.addr === 'string' ? derivedAccount.addr : derivedAccount.addr.toString();
		const proofTxn = buildProofOfOwnershipTransaction(voiAddressStr, challengeToken);
		const signedTxn = algosdk.signTransaction(proofTxn, derivedAccount.sk);
		const signedTxnBase64 = algosdk.bytesToBase64(signedTxn.blob);

		// Clean up secret key
		derivedAccount.sk.fill(0);

		// 6. Send to API to establish session
		const response = await fetch('/api/auth/voi/session', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				voiAddress: derivedAccount.addr,
				signedTransaction: signedTxnBase64,
			}),
		});

		const result = await response.json();

		if (!response.ok || !result.ok) {
			throw new Error(result.error || 'Failed to establish Voi session');
		}

		console.log('✅ Voi session established:', result.voiAddress);
		} catch (err) {
			console.error('Failed to establish Voi session:', err);
			error = err instanceof Error ? err.message : 'Failed to establish Voi session';

			// CDP session is the source of truth - if we can't restore it, user needs to re-authenticate
			// Only redirect for authentication-related errors (not transient network errors)
			if (
				err instanceof Error && (
					err.message.includes('Not authenticated') ||
					err.message.includes('No CDP user') ||
					err.message.includes('CDP session') ||
					err.message.includes('Please log in') ||
					err.message.includes('401')
				)
			) {
				console.warn('CDP session restoration failed - redirecting to auth');
				await goto('/auth');
				return;
			}
			// For other errors (network, etc.), show error UI and allow retry
		} finally {
			isEstablishing = false;
		}
	}

	onMount(() => {
		if (browser) {
			establishVoiSession();
		}
	});
</script>

{#if isEstablishing}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
		<div class="bg-neutral-900 rounded-lg p-6 max-w-md mx-4">
			<div class="flex items-center gap-3">
				<div class="animate-spin rounded-full h-5 w-5 border-2 border-neutral-600 border-t-warning-500"></div>
				<p class="text-neutral-300">Establishing Voi session...</p>
			</div>
		</div>
	</div>
{/if}

{#if error}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
		<div class="bg-neutral-900 rounded-lg p-6 max-w-md mx-4 space-y-4">
			<div class="text-error-400 font-semibold">Error establishing session</div>
			<p class="text-neutral-300 text-sm">{error}</p>
			<button
				onclick={() => {
					error = null;
					establishVoiSession();
				}}
				class="w-full px-4 py-2 bg-warning-500 hover:bg-warning-600 text-white rounded-lg font-semibold transition-colors"
			>
				Retry
			</button>
		</div>
	</div>
{/if}

{@render children()}
