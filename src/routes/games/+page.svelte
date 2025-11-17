<script lang="ts">
  import type { PageData } from './$types';
  import { onMount, onDestroy } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import SlotMachineIcon from '$lib/components/icons/SlotMachineIcon.svelte';
  import TrendingUpIcon from '$lib/components/icons/TrendingUpIcon.svelte';
  import ChainBadge from '$lib/components/ui/ChainBadge.svelte';
  import {
    formatCurrency,
    formatNumber,
    formatPercent,
    formatVoi,
    truncateAddress,
  } from '$lib/utils/format';
  import { recentWinsStore, recentWins, recentWinsLoading, recentWinsConnected } from '$lib/stores/recentWins';

  let { data }: { data: PageData } = $props();

  const formatMicroVoi = (microVoi: number) =>
    (microVoi / 1_000_000).toFixed(2);

  // Platform stats display values
  const playedAmountDisplay = data.platformStats
    ? formatCurrency(data.platformStats.totalAmountBet)
    : '—';
  const topWinDisplay = data.platformStats
    ? formatCurrency(data.platformStats.largestSingleWin)
    : '—';
  const playersCountDisplay = data.platformStats
    ? formatNumber(data.platformStats.uniquePlayers)
    : '—';
  const winRateValue =
    data.platformStats && data.platformStats.totalBets > 0
      ? (data.platformStats.totalWinningSpins / data.platformStats.totalBets) * 100
      : 0;
  const winRateDisplay = data.platformStats
    ? formatPercent(winRateValue)
    : '—';

  const playedLabel =
    data.statsScope === 'Today' ? 'Played Today' : 'Played All Time';
  const topWinLabel =
    data.statsScope === 'Today' ? 'Top Win Today' : 'Top Win All Time';
  const playersLabel =
    data.statsScope === 'Today' ? 'Players Active Today' : 'Unique Players';
  const winRateLabel =
    data.statsScope === 'Today' ? 'Win Rate Today' : 'Win Rate All Time';

  // Check if user can play
  const canPlay = Boolean(data.session?.gameAccessGranted);

  // Check if there are profile stats to show
  const hasProfileData = data.session && data.profileStats;

  // Get contract IDs from games for filtering
  const contractIds = data.games
    .map((game) => Number(game.contract_id))
    .filter((id) => Number.isFinite(id) && id > 0);

  // Initialize recent wins store on mount
  onMount(async () => {
    if (contractIds.length > 0) {
      await recentWinsStore.initialize({
        contractIds,
        maxWins: 10,
      });
    }
  });

  // Cleanup on destroy
  onDestroy(() => {
    recentWinsStore.destroy();
  });

  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffSeconds < 60) {
      return 'just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else if (diffWeeks < 4) {
      return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`;
    } else if (diffMonths < 12) {
      return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }
</script>

<svelte:head>
  <title>Browse Games - House of Voi</title>
</svelte:head>

<div class="space-y-8">
  <!-- Header -->
  <div class="text-center space-y-3 animate-in fade-in duration-300">
    <h1 class="text-4xl md:text-5xl font-semibold text-neutral-950 dark:text-white">
      Browse Games
    </h1>
    <p class="text-neutral-700 dark:text-neutral-300 text-lg">
      Pick your favorite and start playing
    </p>
  </div>

  <!-- Featured Stats -->
  <Card elevated={true}>
    <CardContent class="p-8">
      <div class="grid md:grid-cols-4 gap-6 animate-in fade-in duration-500">
        <div class="text-center">
          <div class="text-3xl font-semibold text-neutral-950 dark:text-white mb-2">
            {playedAmountDisplay}
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-300">
            {playedLabel}
          </div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-semibold text-neutral-950 dark:text-white mb-2">
            {topWinDisplay}
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-300">
            {topWinLabel}
          </div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-semibold text-neutral-950 dark:text-white mb-2">
            {playersCountDisplay}
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-300">
            {playersLabel}
          </div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-semibold text-neutral-950 dark:text-white mb-2">
            {winRateDisplay}
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-300">
            {winRateLabel}
          </div>
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- Games Grid -->
  <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
    {#if data.games.length === 0}
      <Card class="md:col-span-2 lg:col-span-3">
        <CardContent class="p-12 text-center">
          <div class="text-neutral-500 dark:text-neutral-400">
            No games available at this time. Check back soon!
          </div>
        </CardContent>
      </Card>
    {:else}
      {#each data.games as game, index}
        {@const payoutRate = parseFloat(game.rtp_target ?? '0')}
        <Card
          hover={true}
          elevated={true}
          class="h-full animate-in fade-in duration-500 slide-in-from-bottom-4"
          style="animation-delay: {index * 100}ms"
        >
          <CardContent class="p-8 h-full flex flex-col">
            <!-- Game Icon & Title -->
            <div class="space-y-4">
              <div class="flex justify-center">
                <div class="text-primary-500 dark:text-primary-400">
                  <SlotMachineIcon size={56} />
                </div>
              </div>
              <div class="text-center">
                <h3 class="text-xl font-semibold text-neutral-950 dark:text-white mb-2">
                  {game.display_name}
                </h3>
                <p class="text-neutral-700 dark:text-neutral-300 text-sm">
                  {game.description || 'Experience the thrill of slot machine gaming'}
                </p>
                <div class="mt-2 flex items-center justify-center gap-2">
                  <ChainBadge chain={game.chain} />
                  {#if game.theme}
                    <span class="px-2 py-1 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs rounded-full capitalize">
                      {game.theme}
                    </span>
                  {/if}
                </div>
              </div>
            </div>

            <!-- Spacer to push game info down -->
            <div class="flex-1 min-h-2"></div>

            <!-- Game Info -->
            <div class="space-y-2 text-sm border-y border-neutral-200 dark:border-neutral-700 py-4">
              <div class="flex justify-between">
                <span class="text-neutral-700 dark:text-neutral-300">
                  RTP:
                </span>
                <span class="text-neutral-950 dark:text-white font-medium">
                  {payoutRate.toFixed(2)}%
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-neutral-700 dark:text-neutral-300">
                  Bet Range:
                </span>
                <span class="text-neutral-950 dark:text-white font-medium">
                  {formatMicroVoi(game.min_bet)} - {formatMicroVoi(game.max_bet)} VOI
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-neutral-700 dark:text-neutral-300">
                  Max Paylines:
                </span>
                <span class="text-neutral-950 dark:text-white font-medium">
                  {game.max_paylines}
                </span>
              </div>
            </div>

            <!-- Play Button -->
            <div class="mt-6">
              {#if canPlay}
                {@const gameRoute = game.game_type === 'w2w' ? '/games/w2w' : '/games/slots'}
                <a href="{gameRoute}?contract={game.contract_id}" class="block">
                  <Button variant="primary" size="md" class="w-full">
                    Play Now
                  </Button>
                </a>
              {:else}
                <a href="/auth" class="block">
                  <Button variant="primary" size="md" class="w-full">
                    Sign In to Play
                  </Button>
                </a>
              {/if}
            </div>
          </CardContent>
        </Card>
      {/each}
    {/if}
  </div>

  <!-- Player Stats - Only for authenticated users with game access -->
  {#if canPlay && data.session && data.defaultContractId}
    <div class="grid md:grid-cols-2 gap-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <!-- Your Activity Card -->
      <Card>
        <CardHeader>
          <h3 class="text-lg font-semibold text-neutral-950 dark:text-white flex items-center gap-2">
            <TrendingUpIcon size={20} />
            Your Activity
          </h3>
        </CardHeader>
        <CardContent class="space-y-3">
          {#if hasProfileData}
            {@const totalBetDisplay = data.profileStats
              ? `${formatVoi(data.profileStats.total_bet)} VOI`
              : '0.00 VOI'}
            {@const totalSpinsDisplay = formatNumber(data.profileStats?.total_spins ?? 0)}
            {@const winRateDisplay = data.profileStats
              ? formatPercent(Math.round(data.profileStats.win_rate))
              : '0%'}
            {@const biggestWinDisplay = data.profileStats
              ? `${formatVoi(data.profileStats.largest_win)} VOI`
              : '0.00 VOI'}
            {@const lastSpinTime = data.profileStats?.last_spin
              ? formatRelativeTime(new Date(data.profileStats.last_spin))
              : 'Never'}

            <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
              <span class="text-neutral-700 dark:text-neutral-300">
                Total Bet
              </span>
              <span class="text-neutral-950 dark:text-white font-semibold">
                {totalBetDisplay}
              </span>
            </div>
            <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
              <span class="text-neutral-700 dark:text-neutral-300">
                Total Spins
              </span>
              <span class="text-neutral-950 dark:text-white font-semibold">
                {totalSpinsDisplay}
              </span>
            </div>
            <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
              <span class="text-neutral-700 dark:text-neutral-300">
                Win Rate
              </span>
              <span class="text-neutral-950 dark:text-white font-semibold">
                {winRateDisplay}
              </span>
            </div>
            <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
              <span class="text-neutral-700 dark:text-neutral-300">
                Biggest Win
              </span>
              <span class="text-neutral-950 dark:text-white font-semibold">
                {biggestWinDisplay}
              </span>
            </div>
            <div class="flex justify-between py-2">
              <span class="text-neutral-700 dark:text-neutral-300">
                Last Spin
              </span>
              <span class="text-neutral-950 dark:text-white font-semibold">
                {lastSpinTime}
              </span>
            </div>
          {:else}
            <div class="text-center text-neutral-500 dark:text-neutral-400 py-6">
              No activity yet. Start playing to see your stats!
            </div>
          {/if}
          <a href="/games/history" class="block pt-2">
            <Button variant="outline" size="sm" class="w-full">
              View History
            </Button>
          </a>
        </CardContent>
      </Card>

      <!-- Recent Wins Card -->
      <Card>
        <CardHeader>
          <h3 class="text-lg font-semibold text-neutral-950 dark:text-white">
            Recent Wins
          </h3>
        </CardHeader>
        <CardContent class="space-y-3">
          {#if $recentWinsLoading}
            <div class="text-neutral-500 dark:text-neutral-400 text-sm text-center py-6">
              Loading recent wins...
            </div>
          {:else if !$recentWinsConnected}
            <div class="text-neutral-500 dark:text-neutral-400 text-sm text-center py-6">
              Connecting to live feed...
            </div>
          {:else if $recentWins.length === 0}
            <div class="text-neutral-500 dark:text-neutral-400 text-sm text-center py-6">
              No recent wins yet. Be the first!
            </div>
          {:else}
            <div class="space-y-3">
              {#each $recentWins as win}
                {@const playerName = truncateAddress(win.who)}
                {@const payoutFormatted = formatVoi(win.payout.toString())}
                {@const betAmountFormatted = formatVoi(win.total_bet_amount.toString())}
                {@const multiplier = Number(win.payout) / Number(win.total_bet_amount)}
                {@const timeAgo = formatRelativeTime(win.created_at)}

                <div class="flex justify-between items-start gap-4 py-2 border-b border-neutral-200 dark:border-neutral-700 last:border-0">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-neutral-950 dark:text-white truncate">
                      {playerName}
                    </p>
                    <p class="text-xs text-neutral-600 dark:text-neutral-400">
                      {timeAgo}
                    </p>
                  </div>
                  <div class="text-right flex-shrink-0">
                    <p class="text-sm font-semibold text-success-600 dark:text-success-400">
                      {payoutFormatted} VOI
                    </p>
                    {#if multiplier > 0}
                      <p class="text-xs text-neutral-600 dark:text-neutral-400">
                        {multiplier.toFixed(1)}x
                      </p>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </CardContent>
      </Card>
    </div>
  {/if}
</div>
