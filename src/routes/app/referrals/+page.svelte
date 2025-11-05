<script lang="ts">
  import ReferralDashboard from '$lib/components/referrals/ReferralDashboard.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Referral Dashboard - House of Voi</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h1 class="text-3xl md:text-4xl font-semibold text-neutral-950 dark:text-white">
        Referral Dashboard
      </h1>
      <p class="text-neutral-700 dark:text-neutral-300 mt-2">
        Manage your referrals and track their volume statistics
      </p>
    </div>
    <Button
      variant="outline"
      size="md"
      onclick={() => goto('/app')}
      className="flex items-center gap-2"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M20 9v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9"></path>
        <path d="M9 22V12h6v10"></path>
        <path d="M2 10.6L12 2l10 8.6"></path>
      </svg>
      <span>Back to Profile</span>
    </Button>
  </div>

  <ReferralDashboard contractId={data.contractId} />
</div>

