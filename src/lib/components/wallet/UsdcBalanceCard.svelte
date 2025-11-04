<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchAllBalances, formatBalance } from '$lib/voi/balances';
  import { openIBuyVoiWidget, isPopupBlocked } from '$lib/voi/ibuyvoi';
  import type { AssetBalance } from '$lib/voi/balances';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import AccountPrepModal from './AccountPrepModal.svelte';
  import { checkAssetOptIn, createAssetOptInTransaction, verifyAssetOptIn, submitTransaction, waitForConfirmation } from '$lib/voi/asa-utils';
  import { requestVoi, waitForVoiReceipt, hasSufficientVoi, type FountainError } from '$lib/voi/fountain-client';
  import { signTransaction } from '$lib/voi/wallet-utils';
  import { page } from '$app/stores';

  interface Props {
    address: string;
  }

  let { address }: Props = $props();

  const AUSDC_ASSET_ID = 302190;

  let usdcBalance = $state<AssetBalance | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let lastFetched = $state<Date | null>(null);
  let depositStatus = $state<string | null>(null);

  // Account preparation modal state
  let showPrepModal = $state(false);
  let prepModalStep = $state<'checking' | 'requesting' | 'preparing' | 'ready' | 'error'>('checking');
  let prepModalError = $state('');
  let isPreparingAccount = $state(false);

  const loadBalance = async () => {
    loading = true;
    error = null;

    try {
      const data = await fetchAllBalances(address);
      usdcBalance = data.usdc;
      lastFetched = new Date();
    } catch (err) {
      console.error('Error loading USDC balance:', err);
      error = 'Failed to load balance';
    } finally {
      loading = false;
    }
  };

  // Load balance on mount and when address changes
  onMount(() => {
    loadBalance();
  });

  $effect(() => {
    // Re-load when address changes
    if (address) {
      loadBalance();
    }
  });

  /**
   * Prepare account for USDC deposits by checking opt-in status
   * and running the preparation flow if needed
   */
  const prepareAndDeposit = async () => {
    try {
      // Step 1: Check if already opted into aUSDC
      console.log('[Deposit Flow] Checking aUSDC opt-in status for:', address);
      prepModalStep = 'checking';
      const isOptedIn = await checkAssetOptIn(address, AUSDC_ASSET_ID);
      console.log('[Deposit Flow] Opt-in status:', isOptedIn);

      if (isOptedIn) {
        // Already opted in, go straight to deposit
        console.log('[Deposit Flow] Already opted in, opening deposit widget');
        openDepositWidget();
        return;
      }

      // Not opted in, show modal and start preparation flow
      console.log('[Deposit Flow] Not opted in, starting preparation flow');
      showPrepModal = true;
      isPreparingAccount = true;
      await runAccountPreparation();
    } catch (err) {
      console.error('[Deposit Flow] Error preparing account:', err);
      error = 'Failed to prepare account. Please try again.';
      setTimeout(() => { error = null; }, 5000);
    }
  };

  /**
   * Run the account preparation flow:
   * 1. Check VOI balance
   * 2. Request VOI from Fountain if needed
   * 3. Opt into aUSDC ASA
   * 4. Verify opt-in
   * 5. Open iBuyVoi widget
   */
  const runAccountPreparation = async () => {
    try {
      // Step 2: Check if user has sufficient VOI
      prepModalStep = 'checking';
      const hasSufficient = await hasSufficientVoi(address);

      if (!hasSufficient) {
        // Step 3: Request VOI from Fountain
        prepModalStep = 'requesting';
        try {
          // Get balance before requesting
          const { getVoiBalance } = await import('$lib/voi/fountain-client');
          const initialBalance = await getVoiBalance(address);

          const fountainResponse = await requestVoi(address);

          if (fountainResponse.success) {
            // Wait for VOI to be received by checking balance
            const received = await waitForVoiReceipt(address, initialBalance, 20, 1000);

            if (!received) {
              throw new Error('Timeout waiting for VOI tokens. Please try again.');
            }
          }
        } catch (err) {
          const fountainError = err as FountainError;
          if (fountainError.rateLimited) {
            throw new Error(fountainError.message || 'Rate limit reached. Please try again later.');
          }
          throw err;
        }
      }

      // Step 4: Create and send opt-in transaction
      prepModalStep = 'preparing';
      const optInTxn = await createAssetOptInTransaction(address, AUSDC_ASSET_ID);

      // Sign transaction (handles both CDP and native wallets)
      const session = $page.data.session;
      const signedBlob = await signTransaction(optInTxn, address, session);

      // Submit transaction
      const txId = await submitTransaction(signedBlob);

      // Wait for confirmation (increase to 10 rounds ~10 seconds)
      await waitForConfirmation(txId, 10);

      // Step 5: Verify opt-in completed (poll for up to 15 seconds)
      const verified = await verifyAssetOptIn(address, AUSDC_ASSET_ID, 15, 1000);
      if (!verified) {
        throw new Error('Failed to verify opt-in. The transaction may still be processing. Please refresh and try again.');
      }

      // Success!
      prepModalStep = 'ready';

      // Wait a moment to show success, then open deposit widget
      setTimeout(() => {
        showPrepModal = false;
        isPreparingAccount = false;
        openDepositWidget();
      }, 1500);

    } catch (err) {
      console.error('Account preparation error:', err);
      prepModalStep = 'error';
      prepModalError = err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
      isPreparingAccount = false;
    }
  };

  /**
   * Open the iBuyVoi deposit widget
   */
  const openDepositWidget = () => {
    const popup = openIBuyVoiWidget(address, () => {
      // Auto-refresh balance when popup closes
      depositStatus = 'Refreshing balance...';
      setTimeout(() => {
        loadBalance();
        depositStatus = null;
      }, 1000);
    });

    if (isPopupBlocked(popup)) {
      error = 'Popup was blocked. Please allow popups for this site.';
      setTimeout(() => { error = null; }, 5000);
    }
  };

  /**
   * Handle retry from error state in modal
   */
  const handlePrepModalRetry = () => {
    prepModalError = '';
    isPreparingAccount = true;
    runAccountPreparation();
  };

  /**
   * Close preparation modal
   */
  const closePrepModal = () => {
    if (!isPreparingAccount) {
      showPrepModal = false;
      prepModalStep = 'checking';
      prepModalError = '';
    }
  };

  const handleRefresh = () => {
    loadBalance();
  };

  const formattedBalance = $derived(
    usdcBalance
      ? formatBalance(usdcBalance.balance, usdcBalance.decimals)
      : '0.00'
  );
