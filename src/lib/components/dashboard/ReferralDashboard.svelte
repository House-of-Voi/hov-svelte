<script lang="ts">
	/**
	 * ReferralDashboard Component
	 *
	 * Compact referral section for side-by-side placement with WalletCard.
	 * Shows stats and top referrals.
	 */
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import type { ReferralDashboardData, ReferralWithStats } from '$lib/referrals/credits';
	import { formatLargeNumber } from '$lib/referrals/credits';

	interface Props {
		referralData: ReferralDashboardData | null;
		loading: boolean;
		onManageCodes: () => void;
		onReferralClick: (referral: ReferralWithStats) => void;
	}

	let { referralData, loading, onManageCodes, onReferralClick }: Props = $props();

	// Get top 3 referrals sorted by volume
	const topReferrals = $derived.by(() => {
		if (!referralData?.referrals) return [];

		const sorted = [...referralData.referrals].sort((a, b) => {
			let volumeA: number;
			let volumeB: number;

			if (a.mimirStats?.totalBet) {
				volumeA = parseFloat(a.mimirStats.totalBet);
			} else {
				volumeA = a.totalWagered * 1e6;
			}

			if (b.mimirStats?.totalBet) {
				volumeB = parseFloat(b.mimirStats.totalBet);
			} else {
				volumeB = b.totalWagered * 1e6;
			}

			return volumeB - volumeA;
		});

		return sorted.slice(0, 3);
	});

	// Format volume from aggregate stats
	const formattedTotalVolume = $derived.by(() => {
		if (!referralData?.aggregateStats?.totalVolume) return '0';
		const volume = parseFloat(referralData.aggregateStats.totalVolume) / 1e6;
		if (volume >= 1000) {
			return formatLargeNumber(volume);
		}
		return volume.toFixed(0);
	});

	function formatReferralVolume(referral: ReferralWithStats): string {
		let volume: number;
		if (referral.mimirStats?.totalBet) {
			volume = parseFloat(referral.mimirStats.totalBet) / 1e6;
		} else {
			volume = referral.totalWagered;
		}

		if (volume >= 1000) {
			return formatLargeNumber(volume);
		}
		return volume.toFixed(0);
	}
</script>

<Card>
	<CardContent className="p-6">
		<!-- Header -->
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-neutral-950 dark:text-white">Referrals</h2>
			<Button variant="ghost" size="sm" onclick={onManageCodes}>
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
						<rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
						<polyline points="17 2 12 7 7 2"></polyline>
					</svg>
					<span class="hidden sm:inline">Codes</span>
				</span>
			</Button>
		</div>

		{#if loading}
			<div class="flex items-center justify-center py-8">
				<p class="text-neutral-600 dark:text-neutral-400">Loading...</p>
			</div>
		{:else if referralData}
			<div class="space-y-4">
				<!-- Compact Stats Row -->
				<div class="grid grid-cols-3 gap-2">
					<div class="text-center p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
						<p class="text-2xl font-bold text-primary-600 dark:text-primary-400">
							{referralData.activeReferrals}
						</p>
						<p class="text-xs text-neutral-500">Active</p>
					</div>
					<div class="text-center p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
						<p class="text-lg font-bold text-neutral-800 dark:text-neutral-200">
							{formattedTotalVolume}
						</p>
						<p class="text-xs text-neutral-500">VOI Volume</p>
					</div>
					<div class="text-center p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
						<p class="text-2xl font-bold text-neutral-800 dark:text-neutral-200">
							{referralData.codesGenerated}<span class="text-sm font-normal text-neutral-400"
								>/{referralData.maxReferrals}</span
							>
						</p>
						<p class="text-xs text-neutral-500">Codes</p>
					</div>
				</div>

				<!-- Top Referrals Preview -->
				{#if topReferrals.length > 0}
					<div>
						<p class="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
							Top Performers
						</p>
						<div class="space-y-2">
							{#each topReferrals as referral (referral.referredProfileId)}
								<button
									onclick={() => onReferralClick(referral)}
									class="w-full flex items-center justify-between p-2 bg-neutral-50 dark:bg-neutral-900 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
								>
									<div class="flex items-center gap-2">
										<Avatar
											src={referral.referredUserAvatar}
											displayName={referral.referredUsername}
											size="sm"
										/>
										<div class="text-left">
											<p class="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate max-w-[100px]">
												{referral.referredUsername}
											</p>
											{#if referral.isActive}
												<span class="text-xs text-success-600 dark:text-success-400">Active</span>
											{:else}
												<span class="text-xs text-warning-600 dark:text-warning-400">Queued</span>
											{/if}
										</div>
									</div>
									<span class="text-sm font-mono font-medium text-primary-600 dark:text-primary-400">
										{formatReferralVolume(referral)} VOI
									</span>
								</button>
							{/each}
						</div>
					</div>
				{:else}
					<div class="text-center py-4">
						<p class="text-sm text-neutral-500">Share codes to start earning!</p>
					</div>
				{/if}

				<!-- Dashboard Link -->
				<Button
					variant="outline"
					size="sm"
					onclick={() => (window.location.href = '/app/referrals')}
					class="w-full"
				>
					View Full Dashboard
				</Button>
			</div>
		{:else}
			<div class="text-center py-8">
				<p class="text-error-600 dark:text-error-400 text-sm">Failed to load</p>
			</div>
		{/if}
	</CardContent>
</Card>
