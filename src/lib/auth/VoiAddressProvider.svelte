<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { getInitializedCdp } from '$lib/auth/cdpClient';
	import { deriveAlgorandAccountFromEVM } from '$lib/chains/algorand-derive';
	import { buildProofOfOwnershipTransaction } from '$lib/chains/algorand-browser';
	import { getStoredVoiAddress, hasKeys, getKeys } from '$lib/auth/keyStorage';
	import algosdk from 'algosdk';

	import type { SessionInfo } from '$lib/auth/session';

	interface Props {
		children: any;
		session?: SessionInfo | null;
	}

	let { children, session = null }: Props = $props();

	let isEstablishing = $state(false);
	let error = $state<string | null>(null);
	let hasEstablished = $state(false); // Track if we've already tried to establish
	let lastSessionId = $state<string | null>(session?.profileId ?? null);
	let lastSessionVoiAddress = $state<string | null>(session?.voiAddress ?? null);

	/**
	 * Establishes the Voi session by:
	 * 1. Checking if session already has voiAddress
	 * 2. If not, checking stored keys for Voi address
	 * 3. If keys missing, attempting to recover from CDP (fallback)
	 * 4. Redirecting to /auth if no session exists and recovery fails
	 */
	async function establishVoiSession() {
		if (!browser) return;
		if (!session) {
			console.log('No session available; skipping Voi session establishment');
			return;
		}

		try {
			isEstablishing = true;
			error = null;

			// Check if we already have a Voi address in session
			if (session?.voiAddress) {
				// Session already has Voi address - nothing to do
				console.log('✅ Voi address already in session:', session.voiAddress);
				return;
			}

			// Try to get Voi address from stored keys and establish session
			if (hasKeys()) {
				const storedKeys = await getKeys();
				if (storedKeys?.voiAddress) {
					console.log('✅ Voi address found in stored keys:', storedKeys.voiAddress);
					
					// Establish session using stored keys
					// Convert hex string back to Uint8Array for signing
					const voiPrivateKeyHex = storedKeys.voiPrivateKey.replace(/^0x/, '');
					if (voiPrivateKeyHex.length !== 128) {
						throw new Error('Invalid stored Voi private key length');
					}
					
					const voiPrivateKey = new Uint8Array(
						voiPrivateKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
					);
					
					// Build and sign proof transaction
					const challengeToken = `voi-session-${Date.now()}-${Math.random().toString(36)}`;
					const proofTxn = await buildProofOfOwnershipTransaction(storedKeys.voiAddress, challengeToken);
					const signedTxn = algosdk.signTransaction(proofTxn, voiPrivateKey);
					const signedTxnBase64 = algosdk.bytesToBase64(signedTxn.blob);
					
					// Clean up private key from memory
					voiPrivateKey.fill(0);
					
					// Send to API to establish session
					const response = await fetch('/api/auth/voi/session', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							voiAddress: storedKeys.voiAddress,
							signedTransaction: signedTxnBase64,
						}),
					});
					
					const result = await response.json();
					
					if (!response.ok || !result.ok) {
						throw new Error(result.error || 'Failed to establish Voi session');
					}
					
					console.log('✅ Voi session established using stored keys:', result.voiAddress);
					
					// Small delay to ensure cookie is set, then reload
					// This ensures the server can read the cookie on the next request
					setTimeout(() => {
						window.location.reload();
					}, 100);
					return;
				}
			}

			// If no stored keys, attempt to recover from CDP (fallback)
			console.log('⚠️ No stored keys found, attempting CDP recovery...');
			const cdpSdk = await getInitializedCdp();
			const user = await cdpSdk.getCurrentUser();

			// If no CDP user, session is invalid - redirect to auth
			if (!user) {
				console.warn('No CDP user found - session invalid, redirecting to auth');
				await goto('/auth?expired=true');
				return;
			}

			// Get EVM accounts from CDP
			const evmAccounts = user.evmAccounts || [];
			if (evmAccounts.length === 0) {
				throw new Error('No Coinbase EVM accounts available for this session.');
			}

			// Export Base private key from CDP (for recovery)
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

			// Derive Voi account from EVM private key
			const derivedAccount = deriveAlgorandAccountFromEVM(exportedPrivateKey);

			// Clean up private key immediately
			exportedPrivateKey = '';

			// Build and sign proof transaction
			const challengeToken = `voi-session-${Date.now()}-${Math.random().toString(36)}`;
			const voiAddressStr = typeof derivedAccount.addr === 'string' ? derivedAccount.addr : derivedAccount.addr.toString();
			const proofTxn = await buildProofOfOwnershipTransaction(voiAddressStr, challengeToken);
			const signedTxn = algosdk.signTransaction(proofTxn, derivedAccount.sk);
			const signedTxnBase64 = algosdk.bytesToBase64(signedTxn.blob);

			// Clean up secret key
			derivedAccount.sk.fill(0);

			// Send to API to establish session
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

			console.log('✅ Voi session established via CDP recovery:', result.voiAddress);
			
			// Small delay to ensure cookie is set, then reload
			setTimeout(() => {
				window.location.reload();
			}, 100);
		} catch (err) {
			console.error('Failed to establish Voi session:', err);
			error = err instanceof Error ? err.message : 'Failed to establish Voi session';

			// Only redirect for authentication-related errors
			if (
				err instanceof Error && (
					err.message.includes('Not authenticated') ||
					err.message.includes('No CDP user') ||
					err.message.includes('CDP session') ||
					err.message.includes('Please log in') ||
					err.message.includes('401')
				)
			) {
				console.warn('Session restoration failed - redirecting to auth');
				await goto('/auth?expired=true');
				return;
			}
			// For other errors (network, etc.), show error UI and allow retry
		} finally {
			isEstablishing = false;
		}
	}

	// Watch for session changes and establish if needed
	// Track session changes so we know when to allow re-establishment
	$effect(() => {
		const currentSessionId = session?.profileId ?? null;
		const currentVoiAddress = session?.voiAddress ?? null;

		// Reset when user changes or when server session loses the Voi address after previously having it
		if (currentSessionId !== lastSessionId) {
			hasEstablished = false;
		} else if (lastSessionVoiAddress && !currentVoiAddress) {
			hasEstablished = false;
		}

		lastSessionId = currentSessionId;
		lastSessionVoiAddress = currentVoiAddress;
	});

	// Attempt to establish when needed
	$effect(() => {
		if (!browser || !session) {
			return;
		}

		if (hasEstablished || isEstablishing) {
			return;
		}

		// Session already has the Voi address, nothing to do
		if (session.voiAddress) {
			hasEstablished = true;
			return;
		}

		hasEstablished = true;
		establishVoiSession();
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
