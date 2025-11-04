<script lang="ts">
	import ReferralsTable from '$lib/components/admin/ReferralsTable.svelte';
</script>

<svelte:head>
	<title>Admin Referrals - House of Voi</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-4xl font-semibold text-neutral-950 dark:text-white uppercase">Referrals</h1>
			<p class="text-neutral-700 dark:text-neutral-300 mt-2">
				Monitor referral codes and conversions
			</p>
		</div>
	</div>

	<ReferralsTable />
</div>
