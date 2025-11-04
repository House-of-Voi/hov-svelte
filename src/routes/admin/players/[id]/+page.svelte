<script lang="ts">
	import PlayerDetailClient from '$lib/components/admin/PlayerDetailClient.svelte';

	interface PageData {
		playerId: string;
	}

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Player Details - Admin - House of Voi</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<a
				href="/admin/players"
				class="text-gold-400 hover:text-gold-300 text-sm font-bold mb-2 inline-block uppercase tracking-wide"
			>
				← Back to Players
			</a>
			<h1 class="text-4xl font-black text-gold-400 neon-text uppercase">Player Details</h1>
		</div>
	</div>

	<PlayerDetailClient playerId={data.playerId} />
</div>
