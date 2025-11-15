/**
 * House Wallet Store
 * Manages wallet selection for house operations (deposits/withdrawals)
 * Supports both CDP-derived addresses and external wallets via avm-wallet-svelte
 */

import { selectedWallet as avmSelectedWallet, signTransactions } from 'avm-wallet-svelte';
import { PUBLIC_VOI_NODE_URL } from '$env/static/public';
import type { ExternalWallet, WalletSource } from '$lib/types/house';

const DEFAULT_ALGOD_URL = 'https://mainnet-api.voi.nodely.dev';
const ALGOD_API_BASE = (PUBLIC_VOI_NODE_URL || DEFAULT_ALGOD_URL).replace(/\/$/, '');

interface HouseWalletState {
	// Active wallet source
	activeSource: WalletSource; // 'cdp' | 'external'

	// CDP wallet info (from session)
	cdpAddress: string | null;
	cdpBalance: bigint;

	// External wallet info (from avm-wallet-svelte)
	externalWallet: ExternalWallet | null;
	externalBalance: bigint;

	// Connection states
	isCdpAvailable: boolean;
	isExternalConnected: boolean;

	// UI states
	isLoading: boolean;
	error: string | null;
}

function createHouseWallet() {
	let state = $state<HouseWalletState>({
		activeSource: 'cdp',
		cdpAddress: null,
		cdpBalance: 0n,
		externalWallet: null,
		externalBalance: 0n,
		isCdpAvailable: false,
		isExternalConnected: false,
		isLoading: false,
		error: null
	});

	// Subscribe to avm-wallet-svelte selectedWallet changes
	let avmUnsubscribe: (() => void) | null = null;

	// Initialize external wallet subscription
	if (typeof window !== 'undefined') {
		avmUnsubscribe = avmSelectedWallet.subscribe((wallet) => {
			if (wallet && wallet.address) {
				state.externalWallet = {
					address: wallet.address,
					provider: mapWalletProvider(wallet.app || 'unknown'),
					isConnected: true,
					isLinked: false // Will be updated after checking with API
				};
				state.isExternalConnected = true;

				// If CDP is not available, auto-select external wallet
				if (!state.isCdpAvailable && state.activeSource === 'cdp') {
					state.activeSource = 'external';
				}

				void refreshExternalBalanceInternal(wallet.address);
			} else {
				state.externalWallet = null;
				state.isExternalConnected = false;
				state.externalBalance = 0n;

				// If external was selected and is now disconnected, switch to CDP
				if (state.activeSource === 'external' && state.isCdpAvailable) {
					state.activeSource = 'cdp';
				}
			}
		});
	}

	// Map avm-wallet-svelte app names to our provider types
	function mapWalletProvider(app: string): ExternalWallet['provider'] {
		const appLower = app.toLowerCase();
		if (appLower.includes('kibisis')) return 'kibisis';
		if (appLower.includes('lute')) return 'lute';
		if (appLower.includes('pera')) return 'pera';
		if (appLower.includes('walletconnect') || appLower.includes('wallet connect')) return 'walletconnect';
		return 'walletconnect'; // Default
	}

	async function fetchVoiBalance(address: string | null): Promise<bigint> {
		if (!address) return 0n;

		try {
			const response = await fetch(`${ALGOD_API_BASE}/v2/accounts/${address}`, {
				cache: 'no-store',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				console.error('[houseWallet] Failed to fetch balance', {
					address,
					status: response.status,
					statusText: response.statusText,
					url: `${ALGOD_API_BASE}/v2/accounts/${address}`
				});
				return 0n;
			}

			const data = await response.json();
			console.log('[houseWallet] Raw API response:', { address, data });

			// For algosdk v3, the response should have 'amount' at the top level
			let amountValue: string;

			if (data && typeof data.amount !== 'undefined') {
				// Amount is at top level (standard algod v2 API response)
				amountValue = typeof data.amount === 'number'
					? data.amount.toString()
					: String(data.amount);
			} else if (data && data.account && typeof data.account.amount !== 'undefined') {
				// Some APIs nest it under account
				amountValue = typeof data.account.amount === 'number'
					? data.account.amount.toString()
					: String(data.account.amount);
			} else {
				console.warn('[houseWallet] Unexpected response structure:', data);
				amountValue = '0';
			}

			const balance = BigInt(amountValue);
			console.log('[houseWallet] Parsed balance', {
				address: address.slice(0, 8) + '...' + address.slice(-6),
				balance: balance.toString(),
				balanceVOI: (Number(balance) / 1_000_000).toFixed(6)
			});
			return balance;
		} catch (error) {
			console.error('[houseWallet] Error fetching VOI balance', { address, error });
			return 0n;
		}
	}

	async function refreshCdpBalanceInternal(address = state.cdpAddress): Promise<bigint> {
		if (!address) return 0n;
		const balance = await fetchVoiBalance(address);
		if (state.cdpAddress === address) {
			state.cdpBalance = balance;
		}
		return balance;
	}

	async function refreshExternalBalanceInternal(
		address = state.externalWallet?.address || null
	): Promise<bigint> {
		if (!address) return 0n;
		const balance = await fetchVoiBalance(address);
		if (state.externalWallet?.address === address) {
			state.externalBalance = balance;
		}
		return balance;
	}

	return {
		// Expose state as readonly
		get activeSource() { return state.activeSource; },
		get cdpAddress() { return state.cdpAddress; },
		get cdpBalance() { return state.cdpBalance; },
		get externalWallet() { return state.externalWallet; },
		get externalBalance() { return state.externalBalance; },
		get isCdpAvailable() { return state.isCdpAvailable; },
		get isExternalConnected() { return state.isExternalConnected; },
		get isLoading() { return state.isLoading; },
		get error() { return state.error; },

		// Computed properties
		get activeAddress(): string | null {
			if (state.activeSource === 'cdp') return state.cdpAddress;
			if (state.activeSource === 'external') return state.externalWallet?.address || null;
			return null;
		},

		get activeBalance(): bigint {
			if (state.activeSource === 'cdp') return state.cdpBalance;
			if (state.activeSource === 'external') return state.externalBalance;
			return 0n;
		},

		get hasWalletAvailable(): boolean {
			return state.isCdpAvailable || state.isExternalConnected;
		},

		// Actions
		initializeCdpWallet(address: string) {
			state.cdpAddress = address;
			state.isCdpAvailable = true;

			// If no wallet is active and CDP becomes available, select it
			if (!state.isExternalConnected) {
				state.activeSource = 'cdp';
			}

			void refreshCdpBalanceInternal(address);
		},

		setActiveSource(source: WalletSource) {
			if (source === 'cdp' && !state.isCdpAvailable) {
				state.error = 'CDP wallet not available';
				return;
			}
			if (source === 'external' && !state.isExternalConnected) {
				state.error = 'No external wallet connected';
				return;
			}
			state.activeSource = source;
			state.error = null;
		},

		async updateCdpBalance(balance: bigint) {
			state.cdpBalance = balance;
		},

		async updateExternalBalance(balance: bigint) {
			state.externalBalance = balance;
		},

		async refreshBalances() {
			await Promise.all([refreshCdpBalanceInternal(), refreshExternalBalanceInternal()]);
		},

		async refreshCdpBalance() {
			await refreshCdpBalanceInternal();
		},

		async refreshExternalBalance() {
			await refreshExternalBalanceInternal();
		},

		async checkExternalWalletLinked(profileId: string): Promise<boolean> {
			if (!state.externalWallet) return false;

			try {
				const response = await fetch(`/api/wallets/check?address=${state.externalWallet.address}`);
				const data = await response.json();

				if (state.externalWallet) {
					state.externalWallet.isLinked = data.isLinked || false;
				}

				return data.isLinked || false;
			} catch (error) {
				console.error('Error checking wallet linked status:', error);
				return false;
			}
		},

		async linkExternalWallet(): Promise<boolean> {
			if (!state.externalWallet) {
				state.error = 'No external wallet connected';
				return false;
			}

			state.isLoading = true;
			state.error = null;

			try {
				// Import functions dynamically to avoid circular dependencies
				const { buildProofOfOwnershipTransaction } = await import('$lib/chains/algorand-browser');

				// Create a challenge token
				const challengeToken = `house-link-${Date.now()}-${Math.random().toString(36).substring(7)}`;

				// Build proof transaction
				const proofTxn = await buildProofOfOwnershipTransaction(
					state.externalWallet.address,
					challengeToken
				);
				console.log('proofTxn', proofTxn);

				// Sign with external wallet - pass array of transaction groups
				// Each group is an array of Transaction objects (not encoded)
				const signedTxns = await signTransactions([[proofTxn]]);

				if (!signedTxns || signedTxns.length === 0) {
					state.error = 'Failed to sign proof transaction';
					return false;
				}

				// signedTxns[0] is the signed transaction blob (Uint8Array)
				// Convert to base64
				const signedTxnBase64 = Buffer.from(signedTxns[0]).toString('base64');

				// Send to API
				const response = await fetch('/api/wallets/link', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						address: state.externalWallet.address,
						provider: state.externalWallet.provider,
						signedProof: signedTxnBase64
					})
				});

				const data = await response.json();

				if (!response.ok) {
					state.error = data.error || 'Failed to link wallet';
					return false;
				}

				if (state.externalWallet) {
					state.externalWallet.isLinked = true;
				}

				return true;
			} catch (error) {
				console.error('Wallet linking error:', error);
				state.error = error instanceof Error ? error.message : 'Failed to link wallet';
				return false;
			} finally {
				state.isLoading = false;
			}
		},

		clearError() {
			state.error = null;
		},

		// Cleanup
		destroy() {
			if (avmUnsubscribe) {
				avmUnsubscribe();
			}
		}
	};
}

export const houseWallet = createHouseWallet();
