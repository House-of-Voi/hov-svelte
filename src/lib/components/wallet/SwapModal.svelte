<script lang="ts">
  import { fetchAllBalances, formatBalance, type AssetBalance, type WalletBalances } from '$lib/voi/balances';
  import { signTransactions } from '$lib/voi/wallet-utils';
  import { page } from '$app/stores';
  import { publicEnv } from '$lib/utils/publicEnv';
  import algosdk from 'algosdk';
  import TokenIcon from '$lib/components/icons/TokenIcon.svelte';
  import ChevronDownIcon from '$lib/components/icons/ChevronDownIcon.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    address: string;
    initialFromToken?: string;
    initialToToken?: string;
    onSuccess?: () => void;
  }

  let { isOpen, onClose, address, initialFromToken = 'USDC', initialToToken = 'VOI', onSuccess }: Props = $props();

  // Token state
  let availableTokens = $state<AssetBalance[]>([]);
  let fromToken = $state<AssetBalance | null>(null);
  let toToken = $state<AssetBalance | null>(null);
  let loadingTokens = $state(false);

  // Token selector state
  let fromSelectorOpen = $state(false);
  let toSelectorOpen = $state(false);

  // Amount state
  let fromAmount = $state('');
  let toAmount = $state('');

  // Quote state
  let quoteRate = $state<number | null>(null);
  let priceImpact = $state<number | null>(null);
  let minimumReceived = $state<string | null>(null);
  let quoteError = $state<string | null>(null);
  let isLoadingQuote = $state(false);
  let unsignedTransactions = $state<string[] | null>(null);

  // Swap state
  let isExecutingSwap = $state(false);
  let swapSuccess = $state(false);
  let swapTxId = $state<string | null>(null);

  // Debounce timer
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Portal action to teleport element to document.body
  function portal(node: HTMLElement) {
    // Move node to body
    document.body.appendChild(node);

    return {
      destroy() {
        // Remove from body when destroyed
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    };
  }

  // Token contract IDs for API
  const TOKEN_IDS: Record<string, number> = {
    'USDC': 302190,
    'VOI': 0,
    'UNIT': 420069
  };

  // Load balances when modal opens
  $effect(() => {
    if (isOpen && address) {
      loadBalances();
    }
    if (isOpen) {
      resetState();
    }
  });

  // Auto-fetch quote when amount changes
  $effect(() => {
    if (fromAmount && fromToken && toToken) {
      handleAmountChange();
    }
  });

  // Handle body overflow when modal is open
  $effect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  });

  // Handle escape key
  $effect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  });

  async function loadBalances() {
    loadingTokens = true;
    try {
      const data: WalletBalances = await fetchAllBalances(address);
      const tokens: AssetBalance[] = [];

      if (data.usdc) tokens.push(data.usdc);
      tokens.push(...data.otherTokens);

      availableTokens = tokens;

      // Set initial tokens
      fromToken = tokens.find(t => t.symbol.toUpperCase() === initialFromToken.toUpperCase()) || tokens[0] || null;
      toToken = tokens.find(t => t.symbol.toUpperCase() === initialToToken.toUpperCase()) || tokens[1] || null;
    } catch (err) {
      console.error('Failed to load balances:', err);
    } finally {
      loadingTokens = false;
    }
  }

  function resetState() {
    fromAmount = '';
    toAmount = '';
    quoteRate = null;
    priceImpact = null;
    minimumReceived = null;
    quoteError = null;
    unsignedTransactions = null;
    swapSuccess = false;
    swapTxId = null;
    fromSelectorOpen = false;
    toSelectorOpen = false;
  }

  function handleAmountChange() {
    // Clear existing debounce
    if (debounceTimer) clearTimeout(debounceTimer);

    // Clear quote data
    toAmount = '';
    quoteRate = null;
    priceImpact = null;
    minimumReceived = null;
    quoteError = null;
    unsignedTransactions = null;

    const amount = parseFloat(fromAmount);
    if (!fromAmount || isNaN(amount) || amount <= 0 || !fromToken || !toToken) {
      return;
    }

    // Check balance
    const available = parseFloat(formatBalance(fromToken.balance, fromToken.decimals));
    if (amount > available) {
      quoteError = 'Insufficient balance';
      return;
    }

    // Debounce quote fetch
    debounceTimer = setTimeout(() => {
      getQuote();
    }, 500);
  }

  async function getQuote() {
    if (!fromToken || !toToken || !fromAmount) return;

    const amount = parseFloat(fromAmount);
    if (isNaN(amount) || amount <= 0) return;

    isLoadingQuote = true;
    quoteError = null;

    try {
      // Convert to atomic units
      const amountAtomic = BigInt(Math.floor(amount * 10 ** fromToken.decimals)).toString();

      const inputTokenId = TOKEN_IDS[fromToken.symbol.toUpperCase()] ?? fromToken.contractId ?? 0;
      const outputTokenId = TOKEN_IDS[toToken.symbol.toUpperCase()] ?? toToken.contractId ?? 0;

      const requestBody = {
        address,
        inputToken: inputTokenId,
        outputToken: outputTokenId,
        amount: amountAtomic,
        slippageTolerance: 0.01 // 1%
      };

      // Try direct API call, fallback to proxy
      let response: Response;
      const apiUrl = publicEnv.SWAP_API_URL;

      try {
        response = await fetch(`${apiUrl}/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
      } catch {
        // Fallback to proxy
        response = await fetch('/api/proxy/swap/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to get quote');
      }

      if (data.quote) {
        const outputAmount = BigInt(data.quote.outputAmount);
        const toDecimals = toToken.decimals;
        const outputNum = Number(outputAmount) / 10 ** toDecimals;
        toAmount = outputNum.toFixed(toDecimals > 2 ? 6 : 2);

        if (data.quote.minimumOutputAmount) {
          const minOutput = BigInt(data.quote.minimumOutputAmount);
          const minNum = Number(minOutput) / 10 ** toDecimals;
          minimumReceived = minNum.toFixed(toDecimals > 2 ? 6 : 2);
        }

        quoteRate = data.quote.rate;
        priceImpact = data.quote.priceImpact;
        unsignedTransactions = data.unsignedTransactions;
      }
    } catch (error) {
      console.error('Quote error:', error);
      quoteError = error instanceof Error ? error.message : 'Failed to get quote';
      toAmount = '';
    } finally {
      isLoadingQuote = false;
    }
  }

  async function executeSwap() {
    if (!unsignedTransactions || unsignedTransactions.length === 0) {
      quoteError = 'No transactions available';
      return;
    }

    isExecutingSwap = true;
    quoteError = null;

    try {
      // Decode transactions
      const transactions = unsignedTransactions.map((txnBase64: string) => {
        const binaryString = atob(txnBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return algosdk.decodeUnsignedTransaction(bytes);
      });

      // Sign transactions
      const session = $page.data.session;
      const signedTxns = await signTransactions(transactions, address, session);

      // Submit as group
      const { getAlgodClient } = await import('$lib/voi/asa-utils');
      const algodClient = getAlgodClient();
      const result = await algodClient.sendRawTransaction(signedTxns).do();
      const groupTxId = result.txid;

      if (!groupTxId) {
        throw new Error('Failed to get transaction ID');
      }

      swapTxId = groupTxId;
      swapSuccess = true;

      // Refresh balances
      if (onSuccess) {
        setTimeout(() => onSuccess(), 2000);
      }
    } catch (error) {
      console.error('Swap error:', error);
      quoteError = error instanceof Error ? error.message : 'Swap failed';
    } finally {
      isExecutingSwap = false;
    }
  }

  function selectFromToken(token: AssetBalance) {
    fromToken = token;
    fromSelectorOpen = false;
    handleAmountChange();
  }

  function selectToToken(token: AssetBalance) {
    toToken = token;
    toSelectorOpen = false;
    handleAmountChange();
  }

  function setMaxAmount() {
    if (!fromToken) return;
    fromAmount = formatBalance(fromToken.balance, fromToken.decimals);
  }

  function handleClose() {
    if (debounceTimer) clearTimeout(debounceTimer);
    resetState();
    onClose();
  }

  function getExplorerUrl(txId: string): string {
    return `https://block.voi.network/explorer/transaction/${txId}`;
  }

  const canSwap = $derived(
    fromToken && toToken &&
    fromAmount && parseFloat(fromAmount) > 0 &&
    toAmount && parseFloat(toAmount) > 0 &&
    unsignedTransactions && unsignedTransactions.length > 0 &&
    !quoteError
  );

  const formattedFromBalance = $derived(
    fromToken ? formatBalance(fromToken.balance, fromToken.decimals) : '0'
  );
</script>

{#if isOpen}
  <div use:portal class="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <!-- Backdrop -->
    <button
      type="button"
      class="absolute inset-0 bg-black/80"
      onclick={handleClose}
      aria-label="Close modal"
    ></button>

    <!-- Modal -->
    <div class="relative w-full max-w-sm bg-[#4c4c4c] rounded-lg p-6 shadow-2xl border border-white/20">
      <!-- Close Button -->
      <button
        type="button"
        onclick={handleClose}
        class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors"
        aria-label="Close"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      {#if swapSuccess}
        <!-- Success View -->
        <div class="text-center space-y-6">
          <div class="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" class="text-green-400">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <div>
            <h3 class="text-lg font-bold text-white mb-2">Swap Successful</h3>
            <p class="text-white/70 text-sm">
              Your swap has been completed successfully.
            </p>
          </div>

          {#if swapTxId}
            <a
              href={getExplorerUrl(swapTxId)}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 text-blue-400 hover:underline text-sm"
            >
              View on Explorer
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </a>
          {/if}

          <button
            type="button"
            onclick={handleClose}
            class="w-full h-10 px-4 rounded-full bg-[#333] border-2 border-[#808080] text-white text-sm font-medium uppercase hover:bg-[#404040] transition-colors"
          >
            Done
          </button>
        </div>
      {:else}
        <!-- Swap Form -->
        <p class="text-2xl font-bold text-white text-center capitalize mb-4">
          Swap
        </p>

        <div class="flex flex-col gap-4">
          <!-- From/To Container -->
          <div class="border border-white/15 rounded-2xl p-4 space-y-4">
            <!-- From Section -->
            <div class="flex items-center justify-between gap-4">
              <div class="flex flex-col gap-1 flex-1 min-w-0">
                <p class="text-base font-medium text-white/70 capitalize">From</p>
                <input
                  type="number"
                  bind:value={fromAmount}
                  placeholder="0"
                  step="any"
                  min="0"
                  class="bg-transparent text-2xl font-bold text-white placeholder:text-white/50 focus:outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onclick={setMaxAmount}
                  class="text-base font-medium text-white/70 text-left hover:text-white/90 transition-colors"
                >
                  ${formattedFromBalance}
                </button>
              </div>

              <!-- From Token Selector -->
              <div class="relative">
                <button
                  type="button"
                  onclick={() => { fromSelectorOpen = !fromSelectorOpen; toSelectorOpen = false; }}
                  disabled={loadingTokens}
                  class="flex items-center gap-1 px-4 py-2 rounded-full bg-[#333] border-2 border-[#808080] hover:bg-[#404040] transition-colors disabled:opacity-50"
                >
                  {#if fromToken}
                    <span class="text-sm font-medium text-white uppercase">{fromToken.symbol}</span>
                  {:else}
                    <span class="text-sm font-medium text-white/70">Select</span>
                  {/if}
                  <ChevronDownIcon size={16} class="text-white/70" />
                </button>

                {#if fromSelectorOpen}
                  <div class="absolute right-0 top-full mt-1 min-w-[140px] bg-[#4c4c4c] rounded-lg shadow-xl border border-white/15 py-1 z-10">
                    {#each availableTokens as token}
                      <button
                        type="button"
                        onclick={() => selectFromToken(token)}
                        class="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/10 transition-colors text-left {fromToken?.symbol === token.symbol ? 'bg-white/5' : ''}"
                      >
                        <TokenIcon symbol={token.symbol} imageUrl={token.imageUrl} size={20} />
                        <span class="text-sm text-white uppercase">{token.symbol}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

            <!-- Divider -->
            <div class="h-px bg-white/15"></div>

            <!-- To Section -->
            <div class="flex items-center justify-between gap-4">
              <div class="flex flex-col gap-1 flex-1 min-w-0">
                <p class="text-base font-medium text-white/70 capitalize">To</p>
                <div class="text-2xl font-bold text-white">
                  {#if isLoadingQuote}
                    <span class="inline-block w-20 h-7 bg-white/20 rounded animate-pulse"></span>
                  {:else if toAmount}
                    {toAmount}
                  {:else}
                    <span class="text-white/50">0</span>
                  {/if}
                </div>
                <p class="text-base font-medium text-white/70">$0</p>
              </div>

              <!-- To Token Selector -->
              <div class="relative">
                <button
                  type="button"
                  onclick={() => { toSelectorOpen = !toSelectorOpen; fromSelectorOpen = false; }}
                  disabled={loadingTokens}
                  class="flex items-center gap-1 px-4 py-2 rounded-full bg-[#333] border-2 border-[#808080] hover:bg-[#404040] transition-colors disabled:opacity-50"
                >
                  {#if toToken}
                    <span class="text-sm font-medium text-white uppercase">{toToken.symbol}</span>
                  {:else}
                    <span class="text-sm font-medium text-white/70">Select</span>
                  {/if}
                  <ChevronDownIcon size={16} class="text-white/70" />
                </button>

                {#if toSelectorOpen}
                  <div class="absolute right-0 top-full mt-1 min-w-[140px] bg-[#4c4c4c] rounded-lg shadow-xl border border-white/15 py-1 z-10">
                    {#each availableTokens as token}
                      <button
                        type="button"
                        onclick={() => selectToToken(token)}
                        class="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/10 transition-colors text-left {toToken?.symbol === token.symbol ? 'bg-white/5' : ''}"
                      >
                        <TokenIcon symbol={token.symbol} imageUrl={token.imageUrl} size={20} />
                        <span class="text-sm text-white uppercase">{token.symbol}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          </div>

          <!-- Quote Details -->
          {#if quoteRate !== null || minimumReceived}
            <div class="text-xs text-white/70 space-y-1">
              {#if quoteRate !== null}
                <div class="flex justify-between">
                  <span>Rate</span>
                  <span>1 {fromToken?.symbol} = {quoteRate.toFixed(4)} {toToken?.symbol}</span>
                </div>
              {/if}
              {#if minimumReceived}
                <div class="flex justify-between">
                  <span>Minimum received</span>
                  <span>{minimumReceived} {toToken?.symbol}</span>
                </div>
              {/if}
              {#if priceImpact !== null && priceImpact > 0.5}
                <div class="flex justify-between text-yellow-400">
                  <span>Price impact</span>
                  <span>{priceImpact.toFixed(2)}%</span>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Error -->
          {#if quoteError}
            <div class="text-sm text-red-400 text-center">
              {quoteError}
            </div>
          {/if}

          <!-- Swap Button -->
          <button
            type="button"
            onclick={executeSwap}
            disabled={!canSwap || isExecutingSwap || isLoadingQuote}
            class="w-full h-10 px-4 rounded-full bg-[#333] border-2 border-[#808080] text-white text-sm font-medium uppercase hover:bg-[#404040] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if isLoadingQuote}
              Getting quote...
            {:else if isExecutingSwap}
              Swapping...
            {:else if !fromAmount || parseFloat(fromAmount) === 0}
              Enter amount
            {:else if quoteError}
              Cannot swap
            {:else}
              Swap
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
