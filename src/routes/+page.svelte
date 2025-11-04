<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import SlotMachineIcon from '$lib/components/icons/SlotMachineIcon.svelte';
  import DiceIcon from '$lib/components/icons/DiceIcon.svelte';
  import CardSuitIcon from '$lib/components/icons/CardSuitIcon.svelte';
  import BoltIcon from '$lib/components/icons/BoltIcon.svelte';
  import LockIcon from '$lib/components/icons/LockIcon.svelte';
  import GlobeIcon from '$lib/components/icons/GlobeIcon.svelte';
  import CoinsIcon from '$lib/components/icons/CoinsIcon.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const cardInteractivityClasses = data.isAdminUser
    ? 'cursor-pointer'
    : 'cursor-not-allowed opacity-50 pointer-events-none';
</script>

<svelte:head>
  <title>House of Voi - Fun Games, Real Rewards</title>
  <meta name="description" content="Play engaging games and earn rewards on the blockchain. Transparent, fast, and built for everyone." />
</svelte:head>

<div class="space-y-24">
  <!-- Hero Section -->
  <section class="pt-12 pb-24 text-center relative overflow-hidden">
    <div class="max-w-5xl mx-auto space-y-8 relative z-10">
      <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-500 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-primary-600"></span>
        </span>
        <span class="text-xs font-medium text-primary-700 dark:text-primary-300">Now Live</span>
      </div>

      <h1 class="text-5xl md:text-7xl font-semibold leading-tight">
        <div class="text-neutral-950 dark:text-white mb-3">Fun Games,</div>
        <div class="text-gradient">Real Rewards</div>
      </h1>

      <p class="text-lg text-neutral-700 dark:text-neutral-300 max-w-2xl mx-auto leading-relaxed">
        Play engaging games and earn rewards on the blockchain.
        Transparent, fast, and built for everyone.
      </p>

      <div class="flex gap-4 justify-center flex-wrap pt-6">
        <Button variant="primary" size="lg">
          <a href="/auth">Get Started</a>
        </Button>
        <Button
          variant="outline"
          size="lg"
          disabled={!data.isAdminUser}
          title={!data.isAdminUser ? 'Admin access required' : undefined}
        >
          {#if data.isAdminUser}
            <a href="/games">Browse Games</a>
          {:else}
            Browse Games
          {/if}
        </Button>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-3 gap-6 max-w-3xl mx-auto pt-12">
        <div class="card p-6">
          <div class="text-3xl font-semibold text-neutral-950 dark:text-white mb-2">$2.5M</div>
          <div class="text-sm text-neutral-700 dark:text-neutral-300">Total Played</div>
        </div>
        <div class="card p-6">
          <div class="text-3xl font-semibold text-neutral-950 dark:text-white mb-2">10K+</div>
          <div class="text-sm text-neutral-700 dark:text-neutral-300">Happy Players</div>
        </div>
        <div class="card p-6">
          <div class="text-3xl font-semibold text-neutral-950 dark:text-white mb-2">99.2%</div>
          <div class="text-sm text-neutral-700 dark:text-neutral-300">Win Rate</div>
        </div>
      </div>
    </div>
  </section>

  <!-- Games Section -->
  <section class="max-w-6xl mx-auto">
    <div class="text-center mb-12">
      <h2 class="text-4xl md:text-5xl font-semibold text-neutral-950 dark:text-white mb-4">
        Featured Games
      </h2>
      <p class="text-lg text-neutral-700 dark:text-neutral-300">
        Choose your favorite and start playing
      </p>
    </div>

    <div class="grid md:grid-cols-3 gap-6">
      <div class="card-interactive p-8 group {cardInteractivityClasses}" aria-disabled={!data.isAdminUser}>
        <div class="text-primary-500 dark:text-primary-400 mb-6 group-hover:scale-105 transition-transform flex justify-center">
          <SlotMachineIcon size={56} />
        </div>
        <h3 class="text-xl font-semibold text-neutral-950 dark:text-white mb-3">
          Slot Machines
        </h3>
        <p class="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-6">
          Spin the reels and watch the rewards roll in. Available on Base, Voi, and Solana.
        </p>
        <div class="text-sm font-medium {data.isAdminUser ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-400 dark:text-neutral-600'}">
          Play Now →
        </div>
      </div>

      <div class="card-interactive p-8 group {cardInteractivityClasses}" aria-disabled={!data.isAdminUser}>
        <div class="text-accent-500 dark:text-accent-400 mb-6 group-hover:scale-105 transition-transform flex justify-center">
          <DiceIcon size={56} />
        </div>
        <h3 class="text-xl font-semibold text-neutral-950 dark:text-white mb-3">
          Dice Games
        </h3>
        <p class="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-6">
          Classic dice games with a modern twist. Fast, fair, and fun to play.
        </p>
        <div class="text-sm font-medium {data.isAdminUser ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-400 dark:text-neutral-600'}">
          Play Now →
        </div>
      </div>

      <div class="card-interactive p-8 group {cardInteractivityClasses}" aria-disabled={!data.isAdminUser}>
        <div class="text-success-500 dark:text-success-400 mb-6 group-hover:scale-105 transition-transform flex justify-center">
          <CardSuitIcon size={56} />
        </div>
        <h3 class="text-xl font-semibold text-neutral-950 dark:text-white mb-3">
          Card Games
        </h3>
        <p class="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-6">
          Enjoy classic card games with friends. Test your skills and earn rewards.
        </p>
        <div class="text-sm font-medium {data.isAdminUser ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-400 dark:text-neutral-600'}">
          Play Now →
        </div>
      </div>
    </div>
  </section>

  <!-- Why Choose Us -->
  <section class="max-w-4xl mx-auto">
    <div class="card-elevated p-12">
      <h2 class="text-3xl md:text-4xl font-semibold text-center text-neutral-950 dark:text-white mb-12">
        Why Choose House of Voi?
      </h2>
      <div class="grid md:grid-cols-2 gap-8">
        <div class="flex gap-4">
          <div class="text-primary-500 dark:text-primary-400 bg-primary-50 dark:bg-primary-950 p-3 rounded-xl h-fit">
            <BoltIcon size={24} />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-neutral-950 dark:text-white mb-2">Fast & Easy</h3>
            <p class="text-neutral-700 dark:text-neutral-300">
              Quick rewards and simple gameplay. Start playing in seconds.
            </p>
          </div>
        </div>
        <div class="flex gap-4">
          <div class="text-primary-500 dark:text-primary-400 bg-primary-50 dark:bg-primary-950 p-3 rounded-xl h-fit">
            <LockIcon size={24} />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-neutral-950 dark:text-white mb-2">Transparent</h3>
            <p class="text-neutral-700 dark:text-neutral-300">
              Every game is verifiable on the blockchain. Fair and open.
            </p>
          </div>
        </div>
        <div class="flex gap-4">
          <div class="text-primary-500 dark:text-primary-400 bg-primary-50 dark:bg-primary-950 p-3 rounded-xl h-fit">
            <GlobeIcon size={24} />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-neutral-950 dark:text-white mb-2">Multi-Chain</h3>
            <p class="text-neutral-700 dark:text-neutral-300">
              Play on Base, Voi, or Solana. Your choice, your experience.
            </p>
          </div>
        </div>
        <div class="flex gap-4">
          <div class="text-primary-500 dark:text-primary-400 bg-primary-50 dark:bg-primary-950 p-3 rounded-xl h-fit">
            <CoinsIcon size={24} />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-neutral-950 dark:text-white mb-2">Earn Together</h3>
            <p class="text-neutral-700 dark:text-neutral-300">
              Invite friends and share in the rewards. Everyone wins.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Final CTA -->
  <section class="max-w-5xl mx-auto">
    <div class="card-elevated p-16 text-center relative overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-br from-primary-50 to-accent-50 dark:from-primary-950/30 dark:to-accent-950/30"></div>
      <div class="relative z-10">
        <h2 class="text-4xl md:text-5xl font-semibold text-neutral-950 dark:text-white mb-6">
          Ready to Play?
        </h2>
        <p class="text-lg text-neutral-700 dark:text-neutral-300 mb-10 max-w-2xl mx-auto">
          Connect your wallet and start enjoying games. Simple, fast, and fun.
        </p>
        <Button variant="primary" size="lg">
          <a href="/auth" class="flex items-center gap-3">
            <SlotMachineIcon size={20} />
            Get Started
          </a>
        </Button>
        <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-6">
          Play responsibly and have fun!
        </p>
      </div>
    </div>
  </section>
</div>
