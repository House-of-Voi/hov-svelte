<script lang="ts">
  import PlatformStats from '$lib/components/statistics/PlatformStats.svelte';

  const ALPHA_SLOTS_CONTRACT_ID = 40879920;
</script>

<svelte:head>
  <title>Statistics | House of Voi</title>
  <meta name="description" content="View platform statistics for House of Voi games" />
</svelte:head>

<div class="space-y-12">
  <!-- Header -->
  <div class="space-y-4">
    <div>
      <h1 class="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gold-400 via-gold-300 to-gold-500 mb-2 neon-text">
        Platform Statistics
      </h1>
      <p class="text-neutral-400 text-lg">
        Real-time analytics for House of Voi slot machines
      </p>
    </div>
  </div>

  <!-- Platform Stats -->
  <section class="space-y-6">
    <PlatformStats
      contractId={ALPHA_SLOTS_CONTRACT_ID}
      machineDisplayName="Alpha Slots"
    />
  </section>

  <!-- Info Section -->
  <section class="bg-gradient-to-r from-warning-500/10 to-warning-600/5 border border-warning-200 dark:border-warning-900/20 rounded-xl p-8">
    <h2 class="text-xl font-bold text-warning-500 dark:text-warning-400 mb-4">About These Statistics</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-neutral-600 dark:text-neutral-400">
      <div>
        <h3 class="text-warning-500 dark:text-warning-400 font-semibold mb-2">Daily Statistics</h3>
        <p class="text-sm">
          View platform performance for any specific day. Select a date to see spins, wagering volume, payouts, and more for that 24-hour period.
        </p>
      </div>
      <div>
        <h3 class="text-warning-500 dark:text-warning-400 font-semibold mb-2">All-Time Statistics</h3>
        <p class="text-sm">
          Cumulative platform statistics since launch. Perfect for tracking long-term trends and overall platform health.
        </p>
      </div>
      <div>
        <h3 class="text-warning-500 dark:text-warning-400 font-semibold mb-2">Real-Time Data</h3>
        <p class="text-sm">
          All statistics are powered by the Mimir indexer, which tracks every spin on the Voi blockchain in real-time.
        </p>
      </div>
      <div>
        <h3 class="text-warning-500 dark:text-warning-400 font-semibold mb-2">Fair Gaming</h3>
        <p class="text-sm">
          Our RTP (Return to Player) and house edge are calculated from on-chain data to ensure complete transparency and fair gameplay.
        </p>
      </div>
    </div>
  </section>
</div>
