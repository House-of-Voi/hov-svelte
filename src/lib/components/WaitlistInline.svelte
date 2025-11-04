<script lang="ts">
  import Card from './ui/Card.svelte';
  import CardContent from './ui/CardContent.svelte';
  import Button from './ui/Button.svelte';
  import TicketIcon from './icons/TicketIcon.svelte';
  import UsersIcon from './icons/UsersIcon.svelte';

  interface Props {
    waitlistPosition: number | null;
    joinedAt: string | null;
    hasReferral: boolean;
    totalOnWaitlist: number;
    showFullLink?: boolean;
  }

  let {
    waitlistPosition,
    joinedAt,
    hasReferral,
    totalOnWaitlist,
    showFullLink = true
  }: Props = $props();

  const joinDate = joinedAt ? new Date(joinedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) : null;
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="text-center space-y-3">
    <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/20 mb-2">
      <TicketIcon size={32} class="text-primary-600 dark:text-primary-400" />
    </div>
    <h1 class="text-3xl md:text-4xl font-semibold text-neutral-950 dark:text-white">
      You're on the Waitlist
    </h1>
    <p class="text-neutral-700 dark:text-neutral-300 text-lg max-w-2xl mx-auto">
      We're gradually rolling out game access. You'll be notified when it's your turn to play!
    </p>
  </div>

  <!-- Status Cards -->
  <div class="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
    <!-- Position Card -->
    <Card elevated={true}>
      <CardContent class="p-6 text-center space-y-3">
        <div class="text-sm font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
          Your Position
        </div>
        <div class="text-4xl font-bold text-primary-600 dark:text-primary-400">
          {waitlistPosition !== null ? `#${waitlistPosition}` : 'Pending'}
        </div>
        <div class="text-xs text-neutral-600 dark:text-neutral-400">
          out of {totalOnWaitlist.toLocaleString()} total
        </div>
      </CardContent>
    </Card>

    <!-- Join Date Card -->
    <Card elevated={true}>
      <CardContent class="p-6 text-center space-y-3">
        <div class="text-sm font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
          Joined Waitlist
        </div>
        <div class="text-lg font-semibold text-neutral-950 dark:text-white">
          {joinDate || 'Recently'}
        </div>
        {#if hasReferral}
          <div class="inline-flex items-center gap-1 px-3 py-1 bg-success-100 dark:bg-success-900/20 text-success-700 dark:text-success-300 rounded-full text-xs font-medium">
            <UsersIcon size={12} />
            Referred
          </div>
        {/if}
      </CardContent>
    </Card>
  </div>

  <!-- Info Card -->
  <Card class="max-w-3xl mx-auto">
    <CardContent class="p-6 space-y-4">
      <h3 class="text-lg font-semibold text-neutral-950 dark:text-white">
        What happens next?
      </h3>
      <ul class="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
        <li class="flex items-start gap-3">
          <div class="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold text-xs mt-0.5">
            1
          </div>
          <span>We'll notify you via email when your access is granted</span>
        </li>
        <li class="flex items-start gap-3">
          <div class="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold text-xs mt-0.5">
            2
          </div>
          <span>Once granted, you'll be able to access all games and features</span>
        </li>
        <li class="flex items-start gap-3">
          <div class="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold text-xs mt-0.5">
            3
          </div>
          <span>Your referral code and rewards will be waiting for you</span>
        </li>
      </ul>
    </CardContent>
  </Card>

  <!-- Action Buttons -->
  {#if showFullLink}
    <div class="text-center space-y-4">
      <a href="/app/waitlist" class="inline-block">
        <Button variant="outline" size="md">
          Enter Referral Code
        </Button>
      </a>
      <div class="text-sm text-neutral-600 dark:text-neutral-400">
        Have a referral code? Enter it to move up the waitlist.
      </div>
    </div>
  {/if}
</div>
