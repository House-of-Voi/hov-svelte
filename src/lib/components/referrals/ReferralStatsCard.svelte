<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import { formatLargeNumber } from '$lib/referrals/credits';

  interface Props {
    totalVolume: string;
    totalCreditsEarned: number;
    totalSpins: number;
    activeCount: number;
    totalReferrals: number;
  }

  let {
    totalVolume,
    totalCreditsEarned,
    totalSpins,
    activeCount,
    totalReferrals,
  }: Props = $props();

  // Convert volume from micro units to readable format
  const volumeNumber = parseFloat(totalVolume) / 1e6;
  const formattedVolume = volumeNumber >= 1000 ? formatLargeNumber(volumeNumber) : volumeNumber.toFixed(2);
</script>

<Card>
  <CardHeader>
    <h2 class="text-xl font-semibold text-neutral-950 dark:text-white">
      Referral Statistics
    </h2>
  </CardHeader>
  <CardContent>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <!-- Total Volume -->
      <div class="text-center p-4 bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800 rounded-lg">
        <p class="text-xs text-neutral-700 dark:text-neutral-300 mb-1">Total Volume</p>
        <p class="text-2xl font-semibold text-primary-700 dark:text-primary-300">
          {formattedVolume}
        </p>
        <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">VOI</p>
      </div>

      <!-- Credits Earned -->
      <div class="text-center p-4 bg-success-50 dark:bg-success-950/30 border border-success-200 dark:border-success-800 rounded-lg">
        <p class="text-xs text-neutral-700 dark:text-neutral-300 mb-1">Credits Earned</p>
        <p class="text-2xl font-semibold text-success-700 dark:text-success-300">
          {formatLargeNumber(totalCreditsEarned)}
        </p>
        <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Total</p>
      </div>

      <!-- Total Spins -->
      <div class="text-center p-4 bg-accent-50 dark:bg-accent-950/30 border border-accent-200 dark:border-accent-800 rounded-lg">
        <p class="text-xs text-neutral-700 dark:text-neutral-300 mb-1">Total Spins</p>
        <p class="text-2xl font-semibold text-accent-700 dark:text-accent-300">
          {formatLargeNumber(totalSpins)}
        </p>
        <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Games Played</p>
      </div>

      <!-- Active Referrals -->
      <div class="text-center p-4 bg-warning-50 dark:bg-warning-950/30 border border-warning-200 dark:border-warning-800 rounded-lg">
        <p class="text-xs text-neutral-700 dark:text-neutral-300 mb-1">Active</p>
        <p class="text-2xl font-semibold text-warning-700 dark:text-warning-300">
          {activeCount}
        </p>
        <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">of {totalReferrals} total</p>
      </div>
    </div>
  </CardContent>
</Card>