</script>

{#if loading && !lastFetched}
  <Card>
    <CardContent class="p-6">
      <div class="flex items-center justify-center py-8">
        <p class="text-neutral-600 dark:text-neutral-400">Loading USDC balance...</p>
      </div>
    </CardContent>
  </Card>
{:else}
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-warning-500 dark:text-warning-400 uppercase">USDC Balance</h2>
        <button
          onclick={handleRefresh}
          disabled={loading}
          class="text-xs text-warning-500 dark:text-warning-400 hover:text-warning-600 dark:hover:text-warning-300 disabled:text-neutral-600 dark:disabled:text-neutral-500 transition-colors"
          title="Refresh balance"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </CardHeader>
    <CardContent>
      <!-- Prominent Balance Display -->
      <div class="p-6 rounded-xl bg-gradient-to-br from-primary-100 dark:from-primary-600/20 via-accent-100 dark:via-accent-600/20 to-warning-100 dark:to-warning-500/20 border-2 border-warning-300 dark:border-warning-500/30 mb-6">
        <div class="text-center space-y-3">
          <div class="space-y-1">
            <div class="text-5xl font-black text-warning-500 dark:text-warning-400 font-mono">
              {formattedBalance}
            </div>
          </div>
        </div>
      </div>

      <!-- Status Messages -->
      {#if error}
        <div class="mb-4 p-3 bg-error-100 dark:bg-error-500/20 border border-error-300 dark:border-error-500/30 rounded-lg">
          <p class="text-sm text-error-600 dark:text-error-400 text-center">{error}</p>
        </div>
      {/if}

      {#if depositStatus}
        <div class="mb-4 p-3 bg-primary-100 dark:bg-primary-500/20 border border-primary-300 dark:border-primary-500/30 rounded-lg">
          <p class="text-sm text-primary-600 dark:text-primary-400 text-center">{depositStatus}</p>
        </div>
      {/if}

      <!-- Action Buttons -->
      <div class="flex gap-3">
        <Button
          variant="primary"
          size="lg"
          onclick={prepareAndDeposit}
          class="flex-1 font-black uppercase tracking-wide"
        >
          Deposit USDC
        </Button>
        <Button
          variant="secondary"
          size="lg"
          class="flex-1 font-bold uppercase tracking-wide"
          disabled
        >
          Withdraw (Soon)
        </Button>
      </div>

      <!-- Helper Text -->
      <p class="text-xs text-neutral-600 dark:text-neutral-500 text-center mt-4">
        USDC is your primary currency. Use it to play games and manage your account.
      </p>

      {#if lastFetched}
        <p class="text-xs text-neutral-600 dark:text-neutral-500 text-center mt-2">
          Last updated: {lastFetched.toLocaleTimeString()}
        </p>
      {/if}
    </CardContent>
  </Card>
{/if}

<!-- Account Preparation Modal -->
<AccountPrepModal
  isOpen={showPrepModal}
  onClose={closePrepModal}
  onComplete={handlePrepModalRetry}
  currentStep={prepModalStep}
  errorMessage={prepModalError}
  isProcessing={isPreparingAccount}
/>
