<script lang="ts">
  import type { PageData } from './$types';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import SlotMachineIcon from '$lib/components/icons/SlotMachineIcon.svelte';
  import DiceIcon from '$lib/components/icons/DiceIcon.svelte';
  import CardSuitIcon from '$lib/components/icons/CardSuitIcon.svelte';
  import CheckCircleIcon from '$lib/components/icons/CheckCircleIcon.svelte';
  import ChainBadge from '$lib/components/ui/ChainBadge.svelte';

  let { data }: { data: PageData } = $props();

  type SupportedChain = 'base' | 'voi' | 'solana';
  type SlotResult = { reels: string[]; multiplier: number };
  type DiceResult = { roll: number; prediction: string; multiplier: number };
  type CardResult = { hand: string[]; outcome: string; multiplier: number };
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
  };
  type GameHistoryEntry =
    | (BaseGameHistory & { gameType: 'slots'; result: SlotResult })
    | (BaseGameHistory & { gameType: 'dice'; result: DiceResult })
    | (BaseGameHistory & { gameType: 'cards'; result: CardResult });

  // Mock game history - will be replaced with database queries
  const gameHistory: GameHistoryEntry[] = [
    {
      id: '1',
      gameType: 'slots',
      gameName: '5-Reel Slots',
      chain: 'base',
      betAmount: 0.50,
      payout: 5.00,
      profit: 4.50,
      result: { reels: ['💎', '💎', '💎', '⭐', '💎'], multiplier: 10 },
      txHash: '0x7a8b9c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
      seed: 'seed_12345_abc',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: '2',
      gameType: 'slots',
      gameName: '5-Reel Slots',
      chain: 'voi',
      betAmount: 0.10,
      payout: 0.00,
      profit: -0.10,
      result: { reels: ['🍒', '🍋', '🍊', '🍇', '⭐'], multiplier: 0 },
      txHash: 'ABCD1234XYZ...',
      seed: 'seed_67890_def',
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: '3',
      gameType: 'dice',
      gameName: 'Dice Roll',
      chain: 'solana',
      betAmount: 1.00,
      payout: 3.00,
      profit: 2.00,
      result: { roll: 5, prediction: 'over-4', multiplier: 3 },
      txHash: '9WzDXwBbmkg8ZTbNMqUx...',
      seed: 'seed_abc123_ghi',
      createdAt: new Date(Date.now() - 10800000).toISOString(),
    },
    {
      id: '4',
      gameType: 'slots',
      gameName: '5-Reel Slots',
      chain: 'base',
      betAmount: 0.25,
      payout: 0.75,
      profit: 0.50,
      result: { reels: ['🍒', '🍒', '🍒', '🍋', '🍊'], multiplier: 3 },
      txHash: '0x1a2b3c4d5e6f7a8b9c0d...',
      seed: 'seed_jkl456_mno',
      createdAt: new Date(Date.now() - 14400000).toISOString(),
    },
  ];

  // Calculate totals
  const totalWagered = gameHistory.reduce((sum, game) => sum + game.betAmount, 0);
  const totalPayout = gameHistory.reduce((sum, game) => sum + game.payout, 0);
  const totalProfit = totalPayout - totalWagered;
  const winRate = (gameHistory.filter(g => g.profit > 0).length / gameHistory.length * 100).toFixed(1);

  function getGameIcon(type: GameHistoryEntry['gameType']) {
    switch (type) {
      case 'slots': return SlotMachineIcon;
      case 'dice': return DiceIcon;
      case 'cards': return CardSuitIcon;
      default: return SlotMachineIcon;
    }
  }
</script>

<svelte:head>
  <title>Game History - House of Voi</title>
</svelte:head>

