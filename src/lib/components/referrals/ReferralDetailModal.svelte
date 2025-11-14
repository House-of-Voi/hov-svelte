<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import { formatLargeNumber } from '$lib/referrals/credits';
  import { ensureBase32TxId } from '$lib/utils/txIdUtils';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    referredProfileId: string;
    contractId?: number;
  }

  let { isOpen, onClose, referredProfileId, contractId }: Props = $props();

  type Tab = 'stats' | 'history' | 'credits';
  let activeTab = $state<Tab>('stats');
  let loading = $state(false);
  let loadingHistory = $state(false);
  let error = $state<string | null>(null);

  // Pagination state for game history
  const pageSize = 20;
  let currentPage = $state(1);
  let totalSpins = $state(0);

  interface ReferralDetailData {
    profile: {
      id: string;
      display_name: string | null;
      avatar_url: string | null;
      created_at: string;
      primary_email: string | null;
    };
    stats: {
      totalSpins: number;
      totalBet: string;
      totalWon: string;
      netResult: string;
      lastPlayedAt: string | null;
      creditsEarned: number;
      winRate: number;
    } | null;
    recentSpins: Array<{
      id: string;
      timestamp: string;
      amount: string;
      payout: string;
      net_result: string;
      txid: string;
    }>;
    totalSpins?: number;
    creditHistory: Array<{
      credit_earned: string;
      wager_amount: string;
      created_at: string;
    }>;
    addresses: string[];
    isActive: boolean;
  }

  let data = $state<ReferralDetailData | null>(null);

  async function fetchDetailData(page: number = 1) {
    if (!referredProfileId) return;

    loading = true;
    error = null;

    try {
      const offset = (page - 1) * pageSize;
      const url = contractId
        ? `/api/referrals/${referredProfileId}?contractId=${contractId}&limit=${pageSize}&offset=${offset}`
        : `/api/referrals/${referredProfileId}?limit=${pageSize}&offset=${offset}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        error = errorData.error || `Failed to load referral details (${response.status})`;
        loading = false;
        return;
      }
      
      const result = await response.json();

      if (!result.ok) {
        error = result.error || 'Failed to load referral details';
        loading = false;
        return;
      }

      data = result;
      totalSpins = result.totalSpins || 0;
    } catch (err) {
      console.error('Failed to load referral details:', err);
      error = 'Failed to load referral details';
    } finally {
      loading = false;
    }
  }

  async function fetchGameHistory(page: number) {
    if (!referredProfileId) return;
    
    loadingHistory = true;
    try {
      const offset = (page - 1) * pageSize;
      const url = contractId
        ? `/api/referrals/${referredProfileId}?contractId=${contractId}&limit=${pageSize}&offset=${offset}`
        : `/api/referrals/${referredProfileId}?limit=${pageSize}&offset=${offset}`;
      const response = await fetch(url);
      const result = await response.json();

      if (response.ok && result.ok && data) {
        data.recentSpins = result.recentSpins;
        totalSpins = result.totalSpins || 0;
      }
    } catch (err) {
      console.error('Failed to load game history:', err);
    } finally {
      loadingHistory = false;
    }
  }

  function handlePageChange(page: number) {
    currentPage = page;
    if (activeTab === 'history') {
      fetchGameHistory(page);
    }
  }

  $effect(() => {
    if (isOpen && referredProfileId) {
      currentPage = 1;
      fetchDetailData(1);
    }
  });

  $effect(() => {
    if (isOpen && activeTab === 'history' && currentPage > 1) {
      fetchGameHistory(currentPage);
    }
  });

  // Format date
  function formatDate(dateString: string | null): string {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
      }
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  // Format email/phone display
  function formatEmailOrPhone(emailOrPhone: string | null): string {
    if (!emailOrPhone) return '';
    if (emailOrPhone.includes('@')) {
      return `Email: ${emailOrPhone}`;
    } else if (emailOrPhone.startsWith('+')) {
      return `Phone: ${emailOrPhone}`;
    }
    return `Contact: ${emailOrPhone}`;
  }

  // Format volume from micro units
  function formatVolume(volumeString: string): string {
    const volume = parseFloat(volumeString) / 1e6;
    return volume >= 1000 ? formatLargeNumber(volume) : volume.toFixed(2);
  }

  // Format amount from micro units
  function formatAmount(amountString: string): string {
    const amount = parseFloat(amountString) / 1e6;
    if (amount >= 1000) {
      return formatLargeNumber(amount);
    }
    return amount.toFixed(6);
  }

  // Format amount as whole number (no decimals, no abbreviations)
  function formatAmountWhole(amountString: string): string {
    const amount = parseFloat(amountString) / 1e6;
    return Math.round(amount).toLocaleString();
  }

  // Decode transaction ID if it's base64 encoded
  function decodeTxId(txId: string): string {
    try {
      // Try to decode as base64
      if (txId.length > 52) {
        const decoded = atob(txId);
        // If decoded looks like a valid base32 txid, use it
        if (/^[A-Z2-7]{52}$/.test(decoded)) {
          return decoded;
        }
      }
      // Otherwise, normalize the txid using the utility
      return ensureBase32TxId(txId);
    } catch (e) {
      // If decoding fails, just normalize
      return ensureBase32TxId(txId);
    }
  }

  // Get replay URL for a transaction
  function getReplayUrl(txId: string): string {
    const normalizedTxId = decodeTxId(txId);
    return `/replay?txid=${encodeURIComponent(normalizedTxId)}`;
  }
</script>

<Modal isOpen={isOpen} onClose={onClose} title="Referral Details" size="xl">
  {#if loading}
    <div class="text-center py-12">
      <p class="text-neutral-600 dark:text-neutral-400">Loading referral details...</p>
    </div>
  {:else if error}
    <div class="text-center py-12">
      <p class="text-red-600 dark:text-red-400">{error}</p>
      <button
        onclick={fetchDetailData}
        class="mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
      >
        Retry
      </button>
    </div>
  {:else if data}
    <!-- Profile Header -->
    <div class="flex items-center gap-4 mb-6 pb-6 border-b border-neutral-200 dark:border-neutral-700">
      <Avatar
        src={data.profile.avatar_url}
        displayName={data.profile.display_name || 'Unknown'}
        size="lg"
      />
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-1">
          <h3 class="text-xl font-semibold text-neutral-950 dark:text-white">
            {data.profile.display_name || 'Unknown User'}
          </h3>
          {#if data.isActive}
            <span
              class="px-2 py-0.5 text-xs font-medium rounded-full bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300 border border-success-300 dark:border-success-700"
            >
              Active
            </span>
          {:else}
            <span
              class="px-2 py-0.5 text-xs font-medium rounded-full bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300 border border-warning-300 dark:border-warning-700"
            >
              Queued
            </span>
          {/if}
        </div>
        <p class="text-sm text-neutral-600 dark:text-neutral-400">
          Joined {formatDate(data.profile.created_at)}
        </p>
        {#if data.profile.primary_email}
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            {formatEmailOrPhone(data.profile.primary_email)}
          </p>
        {/if}
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-2 mb-6 border-b border-neutral-200 dark:border-neutral-700">
      <button
        onclick={() => (activeTab = 'stats')}
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 {activeTab === 'stats'
          ? 'border-primary-500 text-primary-600 dark:text-primary-400'
          : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white'}"
      >
        Statistics
      </button>
      <button
        onclick={() => {
          if (activeTab !== 'history') {
            currentPage = 1;
          }
          activeTab = 'history';
        }}
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 {activeTab === 'history'
          ? 'border-primary-500 text-primary-600 dark:text-primary-400'
          : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white'}"
      >
        Game History
      </button>
      <button
        onclick={() => (activeTab = 'credits')}
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 {activeTab === 'credits'
          ? 'border-primary-500 text-primary-600 dark:text-primary-400'
          : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white'}"
      >
        Credits
      </button>
    </div>

    <!-- Stats Tab -->
    {#if activeTab === 'stats'}
      {#if data.stats}
        <div class="space-y-6">
          <!-- Key Statistics -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="p-4 bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800 rounded-lg">
              <p class="text-xs text-neutral-700 dark:text-neutral-300 mb-1">Total Spins</p>
              <p class="text-2xl font-semibold text-primary-700 dark:text-primary-300">
                {formatLargeNumber(data.stats.totalSpins)}
              </p>
            </div>
            <div class="p-4 bg-success-50 dark:bg-success-950/30 border border-success-200 dark:border-success-800 rounded-lg">
              <p class="text-xs text-neutral-700 dark:text-neutral-300 mb-1">Total Bet</p>
              <p class="text-2xl font-semibold text-success-700 dark:text-success-300">
                {formatVolume(data.stats.totalBet)} VOI
              </p>
            </div>
            <div class="p-4 bg-accent-50 dark:bg-accent-950/30 border border-accent-200 dark:border-accent-800 rounded-lg">
              <p class="text-xs text-neutral-700 dark:text-neutral-300 mb-1">Total Won</p>
              <p class="text-2xl font-semibold text-accent-700 dark:text-accent-300">
                {formatVolume(data.stats.totalWon)} VOI
              </p>
            </div>
            <div class="p-4 bg-info-50 dark:bg-info-950/30 border border-info-200 dark:border-info-800 rounded-lg">
              <p class="text-xs text-neutral-700 dark:text-neutral-300 mb-1">Win Rate</p>
              <p class="text-2xl font-semibold text-info-700 dark:text-info-300">
                {data.stats.winRate.toFixed(2)}%
              </p>
            </div>
          </div>

          <!-- Additional Info -->
          <Card>
            <CardHeader>
              <h4 class="text-lg font-semibold text-neutral-950 dark:text-white">Additional Information</h4>
            </CardHeader>
            <CardContent>
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-sm text-neutral-600 dark:text-neutral-400">Last Played</span>
                  <span class="text-sm font-medium text-neutral-950 dark:text-white">
                    {formatDate(data.stats.lastPlayedAt)}
                  </span>
                </div>
                {#if data.addresses.length > 0}
                  <div>
                    <span class="text-sm text-neutral-600 dark:text-neutral-400">VOI Addresses</span>
                    <div class="mt-2 space-y-1">
                      {#each data.addresses as address}
                        <div class="font-mono text-xs text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded">
                          {address}
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            </CardContent>
          </Card>
        </div>
      {:else}
        <div class="text-center py-12">
          <p class="text-neutral-600 dark:text-neutral-400">No statistics available</p>
        </div>
      {/if}
    {/if}

    <!-- History Tab -->
    {#if activeTab === 'history'}
      {#if loading && !data?.recentSpins}
        <div class="text-center py-12">
          <p class="text-neutral-600 dark:text-neutral-400">Loading game history...</p>
        </div>
      {:else if data?.recentSpins && data.recentSpins.length > 0}
        <div class="space-y-3">
          <!-- Compact table header -->
          <div class="grid grid-cols-12 gap-2 pb-1.5 border-b border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-600 dark:text-neutral-400">
            <div class="col-span-3">Time</div>
            <div class="col-span-2 text-right">Bet</div>
            <div class="col-span-2 text-right">Payout</div>
            <div class="col-span-2 text-right">Result</div>
            <div class="col-span-3 text-center">Action</div>
          </div>
          
          <!-- Compact table rows -->
          <div class="space-y-0.5 max-h-[400px] overflow-y-auto relative">
            {#if loadingHistory}
              <div class="absolute inset-0 bg-white/80 dark:bg-neutral-800/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div class="text-sm text-neutral-600 dark:text-neutral-400">Loading...</div>
              </div>
            {/if}
            {#each data.recentSpins as spin}
              {@const netResult = parseFloat(spin.net_result) / 1e6}
              {@const normalizedTxId = decodeTxId(spin.txid)}
              <div class="grid grid-cols-12 gap-2 py-1.5 px-1 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-xs border-b border-neutral-100 dark:border-neutral-800/50">
                <div class="col-span-3 text-neutral-700 dark:text-neutral-300 truncate">
                  {formatDate(spin.timestamp)}
                </div>
                <div class="col-span-2 text-right text-neutral-700 dark:text-neutral-300">
                  {formatAmountWhole(spin.amount)}
                </div>
                <div class="col-span-2 text-right text-success-600 dark:text-success-400 font-medium">
                  {formatAmountWhole(spin.payout)}
                </div>
                <div class="col-span-2 text-right font-medium {netResult >= 0
                  ? 'text-success-600 dark:text-success-400'
                  : 'text-error-600 dark:text-error-400'}">
                  {netResult >= 0 ? '+' : ''}{formatAmountWhole(spin.net_result)}
                </div>
                <div class="col-span-3 text-center">
                  <a
                    href={getReplayUrl(spin.txid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline text-xs font-medium"
                  >
                    View Replay
                  </a>
                </div>
              </div>
            {/each}
          </div>

          <!-- Pagination Controls -->
          {#if totalSpins > pageSize}
            {@const totalPages = Math.ceil(totalSpins / pageSize)}
            {@const startItem = (currentPage - 1) * pageSize + 1}
            {@const endItem = Math.min(currentPage * pageSize, totalSpins)}
            
            <div class="flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <div class="text-sm text-neutral-600 dark:text-neutral-400">
                Showing {startItem}-{endItem} of {totalSpins} games
              </div>
              <div class="flex items-center gap-2">
                <button
                  onclick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || loadingHistory}
                  class="px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <div class="flex items-center gap-1">
                  {#each Array(Math.min(totalPages, 7)) as _, i}
                    {@const pageNum = totalPages <= 7 ? i + 1 : 
                      currentPage <= 4 ? i + 1 :
                      currentPage >= totalPages - 3 ? totalPages - 6 + i :
                      currentPage - 3 + i}
                    {#if pageNum >= 1 && pageNum <= totalPages}
                      <button
                        onclick={() => handlePageChange(pageNum)}
                        disabled={loadingHistory}
                        class="px-3 py-1.5 text-sm rounded-lg border transition-colors {currentPage === pageNum
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300'
                          : 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'} disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {pageNum}
                      </button>
                    {/if}
                  {/each}
                </div>
                <button
                  onclick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages || loadingHistory}
                  class="px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          {/if}
        </div>
      {:else}
        <div class="text-center py-12">
          <p class="text-neutral-600 dark:text-neutral-400">No game history available</p>
        </div>
      {/if}
    {/if}

    <!-- Credits Tab -->
    {#if activeTab === 'credits'}
      {#if data.creditHistory.length > 0}
        <div class="space-y-2">
          <div class="grid grid-cols-3 gap-4 pb-2 border-b border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-600 dark:text-neutral-400">
            <div>Date</div>
            <div>Wager Amount</div>
            <div>Credits Earned</div>
          </div>
          {#each data.creditHistory as credit}
            <div class="grid grid-cols-3 gap-4 py-2 border-b border-neutral-100 dark:border-neutral-800 text-sm">
              <div class="text-neutral-700 dark:text-neutral-300">
                {formatDate(credit.created_at)}
              </div>
              <div class="text-neutral-700 dark:text-neutral-300">
                {formatAmount(credit.wager_amount)} VOI
              </div>
              <div class="text-success-600 dark:text-success-400 font-semibold">
                +{formatLargeNumber(parseFloat(credit.credit_earned))}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="text-center py-12">
          <p class="text-neutral-600 dark:text-neutral-400">No credit history available</p>
        </div>
      {/if}
    {/if}
  {/if}
</Modal>

