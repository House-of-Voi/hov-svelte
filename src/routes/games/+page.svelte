<script lang="ts">
  import type { PageData } from './$types';
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

  function resolveWinnerDisplayName(winner: typeof data.recentWinners[0]): string {
    if (winner.display_name && winner.display_name.trim().length > 0) {
      return winner.display_name;
    }

    if (winner.linked_addresses && winner.linked_addresses.length > 0) {
      return truncateAddress(winner.linked_addresses[0]);
    }

    return truncateAddress(winner.identifier);
  }

  // Check if user can play
  const canPlay = Boolean(data.session?.gameAccessGranted);

  // Check if there are profile stats to show
  const hasProfileData = data.session && data.profileStats;
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
          class="animate-in fade-in duration-500 slide-in-from-bottom-4"
          style="animation-delay: {index * 100}ms"
        >
          <CardContent class="p-8 space-y-6">
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
            {#if canPlay}
              <a href="/games/slots?contract={game.contract_id}" class="block">
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
            {@const totalPlayedDisplay = data.profileStats
              ? `${formatVoi(data.profileStats.total_bet)} VOI`
              : '0.00 VOI'}
            {@const netResultMicro = data.profileStats ? BigInt(data.profileStats.net_result) : 0n}
            {@const netResultFormatted = data.profileStats
              ? formatVoi(data.profileStats.net_result)
              : '0.00'}
            {@const earningsDisplay =
              data.profileStats && netResultMicro > 0n
                ? `+${netResultFormatted} VOI`
                : `${netResultFormatted} VOI`}
            {@const earningsClass =
              netResultMicro >= 0n
                ? 'text-success-600 dark:text-success-400'
                : 'text-error-600 dark:text-error-400'}
            {@const sessionsDisplay = formatNumber(data.profileStats?.total_spins ?? 0)}

            <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
              <span class="text-neutral-700 dark:text-neutral-300">
                Total Played
              </span>
              <span class="text-neutral-950 dark:text-white font-semibold">
                {totalPlayedDisplay}
              </span>
            </div>
            <div class="flex justify-between py-2 border-b border-neutral-200 dark:border-neutral-700">
              <span class="text-neutral-700 dark:text-neutral-300">
                Total Earnings
              </span>
              <span class="{earningsClass} font-semibold">
                {earningsDisplay}
              </span>
            </div>
            <div class="flex justify-between py-2">
              <span class="text-neutral-700 dark:text-neutral-300">
                Sessions
              </span>
              <span class="text-neutral-950 dark:text-white font-semibold">
                {sessionsDisplay}
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

      <!-- Recent Winners Card -->
      <Card>
        <CardHeader>
          <h3 class="text-lg font-semibold text-neutral-950 dark:text-white">
            Recent Winners
          </h3>
        </CardHeader>
        <CardContent class="space-y-3">
          {#if data.recentWinners.length === 0}
            <div class="text-neutral-500 dark:text-neutral-400 text-sm text-center py-6">
              No recent wins yet. Be the first!
            </div>
          {:else}
            <div class="space-y-4">
              {#each data.recentWinners as winner}
                {@const name = resolveWinnerDisplayName(winner)}
                {@const totalWonFormatted = formatVoi(winner.total_won ?? '0')}
                {@const winnerNetResultMicro = BigInt(winner.net_result ?? '0')}
                {@const winnerNetResultFormatted = formatVoi(winner.net_result ?? '0')}
                {@const winnerNetResultDisplay =
                  winnerNetResultMicro > 0n
                    ? `+${winnerNetResultFormatted} VOI`
                    : `${winnerNetResultFormatted} VOI`}
                {@const winnerNetResultClass =
                  winnerNetResultMicro >= 0n
                    ? 'text-success-600 dark:text-success-400'
                    : 'text-error-600 dark:text-error-400'}
                {@const winRate = winner.win_rate ?? 0}

                <div class="flex justify-between items-start gap-4">
                  <div>
                    <p class="text-sm font-semibold text-neutral-950 dark:text-white">
                      {name}
                    </p>
                    <p class="text-xs text-neutral-600 dark:text-neutral-400">
                      Won {totalWonFormatted} VOI • {formatNumber(winner.total_spins ?? 0)} spins
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-semibold {winnerNetResultClass}">
                      {winnerNetResultDisplay}
                    </p>
                    <p class="text-xs text-neutral-600 dark:text-neutral-400">
                      {formatPercent(winRate)}
                    </p>
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
