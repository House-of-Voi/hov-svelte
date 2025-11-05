<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchAllBalances, formatBalance, formatUsdValue } from '$lib/voi/balances';
  import { openIBuyVoiWidget, isPopupBlocked } from '$lib/voi/ibuyvoi';
  import type { AssetBalance } from '$lib/voi/balances';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import SwapPlaceholderModal from './SwapPlaceholderModal.svelte';
  import AccountPrepModal from './AccountPrepModal.svelte';
  import UsdcWithdrawModal from './UsdcWithdrawModal.svelte';
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
  let otherBalances = $state<AssetBalance[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let lastFetched = $state<Date | null>(null);
  let depositStatus = $state<string | null>(null);
  let swapModal = $state<{
    isOpen: boolean;
    tokenSymbol: string;
    action: 'deposit' | 'withdraw';
  }>({
    isOpen: false,
    tokenSymbol: '',
    action: 'deposit',
  });

  // Account preparation modal state
  let showPrepModal = $state(false);
  let prepModalStep = $state<'checking' | 'requesting' | 'preparing' | 'ready' | 'error'>('checking');
  let prepModalError = $state('');
  let isPreparingAccount = $state(false);

  // Withdraw modal state
  let showWithdrawModal = $state(false);

  const loadBalances = async () => {
    loading = true;
    error = null;

    try {
      const data = await fetchAllBalances(address);
      usdcBalance = data.usdc;
      otherBalances = data.otherTokens;
      lastFetched = new Date();
    } catch (err) {
      console.error('Error loading balances:', err);
      error = 'Failed to load balances';
    } finally {
      loading = false;
    }
  };

  // Load balances on mount and when address changes
  onMount(() => {
    loadBalances();
  });

  $effect(() => {
    // Re-load when address changes
    if (address) {
      loadBalances();
    }
  });

  /**
   * Prepare account for USDC deposits by checking opt-in status
   * and running the preparation flow if needed
   */
  const prepareAndDeposit = async () => {
    try {
      // Step 1: Check if already opted into aUSDC
      prepModalStep = 'checking';
      const isOptedIn = await checkAssetOptIn(address, AUSDC_ASSET_ID);

      if (isOptedIn) {
        // Already opted in, go straight to deposit
        openDepositWidget();
        return;
      }

      // Not opted in, show modal and start preparation flow
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
        loadBalances();
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
    loadBalances();
  };

  const handleTokenDeposit = (tokenSymbol: string) => {
    swapModal = {
      isOpen: true,
      tokenSymbol,
      action: 'deposit',
    };
  };

  const handleTokenWithdraw = (tokenSymbol: string) => {
    swapModal = {
      isOpen: true,
      tokenSymbol,
      action: 'withdraw',
    };
  };

  const closeSwapModal = () => {
    swapModal = {
      isOpen: false,
      tokenSymbol: '',
      action: 'deposit',
    };
  };

  const formattedUsdcBalance = $derived(
    usdcBalance
      ? formatBalance(usdcBalance.balance, usdcBalance.decimals)
      : '0.00'
  );

  // Handle image error
  function handleImageError(event: Event) {
    const target = event.currentTarget as HTMLImageElement;
    target.classList.add('hidden');
  }
</script>

{#if loading && !lastFetched}
  <Card>
    <CardContent class="p-6">
      <div class="flex items-center justify-center py-8">
        <p class="text-neutral-600 dark:text-neutral-400">Loading balances...</p>
      </div>
    </CardContent>
  </Card>
{:else}
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-warning-500 dark:text-warning-400 uppercase">Your Balances</h2>
        <button
          onclick={handleRefresh}
          disabled={loading}
          class="text-xs text-warning-500 dark:text-warning-400 hover:text-warning-600 dark:hover:text-warning-300 disabled:text-neutral-600 dark:disabled:text-neutral-500 transition-colors"
          title="Refresh balances"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </CardHeader>
    <CardContent class="space-y-6">
      <!-- USDC Balance - Primary Currency -->
      <div>
        <p class="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide mb-3">
          Primary Currency
        </p>
        <div class="p-6 rounded-xl bg-gradient-to-br from-primary-100 dark:from-primary-600/20 via-accent-100 dark:via-accent-600/20 to-warning-100 dark:to-warning-500/20 border-2 border-warning-300 dark:border-warning-500/30">
          <div class="text-center space-y-4">
            <div class="space-y-1">
              <div class="text-xs text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">USDC</div>
              <div class="text-5xl font-black text-warning-500 dark:text-warning-400 font-mono">
                {formattedUsdcBalance}
              </div>
            </div>

            <!-- Status Messages -->
            {#if error}
              <div class="p-3 bg-error-100 dark:bg-error-500/20 border border-error-300 dark:border-error-500/30 rounded-lg">
                <p class="text-sm text-error-600 dark:text-error-400 text-center">{error}</p>
              </div>
            {/if}

            {#if depositStatus}
              <div class="p-3 bg-primary-100 dark:bg-primary-500/20 border border-primary-300 dark:border-primary-500/30 rounded-lg">
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
                variant="primary"
                size="lg"
                onclick={() => {
                  showWithdrawModal = true;
                }}
                class="flex-1 font-black uppercase tracking-wide"
                disabled={!usdcBalance || loading}
              >
                Withdraw USDC
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Other Tokens -->
      {#if otherBalances.length > 0}
        <div>
          <p class="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide mb-3">
            Other Tokens
          </p>
          <div class="space-y-3">
            {#each otherBalances as balance (balance.symbol)}
              {@const formattedBalance = formatBalance(balance.balance, balance.decimals)}
              {@const formattedUsd = formatUsdValue(balance.usdValue)}

              <div class="p-4 bg-warning-50 dark:bg-warning-500/5 border border-warning-200 dark:border-warning-500/20 rounded-lg space-y-3">
                <!-- Token Info and Balance -->
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    {#if balance.imageUrl}
                      <img
                        src={balance.imageUrl}
                        alt={balance.symbol}
                        width="28"
                        height="28"
                        class="h-7 w-7 rounded-full object-cover"
                        onerror={handleImageError}
                      />
                    {/if}
                    <div>
                      <div class="font-semibold text-neutral-800 dark:text-neutral-200 text-sm">
                        {balance.symbol}
                      </div>
                      <div class="text-xs text-neutral-600 dark:text-neutral-500">{balance.name}</div>
                    </div>
                  </div>

                  <div class="text-right">
                    <div class="font-mono text-sm font-bold text-warning-500 dark:text-warning-400">
                      {formattedBalance}
                    </div>
                    <div class="text-xs text-neutral-600 dark:text-neutral-500">{formattedUsd}</div>
                  </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex gap-2">
                  <button
                    onclick={() => handleTokenDeposit(balance.symbol)}
                    class="flex-1 px-3 py-2 text-xs font-semibold bg-success-100 dark:bg-success-600/20 text-success-600 dark:text-success-400 border border-success-300 dark:border-success-500/30 rounded hover:bg-success-200 dark:hover:bg-success-600/30 transition-colors uppercase tracking-wide"
                  >
                    Deposit
                  </button>
                  <button
                    onclick={() => handleTokenWithdraw(balance.symbol)}
                    class="flex-1 px-3 py-2 text-xs font-semibold bg-primary-100 dark:bg-primary-600/20 text-primary-600 dark:text-primary-400 border border-primary-300 dark:border-primary-500/30 rounded hover:bg-primary-200 dark:hover:bg-primary-600/30 transition-colors uppercase tracking-wide"
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Helper Text -->
      <p class="text-xs text-neutral-600 dark:text-neutral-500 text-center">
        USDC is your primary currency for games. Other tokens may be used for specific machines.
      </p>

      {#if lastFetched}
        <p class="text-xs text-neutral-600 dark:text-neutral-500 text-center">
          Last updated: {lastFetched.toLocaleTimeString()}
        </p>
      {/if}
    </CardContent>
  </Card>

  <!-- Swap Placeholder Modal -->
  <SwapPlaceholderModal
    isOpen={swapModal.isOpen}
    onClose={closeSwapModal}
    tokenSymbol={swapModal.tokenSymbol}
    action={swapModal.action}
  />

  <!-- Account Preparation Modal -->
  <AccountPrepModal
    isOpen={showPrepModal}
    onClose={closePrepModal}
    onComplete={handlePrepModalRetry}
    currentStep={prepModalStep}
    errorMessage={prepModalError}
    isProcessing={isPreparingAccount}
  />

  <!-- USDC Withdraw Modal -->
  <UsdcWithdrawModal
    isOpen={showWithdrawModal}
    onClose={() => {
      showWithdrawModal = false;
    }}
    onSuccess={() => {
      // Refresh balance after successful withdrawal
      loadBalances();
    }}
    usdcBalance={usdcBalance}
    address={address}
    session={$page.data.session}
  />
{/if}
