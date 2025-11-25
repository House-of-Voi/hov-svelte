<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatVoi, formatVoiCompact } from '$lib/utils/format';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import SlotMachineIcon from '$lib/components/icons/SlotMachineIcon.svelte';
  import DiceIcon from '$lib/components/icons/DiceIcon.svelte';
  import CardSuitIcon from '$lib/components/icons/CardSuitIcon.svelte';
  import CheckCircleIcon from '$lib/components/icons/CheckCircleIcon.svelte';
  import ChainBadge from '$lib/components/ui/ChainBadge.svelte';
  import HistoryReelGrid from '$lib/components/game/HistoryReelGrid.svelte';
  import type { WinningLine } from '$lib/game-engine/types';
  import { ensureBase32TxId } from '$lib/utils/txIdUtils';

  let { data }: { data: PageData } = $props();

  type SupportedChain = 'base' | 'voi' | 'solana';
  type SlotResult = { reels: string[]; multiplier: number };
  type KenoResult = { numbers: number[]; hits: number; multiplier: number };
  type RouletteResult = { number: number; color: string; multiplier: number };
  type GenericResult = { multiplier: number };
  type BaseGameHistory = {
    id: string;
    gameName: string;
    chain: SupportedChain;
    betAmount: number;
    payout: number;
    profit: number;
    txHash: string;
    seed: string;
    createdAt: string;
    betPerLine?: number;
    selectedPaylines?: number;
  };
  type GameHistoryEntry =
    | (BaseGameHistory & { gameType: 'slots'; result: SlotResult })
    | (BaseGameHistory & { gameType: 'keno'; result: KenoResult })
    | (BaseGameHistory & { gameType: 'roulette'; result: RouletteResult })
    | (BaseGameHistory & { gameType: string; result: GenericResult });

  // Use data from server
  const gameHistory: GameHistoryEntry[] = data.history || [];
  const { totalWagered, totalPayout, totalProfit, winRate } = data.stats || {
    totalWagered: 0,
    totalPayout: 0,
    totalProfit: 0,
    winRate: '0.0',
  };
  const pagination = data.pagination || {
    limit: 20,
    offset: 0,
    total: 0,
    hasMore: false,
  };

  // Filter state - sync with URL params
  let selectedGameType = $state<string>('all');
  
  // Sync filter with URL on mount and when URL changes
  $effect(() => {
    selectedGameType = $page.url.searchParams.get('gameType') || 'all';
  });

  function getGameIcon(type: string) {
    switch (type) {
      case 'slots': return SlotMachineIcon;
      case 'dice': return DiceIcon;
      case 'cards': return CardSuitIcon;
      case 'keno': return DiceIcon;
      case 'roulette': return CardSuitIcon;
      default: return SlotMachineIcon;
    }
  }

  function handleGameTypeFilter(event: Event) {
    const target = event.target as HTMLSelectElement;
    selectedGameType = target.value;
    
    const url = new URL(window.location.href);
    if (target.value === 'all') {
      url.searchParams.delete('gameType');
    } else {
      url.searchParams.set('gameType', target.value);
    }
    url.searchParams.set('offset', '0'); // Reset to first page
    goto(url.toString(), { noScroll: true });
  }

  function handlePrevious() {
    const newOffset = Math.max(0, pagination.offset - pagination.limit);
    const url = new URL(window.location.href);
    url.searchParams.set('offset', newOffset.toString());
    goto(url.toString(), { noScroll: true });
  }

  function handleNext() {
    if (pagination.hasMore) {
      const newOffset = pagination.offset + pagination.limit;
      const url = new URL(window.location.href);
      url.searchParams.set('offset', newOffset.toString());
      goto(url.toString(), { noScroll: true });
    }
  }

  function getBlockchainExplorerUrl(chain: SupportedChain, txHash: string): string {
    if (!txHash) return '#';

    // Normalize transaction ID to base32 format for VOI chain
    const normalizedTxHash = chain === 'voi' ? ensureBase32TxId(txHash) : txHash;

    switch (chain) {
      case 'voi':
        return `https://voi.observer/explorer/transaction/${normalizedTxHash}`;
      case 'base':
        return `https://basescan.org/tx/${normalizedTxHash}`;
      case 'solana':
        return `https://solscan.io/tx/${normalizedTxHash}`;
      default:
        return '#';
    }
  }

  // Helper function to normalize transaction ID for display
  function normalizeTxIdForDisplay(txHash: string, chain: SupportedChain): string {
    if (!txHash) return '';
    // Only normalize for VOI chain (others use different formats)
    return chain === 'voi' ? ensureBase32TxId(txHash) : txHash;
  }

  // Get symbol emoji from symbol ID (for slots)
  function getSymbolEmoji(symbolId: string | number): string {
    const symbolIdStr = String(symbolId);
    const symbolMap: Record<string, string> = {
      // Letter-based IDs (from game engine)
      'A': '💎', // Diamond
      'B': '⭐', // Star
      'C': '👑', // Crown
      'D': '🍀', // Clover
      '_': '　', // Blank
      // Numeric IDs (legacy/alternative)
      '0': '🍒',
      '1': '🍋',
      '2': '🍊',
      '3': '🍇',
      '4': '⭐',
      '5': '💎',
      '6': '7️⃣',
      '7': '🔔',
      '8': '💀',
      '9': '👑',
    };
    return symbolMap[symbolIdStr] || symbolIdStr || '?';
  }

  // State for grid data per spin
  const gridData = $state<Record<string, {
    grid: string[][];
    winningLines: WinningLine[];
    loading: boolean;
    error: string | null;
  }>>({});

  // Fetch grid data for a spin
  async function fetchGridData(game: GameHistoryEntry) {
    if (game.gameType !== 'slots' || !game.txHash) return;
    if (!game.betPerLine || !game.selectedPaylines) return;

    const gameId = game.id;
    
    // Check if already loaded or loading
    if (gridData[gameId]) return;

    // Set loading state
    gridData[gameId] = {
      grid: [],
      winningLines: [],
      loading: true,
      error: null
    };

    try {
      // Normalize transaction ID to base32 format for API call
      const normalizedTxHash = normalizeTxIdForDisplay(game.txHash, game.chain);
      const url = `/api/games/history/${normalizedTxHash}/grid?betPerLine=${game.betPerLine}&selectedPaylines=${game.selectedPaylines}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch grid: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to reconstruct grid');
      }

      gridData[gameId] = {
        grid: result.data.grid,
        winningLines: result.data.winningLines,
        loading: false,
        error: null
      };
    } catch (error) {
      gridData[gameId] = {
        grid: [],
        winningLines: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load grid'
      };
    }
  }

  // Handle details toggle
  function handleDetailsToggle(event: Event, game: GameHistoryEntry) {
    const details = event.target as HTMLDetailsElement;
    if (details.open && game.gameType === 'slots') {
      fetchGridData(game);
    }
  }

  // Generate replay URL for a game
  function getReplayUrl(game: GameHistoryEntry): string | null {
    if (game.gameType !== 'slots' || !game.txHash || !game.betPerLine || !game.selectedPaylines) {
      return null;
    }
    const normalizedTxId = normalizeTxIdForDisplay(game.txHash, game.chain);
    return `/replay?txid=${encodeURIComponent(normalizedTxId)}&betPerLine=${game.betPerLine}&selectedPaylines=${game.selectedPaylines}`;
  }
</script>

<svelte:head>
  <title>Game History - House of Voi</title>
</svelte:head>

<div class="space-y-8 max-w-6xl mx-auto">
  <!-- Header -->
  <div>
    <h1 class="text-4xl font-black text-accent-500 dark:text-accent-400 neon-text uppercase">Game History</h1>
    <p class="text-primary-600 dark:text-primary-400 mt-2">
      Your complete gaming history with blockchain verification.
    </p>
  </div>

  <!-- Summary Stats -->
  <div class="grid md:grid-cols-4 gap-6">
    <Card glow={true}>
      <CardContent class="p-6">
        <div class="text-sm text-primary-600 dark:text-primary-400 uppercase tracking-wider font-bold mb-2">
          Total Wagered
        </div>
        <div class="text-3xl font-black text-accent-600 dark:text-accent-400">
          {formatVoiCompact(totalWagered)} VOI
        </div>
      </CardContent>
    </Card>

    <Card glow={true}>
      <CardContent class="p-6">
        <div class="text-sm text-primary-600 dark:text-primary-400 uppercase tracking-wider font-bold mb-2">
          Total Payout
        </div>
        <div class="text-3xl font-black text-accent-600 dark:text-accent-400">
          {formatVoiCompact(totalPayout)} VOI
        </div>
      </CardContent>
    </Card>

    <Card glow={true}>
      <CardContent class="p-6">
        <div class="text-sm text-primary-600 dark:text-primary-400 uppercase tracking-wider font-bold mb-2">
          Net Profit
        </div>
        <div class="text-3xl font-black {totalProfit >= 0 ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'}">
          {totalProfit >= 0 ? '+' : ''}{formatVoiCompact(totalProfit)} VOI
        </div>
      </CardContent>
    </Card>

    <Card glow={true}>
      <CardContent class="p-6">
        <div class="text-sm text-primary-600 dark:text-primary-400 uppercase tracking-wider font-bold mb-2">
          Win Rate
        </div>
        <div class="text-3xl font-black text-accent-600 dark:text-accent-400">
          {winRate}%
        </div>
      </CardContent>
    </Card>
  </div>

  <!-- Game History Table -->
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-accent-600 dark:text-accent-400 uppercase">Recent Games</h2>
        <select
          value={selectedGameType}
          onchange={handleGameTypeFilter}
          class="px-4 py-2 rounded-lg border-2 border-primary-300 dark:border-primary-500/30 bg-primary-50 dark:bg-primary-900/20 text-sm text-primary-700 dark:text-primary-300 focus:border-accent-500 focus:ring-2 focus:ring-accent-500"
        >
          <option value="all">All Games</option>
          <option value="slots">Slots</option>
          <option value="keno">Keno</option>
          <option value="roulette">Roulette</option>
        </select>
      </div>
    </CardHeader>
    <CardContent>
      {#if gameHistory.length === 0}
        <div class="text-center py-12">
          <p class="text-primary-600 dark:text-primary-400 text-lg">No game history found</p>
          <p class="text-primary-600/70 dark:text-primary-400/70 text-sm mt-2">Start playing to see your game history here</p>
        </div>
      {:else}
        <div class="space-y-4">
          {#each gameHistory as game (game.id)}
            {@const GameIcon = getGameIcon(game.gameType)}
            {@const isWin = game.profit > 0}
            {@const totalBet = game.gameType === 'slots' && game.betPerLine && game.selectedPaylines 
              ? (game.betPerLine * game.selectedPaylines) / 1_000_000 
              : game.betAmount}
            {@const Icon = GameIcon}

          <div
            class="p-6 rounded-xl border-2 transition-all hover:bg-accent-500/5 {isWin
              ? 'border-success-300 dark:border-success-500/30 bg-success-50 dark:bg-success-900/10'
              : 'border-error-300 dark:border-error-500/30 bg-error-50 dark:bg-error-900/10'}"
          >
            <div class="grid md:grid-cols-12 gap-4 items-center">
              <!-- Game Icon & Name -->
              <div class="md:col-span-3 flex items-center gap-3">
                <div class="text-accent-600 dark:text-accent-400">
                  <Icon size={32} />
                </div>
                <div>
                  <div class="font-bold text-primary-700 dark:text-primary-300">{game.gameName}</div>
                  <div class="text-xs text-primary-600/70 dark:text-primary-400/70">
                    {new Date(game.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>

              <!-- Chain -->
              <div class="md:col-span-2">
                <ChainBadge chain={game.chain} />
              </div>

              <!-- Total Bet Amount -->
              <div class="md:col-span-2 text-center">
                <div class="text-xs text-primary-600 dark:text-primary-400 mb-1">Total Bet</div>
                <div class="font-bold text-primary-700 dark:text-primary-300">
                  {formatVoiCompact(totalBet)} VOI
                </div>
                {#if game.gameType === 'slots' && game.betPerLine && game.selectedPaylines}
                  <div class="text-xs text-primary-600/70 dark:text-primary-400/70 mt-0.5">
                    {formatVoi(game.betPerLine)} × {game.selectedPaylines}
                  </div>
                {/if}
              </div>

              <!-- Payout -->
              <div class="md:col-span-2 text-center">
                <div class="text-xs text-primary-600 dark:text-primary-400 mb-1">Payout</div>
                <div class="font-bold text-primary-700 dark:text-primary-300">
                  {formatVoiCompact(game.payout)} VOI
                </div>
              </div>

              <!-- Profit -->
              <div class="md:col-span-2 text-center">
                <div class="text-xs text-primary-600 dark:text-primary-400 mb-1">Profit</div>
                <div class="font-black text-lg {isWin ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'}">
                  {isWin ? '+' : ''}{formatVoiCompact(game.profit)} VOI
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="md:col-span-1 flex justify-center gap-2">
                {#if game.gameType === 'slots' && game.txHash && game.betPerLine && game.selectedPaylines}
                  <a
                    href={getReplayUrl(game) || '#'}
                    target="_blank"
                    class="p-2 rounded-lg border border-accent-500/30 text-accent-600 dark:text-accent-400 hover:bg-accent-500/10 transition-colors"
                    title="View replay"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                      <path d="M21 3v5h-5"></path>
                      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                      <path d="M3 21v-5h5"></path>
                    </svg>
                  </a>
                {/if}
              </div>
            </div>

            <!-- Expandable Details -->
            <details class="mt-4" ontoggle={(e) => handleDetailsToggle(e, game)}>
              <summary class="cursor-pointer text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 uppercase tracking-wide font-bold transition-colors">
                View Details
              </summary>
              <div class="mt-4 p-4 rounded-lg border-2 space-y-3 {isWin
                ? 'bg-success-100 dark:bg-success-900/20 border-success-300 dark:border-success-500/30'
                : 'bg-error-100 dark:bg-error-900/20 border-error-300 dark:border-error-500/30'}"
              >
                <!-- Grid Display for Slots -->
                {#if game.gameType === 'slots'}
                  {@const gameGridData = gridData[game.id]}
                  {#if gameGridData?.loading}
                    <div class="text-center py-8">
                      <div class="text-primary-600 dark:text-primary-400">Loading grid...</div>
                    </div>
                  {:else if gameGridData?.error}
                    <div class="text-center py-8">
                      <div class="text-error-600 dark:text-error-400 text-sm font-medium">Unable to reconstruct grid: {gameGridData.error}</div>
                      <div class="text-primary-600/70 dark:text-primary-400/70 text-xs mt-2">Showing simplified result instead</div>
                    </div>
                    <!-- Fallback to simple display -->
                    {#if 'reels' in game.result}
                      <div>
                        <div class="text-xs text-primary-600 dark:text-primary-400 mb-2 uppercase tracking-wide font-semibold">Result:</div>
                        <div class="flex gap-2 items-center">
                          {#each game.result.reels as symbol, idx (idx)}
                            <div
                              class="w-12 h-12 rounded-lg bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-300 dark:border-primary-500/30 flex items-center justify-center text-2xl shadow-sm"
                            >
                              {getSymbolEmoji(symbol)}
                            </div>
                          {/each}
                          <div class="flex items-center ml-4">
                            <span class="text-primary-600 dark:text-primary-400 font-bold text-lg">
                              {game.result.multiplier > 0 ? `${game.result.multiplier.toFixed(2)}x` : '0x'}
                            </span>
                          </div>
                        </div>
                      </div>
                    {/if}
                  {:else if gameGridData?.grid && gameGridData.grid.length > 0}
                    <div>
                      <div class="text-xs text-primary-600 dark:text-primary-400 mb-2 uppercase tracking-wide font-semibold">Grid Outcome:</div>
                      <HistoryReelGrid grid={gameGridData.grid} winningLines={gameGridData.winningLines} />
                      {#if gameGridData.winningLines.length > 0}
                        <div class="mt-3 p-3 rounded-md bg-success-100 dark:bg-success-900/20 border border-success-300 dark:border-success-500/30">
                          <div class="font-bold text-success-700 dark:text-success-300 mb-2 text-sm">Winning Lines: {gameGridData.winningLines.length}</div>
                          <div class="space-y-1">
                            {#each gameGridData.winningLines as line}
                              <div class="text-primary-700 dark:text-primary-300 text-xs">
                                Payline {line.paylineIndex + 1}: <span class="font-semibold text-accent-600 dark:text-accent-400">{line.matchCount}x {line.symbol}</span> = <span class="font-bold text-success-600 dark:text-success-400">{formatVoi(line.payout)} VOI</span>
                              </div>
                            {/each}
                          </div>
                        </div>
                      {:else}
                        <div class="mt-3 text-xs text-primary-600/70 dark:text-primary-400/70">No winning lines</div>
                      {/if}
                    </div>
                  {:else}
                    <!-- Fallback to simple display if grid not loaded yet -->
                    {#if 'reels' in game.result}
                      <div>
                        <div class="text-xs text-primary-600 dark:text-primary-400 mb-2 uppercase tracking-wide font-semibold">Result:</div>
                        <div class="flex gap-2 items-center">
                          {#each game.result.reels as symbol, idx (idx)}
                            <div
                              class="w-12 h-12 rounded-lg bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-300 dark:border-primary-500/30 flex items-center justify-center text-2xl shadow-sm"
                            >
                              {getSymbolEmoji(symbol)}
                            </div>
                          {/each}
                          <div class="flex items-center ml-4">
                            <span class="text-primary-600 dark:text-primary-400 font-bold text-lg">
                              {game.result.multiplier > 0 ? `${game.result.multiplier.toFixed(2)}x` : '0x'}
                            </span>
                          </div>
                        </div>
                      </div>
                    {/if}
                  {/if}
                {:else if game.gameType === 'keno' && 'numbers' in game.result}
                  <div>
                    <div class="text-xs text-primary-600 dark:text-primary-400 mb-2 uppercase tracking-wide font-semibold">Result:</div>
                    <div class="text-primary-700 dark:text-primary-300">
                      Numbers: <span class="font-bold text-accent-600 dark:text-accent-400">{game.result.numbers.join(', ')}</span> |
                      Hits: <span class="font-bold text-accent-600 dark:text-accent-400">{game.result.hits}</span> |
                      Multiplier: <span class="text-success-600 dark:text-success-400 font-bold">{game.result.multiplier.toFixed(2)}x</span>
                    </div>
                  </div>
                {:else if game.gameType === 'roulette' && 'number' in game.result}
                  <div>
                    <div class="text-xs text-primary-600 dark:text-primary-400 mb-2 uppercase tracking-wide font-semibold">Result:</div>
                    <div class="text-primary-700 dark:text-primary-300">
                      Number: <span class="font-bold text-accent-600 dark:text-accent-400">{game.result.number}</span> |
                      Color: <span class="font-bold text-accent-600 dark:text-accent-400">{game.result.color}</span> |
                      Multiplier: <span class="text-success-600 dark:text-success-400 font-bold">{game.result.multiplier.toFixed(2)}x</span>
                    </div>
                  </div>
                {:else}
                  <div>
                    <div class="text-xs text-primary-600 dark:text-primary-400 mb-2 uppercase tracking-wide font-semibold">Result:</div>
                    <div class="text-primary-700 dark:text-primary-300">
                      Multiplier: <span class="text-success-600 dark:text-success-400 font-bold">{game.result.multiplier > 0 ? `${game.result.multiplier.toFixed(2)}x` : '0x'}</span>
                    </div>
                  </div>
                {/if}

                <!-- Transaction Hash -->
                {#if game.txHash}
                  <div>
                    <div class="text-xs text-primary-600 dark:text-primary-400 mb-2 uppercase tracking-wide font-semibold">Transaction:</div>
                    <a
                      href={getBlockchainExplorerUrl(game.chain, game.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="block"
                    >
                      <code class="block text-xs font-mono text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/20 p-2 rounded-md border-2 border-primary-300 dark:border-primary-500/30 overflow-x-auto hover:text-primary-700 dark:hover:text-primary-200 hover:border-primary-500 dark:hover:border-primary-400 transition-colors">
                        {normalizeTxIdForDisplay(game.txHash, game.chain)}
                      </code>
                    </a>
                  </div>
                {/if}

                <!-- Provably Fair Seed -->
                {#if game.seed}
                  <div>
                    <div class="text-xs text-primary-600 dark:text-primary-400 mb-2 uppercase tracking-wide font-semibold">Provably Fair Seed:</div>
                    <code class="block text-xs font-mono text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/20 p-2 rounded-md border-2 border-primary-300 dark:border-primary-500/30">
                      {game.seed}
                    </code>
                  </div>
                {/if}
              </div>
            </details>
          </div>
        {/each}
        </div>

        <!-- Pagination -->
                <div class="mt-6 flex justify-center items-center gap-4">
                  <button
                    onclick={handlePrevious}
                    disabled={pagination.offset === 0}
                    class="px-4 py-2 rounded-lg border border-accent-500/30 text-accent-600 dark:text-accent-400 hover:bg-accent-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <div class="text-sm text-primary-600 dark:text-primary-400">
                    Page {Math.floor(pagination.offset / pagination.limit) + 1} of {Math.ceil(pagination.total / pagination.limit) || 1}
                  </div>
                  <button
                    onclick={handleNext}
                    disabled={!pagination.hasMore}
                    class="px-4 py-2 rounded-lg border border-accent-500/30 text-accent-600 dark:text-accent-400 hover:bg-accent-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
      {/if}
    </CardContent>
  </Card>
</div>
