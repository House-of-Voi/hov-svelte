<script lang="ts">
	/**
	 * QuickStats Component
	 *
	 * Shows for users without referral slots.
	 * Displays game stats, activity, or placeholder for future features.
	 */
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		gamesPlayed?: number;
		totalWagered?: number;
		biggestWin?: number;
	}

	let { gamesPlayed = 0, totalWagered = 0, biggestWin = 0 }: Props = $props();

	function formatNumber(num: number): string {
		if (num >= 1000000) {
			return (num / 1000000).toFixed(1) + 'M';
		}
		if (num >= 1000) {
			return (num / 1000).toFixed(1) + 'K';
		}
		return num.toFixed(0);
	}
</script>

<Card>
	<CardContent className="p-6">
		<!-- Header -->
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-neutral-950 dark:text-white">Your Stats</h2>
			<Button
				variant="ghost"
				size="sm"
				onclick={() => (window.location.href = '/stats')}
			>
				<span class="flex items-center gap-1.5">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M3 3v18h18"></path>
						<path d="M18 17V9"></path>
						<path d="M13 17V5"></path>
						<path d="M8 17v-3"></path>
					</svg>
					<span class="hidden sm:inline">More</span>
				</span>
			</Button>
		</div>

		<div class="space-y-4">
			<!-- Stats Grid -->
			<div class="grid grid-cols-3 gap-2">
				<div class="text-center p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
					<p class="text-2xl font-bold text-primary-600 dark:text-primary-400">
						{formatNumber(gamesPlayed)}
					</p>
					<p class="text-xs text-neutral-500">Games</p>
				</div>
				<div class="text-center p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
					<p class="text-lg font-bold text-neutral-800 dark:text-neutral-200">
						{formatNumber(totalWagered)}
					</p>
					<p class="text-xs text-neutral-500">Wagered</p>
				</div>
				<div class="text-center p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
					<p class="text-lg font-bold text-success-600 dark:text-success-400">
						{formatNumber(biggestWin)}
					</p>
					<p class="text-xs text-neutral-500">Best Win</p>
				</div>
			</div>

			<!-- Quick Actions -->
			<div class="pt-2">
				<p class="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
					Quick Actions
				</p>
				<div class="space-y-2">
					<Button
						variant="primary"
						size="md"
						onclick={() => (window.location.href = '/games')}
						class="w-full"
					>
						<span class="flex items-center gap-2 justify-center">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<rect x="4" y="4" width="16" height="16" rx="2"></rect>
								<circle cx="9" cy="9" r="1.5" fill="currentColor"></circle>
								<circle cx="15" cy="9" r="1.5" fill="currentColor"></circle>
								<circle cx="9" cy="15" r="1.5" fill="currentColor"></circle>
								<circle cx="15" cy="15" r="1.5" fill="currentColor"></circle>
							</svg>
							Play Games
						</span>
					</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={() => (window.location.href = '/leaderboard')}
						class="w-full"
					>
						View Leaderboard
					</Button>
				</div>
			</div>
		</div>
	</CardContent>
</Card>