<div class="space-y-8 max-w-6xl mx-auto">
  <!-- Header -->
  <div>
    <h1 class="text-4xl font-black text-gold-400 neon-text uppercase">Game History</h1>
    <p class="text-neutral-400 mt-2">
      Your complete gaming history with blockchain verification.
    </p>
  </div>

  <!-- Summary Stats -->
  <div class="grid md:grid-cols-4 gap-6">
    <Card glow={true}>
      <CardContent class="p-6">
        <div class="text-sm text-neutral-500 uppercase tracking-wider font-bold mb-2">
          Total Wagered
        </div>
        <div class="text-3xl font-black text-gold-400">
          ${totalWagered.toFixed(2)}
        </div>
      </CardContent>
    </Card>

    <Card glow={true}>
      <CardContent class="p-6">
        <div class="text-sm text-neutral-500 uppercase tracking-wider font-bold mb-2">
          Total Payout
        </div>
        <div class="text-3xl font-black text-gold-400">
          ${totalPayout.toFixed(2)}
        </div>
      </CardContent>
    </Card>

    <Card glow={true}>
      <CardContent class="p-6">
        <div class="text-sm text-neutral-500 uppercase tracking-wider font-bold mb-2">
          Net Profit
        </div>
        <div class="text-3xl font-black {totalProfit >= 0 ? 'text-green-400' : 'text-ruby-400'}">
          {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
        </div>
      </CardContent>
    </Card>

    <Card glow={true}>
      <CardContent class="p-6">
        <div class="text-sm text-neutral-500 uppercase tracking-wider font-bold mb-2">
          Win Rate
        </div>
        <div class="text-3xl font-black text-gold-400">
          {winRate}%
        </div>
      </CardContent>
    </Card>
  </div>

  <!-- Game History Table -->
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gold-400 uppercase">Recent Games</h2>
        <select class="px-4 py-2 rounded-lg border-2 border-neutral-800 bg-neutral-900 text-sm text-neutral-300 focus:border-gold-500 focus:ring-2 focus:ring-gold-500">
          <option>All Games</option>
          <option>Slots</option>
          <option>Dice</option>
          <option>Cards</option>
        </select>
      </div>
    </CardHeader>
    <CardContent>
      <div class="space-y-4">
        {#each gameHistory as game (game.id)}
          {@const GameIcon = getGameIcon(game.gameType)}
          {@const isWin = game.profit > 0}

          <div
            class="p-6 rounded-xl border-2 transition-all hover:bg-gold-500/5 {isWin
              ? 'border-green-500/30 bg-green-500/5'
              : 'border-ruby-500/30 bg-ruby-500/5'}"
          >
            <div class="grid md:grid-cols-12 gap-4 items-center">
              <!-- Game Icon & Name -->
              <div class="md:col-span-3 flex items-center gap-3">
                <div class="text-gold-400">
                  <svelte:component this={GameIcon} size={32} />
                </div>
                <div>
                  <div class="font-bold text-neutral-200">{game.gameName}</div>
                  <div class="text-xs text-neutral-500">
                    {new Date(game.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>

              <!-- Chain -->
              <div class="md:col-span-2">
                <ChainBadge chain={game.chain} />
              </div>

              <!-- Bet Amount -->
              <div class="md:col-span-2 text-center">
                <div class="text-xs text-neutral-500 mb-1">Bet</div>
                <div class="font-bold text-neutral-300">
                  ${game.betAmount.toFixed(2)}
                </div>
              </div>

              <!-- Payout -->
              <div class="md:col-span-2 text-center">
                <div class="text-xs text-neutral-500 mb-1">Payout</div>
                <div class="font-bold text-neutral-300">
                  ${game.payout.toFixed(2)}
                </div>
              </div>

              <!-- Profit -->
              <div class="md:col-span-2 text-center">
                <div class="text-xs text-neutral-500 mb-1">Profit</div>
                <div class="font-black text-lg {isWin ? 'text-green-400' : 'text-ruby-400'}">
                  {isWin ? '+' : ''}${game.profit.toFixed(2)}
                </div>
              </div>

              <!-- Verify Button -->
              <div class="md:col-span-1 flex justify-center">
                <button
                  class="p-2 rounded-lg border border-gold-500/30 text-gold-400 hover:bg-gold-500/10 transition-colors"
                  title="Verify on blockchain"
                >
                  <CheckCircleIcon size={20} />
                </button>
              </div>
            </div>

            <!-- Expandable Details -->
            <details class="mt-4">
              <summary class="cursor-pointer text-sm text-neutral-500 hover:text-gold-400 uppercase tracking-wide font-bold">
                View Details
              </summary>
              <div class="mt-4 p-4 bg-neutral-900 rounded-lg border border-gold-900/20 space-y-3">
                <!-- Result -->
                <div>
                  <div class="text-xs text-neutral-500 mb-2">Result:</div>
                  {#if game.gameType === 'slots'}
                    <div class="flex gap-2">
                      {#each game.result.reels as symbol, idx (idx)}
                        <div
                          class="w-12 h-12 rounded-lg bg-neutral-800 border border-gold-900/20 flex items-center justify-center text-2xl"
                        >
                          {symbol}
                        </div>
                      {/each}
                      <div class="flex items-center ml-4">
                        <span class="text-gold-400 font-bold">
                          {game.result.multiplier}x
                        </span>
                      </div>
                    </div>
                  {:else if game.gameType === 'dice'}
                    <div class="text-neutral-300">
                      Roll: <span class="font-bold">{game.result.roll}</span> |
                      Prediction: <span class="font-bold">{game.result.prediction}</span> |
                      Multiplier: <span class="text-gold-400 font-bold">{game.result.multiplier}x</span>
                    </div>
                  {:else if game.gameType === 'cards'}
                    <div class="text-neutral-300">
                      Outcome: <span class="font-bold">{game.result.outcome}</span> |
                      Multiplier: <span class="text-gold-400 font-bold">{game.result.multiplier}x</span>
                    </div>
                  {/if}
                </div>

                <!-- Transaction Hash -->
                <div>
                  <div class="text-xs text-neutral-500 mb-2">Transaction:</div>
                  <code class="block text-xs font-mono text-neutral-400 bg-neutral-950 p-2 rounded border border-gold-900/20 overflow-x-auto">
                    {game.txHash}
                  </code>
                </div>

                <!-- Provably Fair Seed -->
                <div>
                  <div class="text-xs text-neutral-500 mb-2">Provably Fair Seed:</div>
                  <code class="block text-xs font-mono text-neutral-400 bg-neutral-950 p-2 rounded border border-gold-900/20">
                    {game.seed}
                  </code>
                </div>
              </div>
            </details>
          </div>
        {/each}
      </div>

      <!-- Pagination Placeholder -->
      <div class="mt-6 flex justify-center gap-2">
        <button class="px-4 py-2 rounded-lg border border-gold-500/30 text-gold-400 hover:bg-gold-500/10 transition-colors disabled:opacity-50" disabled>
          Previous
        </button>
        <div class="px-4 py-2 rounded-lg bg-gold-500/20 text-gold-400 font-bold">
          1
        </div>
        <button class="px-4 py-2 rounded-lg border border-gold-500/30 text-gold-400 hover:bg-gold-500/10 transition-colors disabled:opacity-50" disabled>
          Next
        </button>
      </div>
    </CardContent>
  </Card>
</div>
