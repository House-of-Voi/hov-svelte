<script lang="ts">
  import Avatar from '$lib/components/Avatar.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import type { ReferralWithStats } from '$lib/referrals/credits';
  import { formatLargeNumber } from '$lib/referrals/credits';

  interface Props {
    referrals: ReferralWithStats[];
    totalReferrals: number;
    onReferralClick?: (referral: ReferralWithStats) => void;
  }

  let { referrals, totalReferrals, onReferralClick }: Props = $props();

  // Format volume from micro units or direct value
  function formatVolume(referral: ReferralWithStats): string {
    let volume: number;
    if (referral.mimirStats?.totalBet) {
      volume = parseFloat(referral.mimirStats.totalBet) / 1e6;
    } else {
      volume = referral.totalWagered;
    }
    
    if (volume >= 1000) {
      return `${formatLargeNumber(volume)} VOI`;
    }
    return `${volume.toFixed(2)} VOI`;
  }
</script>

<div class="space-y-4">
  {#if referrals.length === 0}
    <p class="text-neutral-600 dark:text-neutral-400 text-center py-4">
      No referrals yet
    </p>
  {:else}
    <div class="space-y-3">
      {#each referrals as referral (referral.referredProfileId)}
        <div
          class="flex items-center justify-between gap-4 p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors {onReferralClick
            ? 'cursor-pointer'
            : ''}"
          onclick={() => onReferralClick?.(referral)}
          role={onReferralClick ? 'button' : undefined}
          tabindex={onReferralClick ? 0 : undefined}
          onkeydown={(e) => {
            if (onReferralClick && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onReferralClick(referral);
            }
          }}
        >
          <div class="flex items-center gap-3 flex-1 min-w-0">
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
              <p class="text-sm font-semibold text-primary-600 dark:text-primary-400">
                {formatVolume(referral)}
              </p>
            </div>
          </div>
        </div>
      {/each}
    </div>

    {#if totalReferrals > referrals.length}
      <div class="pt-2 border-t border-neutral-200 dark:border-neutral-700">
        <Button
          variant="outline"
          size="sm"
          onclick={() => {
            window.location.href = '/app/referrals';
          }}
          class="w-full"
        >
          View all {totalReferrals} referral{totalReferrals !== 1 ? 's' : ''}
        </Button>
      </div>
    {/if}
  {/if}
</div>

