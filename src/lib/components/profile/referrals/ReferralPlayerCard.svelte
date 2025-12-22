<script lang="ts">
  import type { ReferralWithStats } from '$lib/referrals/credits';

  interface Props {
    referral: ReferralWithStats;
    onViewProfile?: () => void;
  }

  let { referral, onViewProfile }: Props = $props();

  // Format date for display (M/D/YYYY)
  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  }

  // Format earned amount
  function formatEarned(amount: number): string {
    if (amount >= 1000) {
      return amount.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' VOI';
    }
    return amount.toFixed(2) + ' VOI';
  }

  // Get initials from username
  function getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  const statusText = $derived(referral.isActive ? 'Active Player' : 'Queued');
  const displayName = $derived(referral.referredUsername || 'Unknown Player');
  const earned = $derived(referral.creditsEarnedForReferrer || 0);
</script>

<div class="border border-white/15 rounded-2xl p-4 flex flex-col gap-4 w-full">
  <!-- Top row: Avatar, Status, Name, Link button -->
  <div class="flex gap-2 items-center w-full">
    <!-- Avatar -->
    <div class="size-12 rounded-full bg-[#808080] shrink-0 flex items-center justify-center overflow-hidden">
      {#if referral.referredUserAvatar}
        <img
          src={referral.referredUserAvatar}
          alt={displayName}
          class="size-full object-cover"
        />
      {:else}
        <span class="text-sm font-bold text-[#404040]">
          {getInitials(displayName)}
        </span>
      {/if}
    </div>

    <!-- Status and Name -->
    <div class="flex-1 flex flex-col gap-1 min-w-0">
      <p class="text-sm text-white/70 capitalize">{statusText}</p>
      <p class="text-base font-medium text-white truncate">{displayName}</p>
    </div>

    <!-- Link button -->
    {#if onViewProfile}
      <button
        type="button"
        onclick={onViewProfile}
        class="size-8 rounded-full bg-[#333] border-2 border-[#808080] flex items-center justify-center shrink-0 hover:bg-[#404040] transition-colors"
        aria-label="View profile"
      >
        <svg class="size-6 text-white" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
          <path d="M9 9l6 3-6 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Bottom row: Join Date, Earned, Profit -->
  <div class="flex gap-4 items-start w-full">
    <!-- Join Date -->
    <div class="flex-1 flex flex-col gap-1 capitalize text-sm">
      <p class="text-white/70">Join Date</p>
      <p class="font-medium text-white">{formatDate(referral.joinedAt)}</p>
    </div>

    <!-- Earned -->
    <div class="flex-1 flex flex-col gap-1 capitalize text-sm">
      <p class="text-white/70">Earned</p>
      <p class="font-medium text-white">{formatEarned(earned)}</p>
    </div>

    <!-- Profit (fixed 2% rate) -->
    <div class="flex-1 flex flex-col gap-1 capitalize text-sm text-right">
      <p class="text-white/70">Profit</p>
      <p class="font-medium text-white">2%</p>
    </div>
  </div>
</div>
