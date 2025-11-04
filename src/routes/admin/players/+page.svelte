<script lang="ts">
	import PlayersTable from '$lib/components/admin/PlayersTable.svelte';
</script>

<svelte:head>
	<title>Admin Players - House of Voi</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-4xl font-semibold text-neutral-950 dark:text-white uppercase">Players</h1>
			<p class="text-neutral-700 dark:text-neutral-300 mt-2">
				Manage player accounts, access, and profiles
			</p>
		</div>
	</div>

	<PlayersTable />
</div>
