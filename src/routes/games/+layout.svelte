<script lang="ts">
  import WaitlistInline from '$lib/components/WaitlistInline.svelte';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: any } = $props();
</script>

{#if data.waitlistData}
  <!-- User is on waitlist - show waitlist info above games -->
  <div class="space-y-8">
    <WaitlistInline
      waitlistPosition={data.waitlistData.waitlistPosition}
      joinedAt={data.waitlistData.joinedAt}
      hasReferral={data.waitlistData.hasReferral}
      totalOnWaitlist={data.waitlistData.totalOnWaitlist}
      showFullLink={true}
    />
    {@render children()}
  </div>
{:else}
  <!-- No waitlist - show games normally -->
  {@render children()}
{/if}
