<script lang="ts">
  import Leaderboard from '$lib/components/statistics/Leaderboard.svelte';

  const ALPHA_SLOTS_CONTRACT_ID = 40879920;
</script>

<svelte:head>
  <title>Leaderboard | House of Voi</title>
  <meta name="description" content="Compete with other players on the House of Voi leaderboard" />
</svelte:head>

<div class="space-y-12">
  <!-- Header -->
  <div class="space-y-6">
    <div>
      <h1 class="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gold-400 via-gold-300 to-gold-500 mb-2 neon-text">
        Leaderboard
      </h1>
      <p class="text-neutral-400 text-lg">
        Compete with other players for the top spot
      </p>
    </div>

    <div class="bg-gradient-to-r from-warning-500/10 to-warning-600/5 border border-warning-200 dark:border-warning-900/20 rounded-xl p-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <p class="text-warning-500 dark:text-warning-400 font-semibold mb-2">Alpha Slots</p>
          <p class="text-neutral-600 dark:text-neutral-400 text-sm">
            The original House of Voi slot machine. Classic gameplay, massive jackpots.
          </p>
        </div>
        <div>
          <p class="text-warning-500 dark:text-warning-400 font-semibold mb-2">5 Reels × 20 Paylines</p>
          <p class="text-neutral-600 dark:text-neutral-400 text-sm">
            96.5% RTP target ensures fair gameplay and exciting wins.
          </p>
        </div>
        <div>
          <p class="text-warning-500 dark:text-warning-400 font-semibold mb-2">Real-Time Rankings</p>
          <p class="text-neutral-600 dark:text-neutral-400 text-sm">
            Rankings update every 5 minutes based on blockchain data.
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Leaderboard -->
  <section>
    <Leaderboard contractId={ALPHA_SLOTS_CONTRACT_ID} limit={200} />
  </section>

  <!-- Info Section -->
  <section class="bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 border border-emerald-900/20 rounded-xl p-8">
    <h2 class="text-xl font-bold text-emerald-400 mb-4">
      How Rankings Work
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-neutral-400 text-sm">
      <div>
        <h3 class="text-emerald-400 font-semibold mb-2">Daily Leaderboard</h3>
        <p>
          Shows player rankings for a specific day. By default, displays today's leaderboard with real-time updates. You can select any previous date to view historical daily rankings.
        </p>
      </div>
      <div>
        <h3 class="text-emerald-400 font-semibold mb-2">All Time Leaderboard</h3>
        <p>
          Cumulative rankings across all time, showing the top performers since launch. Perfect for seeing who the ultimate champions are.
        </p>
      </div>
      <div>
        <h3 class="text-emerald-400 font-semibold mb-2">Ranking Metrics</h3>
        <ul class="list-disc list-inside space-y-1">
          <li>Profit: Net result (winnings - losses)</li>
          <li>Volume: Total amount wagered</li>
          <li>Winnings: Total amount won</li>
          <li>RTP: Return to player percentage</li>
        </ul>
      </div>
      <div>
        <h3 class="text-emerald-400 font-semibold mb-2">Fair Play</h3>
        <p>
          All rankings are derived from on-chain data verified by the Voi blockchain. Player names are shown when available, otherwise wallet addresses are displayed. Rankings update in real-time.
        </p>
      </div>
    </div>
  </section>

  <!-- CTA Section -->
  <section class="bg-gradient-to-r from-warning-500/10 via-warning-600/5 to-warning-700/5 border border-warning-200 dark:border-warning-900/20 rounded-xl p-8 text-center">
    <h2 class="text-2xl font-bold text-warning-500 dark:text-warning-400 mb-4">Ready to Play?</h2>
    <p class="text-neutral-600 dark:text-neutral-400 mb-6 max-w-2xl mx-auto">
      Test your luck at House of Voi and climb the leaderboard. Every spin is recorded on-chain and contributes to your ranking.
    </p>
    <a
      href="/games/slots"
      class="inline-block px-8 py-3 bg-warning-600 hover:bg-warning-500 text-white font-bold rounded-lg transition-all"
    >
      Play Now
    </a>
  </section>
</div>
