<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { GameBridge } from '$lib/game-engine/bridge/GameBridge';
	import { StoredKeySigner } from '$lib/wallet/StoredKeySigner';
	import { canDecryptKeys, hasGameAccountKeys } from '$lib/auth/gameAccountStorage';
	import { MESSAGE_NAMESPACE } from '$lib/game-engine/bridge/types';
	import UnlockGameAccount from '$lib/components/gameAccounts/UnlockGameAccount.svelte';

	interface Props {
		contractId: bigint;
		walletAddress: string;
		/** Recovery method for the account (for unlock modal) */
		recoveryMethod?: 'email' | 'sms' | 'google' | 'mnemonic' | null;
		/** Obfuscated recovery hint (for unlock modal) */
		recoveryHint?: string | null;
		children?: import('svelte').Snippet;
	}

	let { contractId, walletAddress, recoveryMethod = null, recoveryHint = null, children }: Props = $props();

	let bridge: GameBridge | null = $state(null);
	let initError: string | null = $state(null);
	let isInitializing = false;

	// Track previous props to detect changes
	let prevContractId: bigint | undefined = undefined;
	let prevWalletAddress: string | undefined = undefined;

	// Account lock state
	let isAccountLocked = $state(false);
	let lockReason = $state<'no_keys' | 'cannot_decrypt' | 'cookie_expired' | undefined>(undefined);
	let showUnlockModal = $state(false);

	// Message handler for REQUEST_UNLOCK from game
	let unlockRequestHandler: ((event: MessageEvent) => void) | null = null;

	/**
	 * Check if the account is locked (cannot decrypt keys)
	 */
	function checkLockStatus(): { locked: boolean; reason?: 'no_keys' | 'cannot_decrypt' | 'cookie_expired' } {
		// Check if we have the cookie needed to decrypt
		if (!canDecryptKeys()) {
			return { locked: true, reason: 'cookie_expired' };
		}

		// Check if keys exist for this address
		if (!hasGameAccountKeys(walletAddress)) {
			return { locked: true, reason: 'no_keys' };
		}

		return { locked: false };
	}

	/**
	 * Send ACCOUNT_LOCKED message to game
	 */
	function sendAccountLockedMessage(locked: boolean, reason?: 'no_keys' | 'cannot_decrypt' | 'cookie_expired') {
		const message = {
			namespace: MESSAGE_NAMESPACE,
			type: 'ACCOUNT_LOCKED',
			payload: {
				locked,
				voiAddress: walletAddress,
				reason
			}
		};

		// Send via postMessage (same pattern as GameBridge)
		window.postMessage(message, '*');
		console.log('GameBridgeWrapper: Sent ACCOUNT_LOCKED message', { locked, reason });
	}

	/**
	 * Handle successful unlock
	 */
	function handleUnlockSuccess() {
		console.log('GameBridgeWrapper: Account unlocked successfully');
		showUnlockModal = false;
		isAccountLocked = false;
		lockReason = undefined;

		// Notify game that account is now unlocked
		sendAccountLockedMessage(false);

		// Re-initialize the bridge if it wasn't initialized due to lock
		if (!bridge && !isInitializing) {
			initializeBridge();
		}
	}

	/**
	 * Handle unlock modal close
	 */
	function handleUnlockClose() {
		showUnlockModal = false;
	}

	/**
	 * Initialize the game bridge
	 */
	async function initializeBridge() {
		if (isInitializing || bridge) {
			return;
		}

		isInitializing = true;

		try {
			console.log('GameBridgeWrapper: Initializing bridge', {
				contractId: contractId.toString(),
				walletAddress
			});

			// Create signer using stored keys
			const signer = new StoredKeySigner(walletAddress);
			console.log('GameBridgeWrapper: Signer created for address:', walletAddress);

			// Create and initialize GameBridge
			bridge = new GameBridge({
				contractId,
				walletAddress,
				walletSigner: signer,
			});

			await bridge.initialize();
			console.log('GameBridgeWrapper: Bridge initialized successfully');
		} catch (error) {
			console.error('GameBridgeWrapper: Failed to initialize bridge:', error);
			initError = error instanceof Error ? error.message : 'Failed to initialize game';
		} finally {
			isInitializing = false;
		}
	}

	onMount(async () => {
		// Prevent double initialization
		if (isInitializing || bridge) {
			console.log('GameBridgeWrapper: Already initializing or initialized, skipping');
			return;
		}

		prevContractId = contractId;
		prevWalletAddress = walletAddress;

		// Check lock status first
		const lockStatus = checkLockStatus();
		isAccountLocked = lockStatus.locked;
		lockReason = lockStatus.reason;

		// Set up listener for REQUEST_UNLOCK messages from game
		unlockRequestHandler = (event: MessageEvent) => {
			const message = event.data;
			if (!message || typeof message !== 'object') return;
			if (message.namespace !== MESSAGE_NAMESPACE) return;
			if (message.type === 'REQUEST_UNLOCK') {
				console.log('GameBridgeWrapper: Received REQUEST_UNLOCK from game');
				showUnlockModal = true;
			}
		};
		window.addEventListener('message', unlockRequestHandler);

		// Send initial lock status to game (with small delay to ensure game is listening)
		setTimeout(() => {
			sendAccountLockedMessage(isAccountLocked, lockReason);
		}, 100);

		// If not locked, initialize the bridge
		if (!isAccountLocked) {
			await initializeBridge();
		} else {
			console.log('GameBridgeWrapper: Account is locked, skipping bridge initialization', { reason: lockReason });
		}
	});

	onDestroy(() => {
		if (bridge) {
			console.log('GameBridgeWrapper: Destroying bridge');
			bridge.destroy();
			bridge = null;
		}

		if (unlockRequestHandler) {
			window.removeEventListener('message', unlockRequestHandler);
			unlockRequestHandler = null;
		}
	});
</script>

{#if initError}
	<div class="flex items-center justify-center h-screen bg-neutral-50 dark:bg-neutral-900">
		<div class="text-center p-8">
			<div class="text-error-500 text-xl font-semibold mb-2">Failed to Initialize Game</div>
			<div class="text-neutral-600 dark:text-neutral-400">{initError}</div>
			<a href="/games" class="mt-4 inline-block px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors">
				Back to Lobby
			</a>
		</div>
	</div>
{:else}
	{@render children?.()}
{/if}

<!-- Unlock Modal -->
<UnlockGameAccount
	voiAddress={walletAddress}
	{recoveryMethod}
	{recoveryHint}
	modal={true}
	open={showUnlockModal}
	onSuccess={handleUnlockSuccess}
	onClose={handleUnlockClose}
/>
