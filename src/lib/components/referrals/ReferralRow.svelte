<script lang="ts">
  import Avatar from '$lib/components/Avatar.svelte';
  import type { ReferralWithStats } from '$lib/referrals/credits';
  import { formatLargeNumber } from '$lib/referrals/credits';

  interface Props {
    referral: ReferralWithStats;
    onClick?: () => void;
  }

  let { referral, onClick }: Props = $props();

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

  // Format volume from micro units
  function formatVolume(volumeString: string): string {
    const volume = parseFloat(volumeString) / 1e6;
    return volume >= 1000 ? formatLargeNumber(volume) : volume.toFixed(2);
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
</script>

{#if onClick}
  <button
    type="button"
    class="w-full text-left p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
    onclick={onClick}
  >
  <div class="flex items-start justify-between gap-4">
    <!-- User Info -->
    <div class="flex items-start gap-3 flex-1 min-w-0">
      <Avatar
        src={referral.referredUserAvatar}
        displayName={referral.referredUsername}
        size="md"
      />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <h3 class="text-base font-semibold text-neutral-950 dark:text-white truncate">
            {referral.referredUsername}
          </h3>
          {#if referral.isActive}
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
        <div class="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-neutral-600 dark:text-neutral-400">
          <span>Joined {formatDate(referral.joinedAt)}</span>
          {#if referral.referredUserEmailOrPhone}
            <span>{formatEmailOrPhone(referral.referredUserEmailOrPhone)}</span>
          {/if}
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="flex items-center gap-6 text-sm">
      {#if referral.mimirStats}
        <div class="text-right">
          <p class="text-xs text-neutral-600 dark:text-neutral-400 mb-0.5">Volume</p>
          <p class="font-semibold text-neutral-950 dark:text-white">
            {formatVolume(referral.mimirStats.totalBet)} VOI
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-neutral-600 dark:text-neutral-400 mb-0.5">Spins</p>
          <p class="font-semibold text-neutral-950 dark:text-white">
            {formatLargeNumber(referral.mimirStats.totalSpins)}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-neutral-600 dark:text-neutral-400 mb-0.5">Last Played</p>
          <p class="font-semibold text-neutral-950 dark:text-white">
            {formatDate(referral.mimirStats.lastPlayedAt)}
          </p>
        </div>
      {:else}
        <div class="text-right">
          <p class="text-xs text-neutral-600 dark:text-neutral-400 mb-0.5">Volume</p>
          <p class="font-semibold text-neutral-950 dark:text-white">
            {referral.totalWagered > 0 ? `${formatLargeNumber(referral.totalWagered)} VOI` : 'N/A'}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-neutral-600 dark:text-neutral-400 mb-0.5">Spins</p>
          <p class="font-semibold text-neutral-950 dark:text-white">
            {referral.gamesPlayed > 0 ? formatLargeNumber(referral.gamesPlayed) : 'N/A'}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-neutral-600 dark:text-neutral-400 mb-0.5">Last Played</p>
          <p class="font-semibold text-neutral-950 dark:text-white">
            {formatDate(referral.lastPlayedAt)}
          </p>
        </div>
      {/if}
    </div>

  </div>
  </button>
{:else}
  <div class="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
  <div class="flex items-start justify-between gap-4">
    <!-- User Info -->
    <div class="flex items-start gap-3 flex-1 min-w-0">
      <Avatar
        src={referral.referredUserAvatar}
        displayName={referral.referredUsername}
        size="md"
      />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <h3 class="text-base font-semibold text-neutral-950 dark:text-white truncate">
            {referral.referredUsername}
          </h3>
          {#if referral.isActive}
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
        <div class="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-neutral-600 dark:text-neutral-400">
          <span>Joined {formatDate(referral.joinedAt)}</span>
          {#if referral.referredUserEmailOrPhone}
            <span>{formatEmailOrPhone(referral.referredUserEmailOrPhone)}</span>
          {/if}
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="flex items-center gap-6 text-sm">
      {#if referral.mimirStats}
        <div class="text-right">
          <p class="text-xs text-neutral-600 dark:text-neutral-400 mb-0.5">Volume</p>
          <p class="font-semibold text-neutral-950 dark:text-white">
            {formatVolume(referral.mimirStats.totalBet)} VOI
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-neutral-600 dark:text-neutral-400 mb-0.5">Spins</p>
          <p class="font-semibold text-neutral-950 dark:text-white">
            {formatLargeNumber(referral.mimirStats.totalSpins)}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-neutral-600 dark:text-neutral-400 mb-0.5">Last Played</p>
          <p class="font-semibold text-neutral-950 dark:text-white">
            {formatDate(referral.mimirStats.lastPlayedAt)}
          </p>
        </div>
      {:else}
        <div class="text-right">
          <p class="text-xs text-neutral-600 dark:text-neutral-400 mb-0.5">Volume</p>
          <p class="font-semibold text-neutral-950 dark:text-white">
            {referral.totalWagered > 0 ? `${formatLargeNumber(referral.totalWagered)} VOI` : 'N/A'}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-neutral-600 dark:text-neutral-400 mb-0.5">Spins</p>
          <p class="font-semibold text-neutral-950 dark:text-white">
            {referral.gamesPlayed > 0 ? formatLargeNumber(referral.gamesPlayed) : 'N/A'}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-neutral-600 dark:text-neutral-400 mb-0.5">Last Played</p>
          <p class="font-semibold text-neutral-950 dark:text-white">
            {formatDate(referral.lastPlayedAt)}
          </p>
        </div>
      {/if}
    </div>

  </div>
  </div>
{/if}
