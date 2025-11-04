<script lang="ts">
	import { onMount } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CopyButton from '$lib/components/ui/CopyButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import { notificationStore } from '$lib/stores/notificationStore.svelte';

	type Props = {
		isOpen: boolean;
		onClose: () => void;
	};

	let { isOpen, onClose }: Props = $props();

	interface ReferralCodeInfo {
		id: string;
		code: string;
		referredProfileId: string | null;
		referredUserName: string | null;
		referredUserAvatar: string | null;
		attributedAt: string | null;
		convertedAt: string | null;
		deactivatedAt: string | null;
		createdAt: string;
	}

	interface ReferralStats {
		codesGenerated: number;
		codesAvailable: number;
		maxReferrals: number;
		activeReferrals: number;
		queuedReferrals: number;
		totalReferrals: number;
		codes: ReferralCodeInfo[];
	}

	let stats = $state<ReferralStats | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let isCreating = $state(false);
	let deactivatingId = $state<string | null>(null);

	async function fetchStats() {
		try {
			const response = await fetch('/api/referrals/info');
			const data = await response.json();

			if (data.ok) {
				stats = {
					codesGenerated: data.codesGenerated,
					codesAvailable: data.codesAvailable,
					maxReferrals: data.maxReferrals,
					activeReferrals: data.activeReferrals,
					queuedReferrals: data.queuedReferrals,
					totalReferrals: data.totalReferrals,
					codes: data.codes
				};
			} else {
				error = data.error || 'Failed to load referral stats';
			}
		} catch (err) {
			console.error('Failed to load referral stats:', err);
			error = 'Failed to load referral stats';
		} finally {
			loading = false;
		}
	}

	async function handleCreateCode() {
		isCreating = true;
		try {
			const response = await fetch('/api/referrals/create', {
				method: 'POST'
			});
			const data = await response.json();

			if (!response.ok) {
				notificationStore.error(data.error || 'Failed to create referral code');
				return;
			}

			fetchStats();
		} catch (err) {
			console.error('Error creating code:', err);
			notificationStore.error('Failed to create referral code');
		} finally {
			isCreating = false;
		}
	}

	async function handleDeactivate(codeId: string) {
		if (!confirm('Are you sure you want to deactivate this code?')) {
			return;
		}

		deactivatingId = codeId;
		try {
			const response = await fetch('/api/referrals/deactivate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ codeId })
			});
			const data = await response.json();

			if (!response.ok) {
				notificationStore.error(data.error || 'Failed to deactivate code');
				return;
			}

			fetchStats();
		} catch (err) {
			console.error('Error deactivating code:', err);
			notificationStore.error('Failed to deactivate code');
		} finally {
			deactivatingId = null;
		}
	}

	$effect(() => {
		if (isOpen) {
			loading = true;
			error = null;
			fetchStats();
		}
	});

	const slotsRemaining = stats ? stats.maxReferrals - stats.activeReferrals : 0;
</script>

<Modal {isOpen} {onClose} title="Manage Referral Codes" size="full">
	<div class="space-y-6">
		{#if loading}
			<div class="text-center py-8">
				<p class="text-neutral-700 dark:text-neutral-300">Loading your referral codes...</p>
			</div>
		{:else if error || !stats}
			<div class="text-center py-8">
				<p class="text-error-600 dark:text-error-400">{error || 'Failed to load stats'}</p>
			</div>
		{:else}
			<!-- Create New Code Section -->
			<Card glow={true}>
				<CardContent className="space-y-4">
					<div class="flex justify-between items-center">
						<div>
							<p class="text-neutral-700 dark:text-neutral-300 text-sm">Your Referral Codes</p>
							<div class="flex items-baseline gap-2 mt-1">
								<span class="text-3xl font-semibold text-primary-600 dark:text-primary-400">
									{stats.codesGenerated}
								</span>
								<span class="text-xl text-neutral-700 dark:text-neutral-300"
									>/ {stats.maxReferrals}</span
								>
							</div>
							<p class="text-neutral-600 dark:text-neutral-500 text-xs mt-1">
								{#if stats.codesAvailable > 0}
									You can create {stats.codesAvailable} more code{stats.codesAvailable !== 1
										? 's'
										: ''}
								{:else}
									You've reached your limit
								{/if}
							</p>
						</div>
						<Button
							variant="primary"
							size="md"
							onclick={handleCreateCode}
							disabled={isCreating || stats.codesAvailable <= 0}
							className="px-6"
						>
							<div class="flex items-center gap-2">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
									<polyline points="17 2 12 7 7 2"></polyline>
								</svg>
								<span>{isCreating ? 'Creating...' : 'Create New Code'}</span>
							</div>
						</Button>
					</div>
				</CardContent>
			</Card>

			<!-- Your Referrals -->
			{#if stats.codes.filter((code) => code.referredProfileId).length > 0}
				<div class="space-y-4">
					<h3 class="text-lg font-semibold text-neutral-950 dark:text-white">Your Referrals</h3>
					<div class="space-y-2">
						{#each stats.codes.filter((code) => code.referredProfileId) as code}
							<Card>
								<CardContent className="p-4">
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-3">
											<Avatar
												src={code.referredUserAvatar}
												displayName={code.referredUserName}
												alt={code.referredUserName || 'User'}
												size="md"
											/>
											<div>
												<p class="font-semibold text-neutral-950 dark:text-white">
													{code.referredUserName || 'Anonymous User'}
												</p>
												<p class="text-xs text-neutral-700 dark:text-neutral-300">
													Joined {new Date(code.convertedAt!).toLocaleDateString()}
												</p>
											</div>
										</div>
										<div class="text-right">
											<span
												class="px-2 py-1 bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300 text-xs rounded-full border border-success-300 dark:border-success-700 uppercase font-semibold"
											>
												Active
											</span>
											<p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1 font-mono">
												{code.code}
											</p>
										</div>
									</div>
								</CardContent>
							</Card>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Available Codes -->
			{#if stats.codes.filter((code) => !code.referredProfileId && !code.deactivatedAt).length > 0}
				<div class="space-y-4">
					<h3 class="text-lg font-semibold text-neutral-950 dark:text-white">Available Codes</h3>
					<p class="text-sm text-neutral-700 dark:text-neutral-300">
						Share these codes to invite new members
					</p>
					<div class="grid md:grid-cols-2 gap-3">
						{#each stats.codes.filter((code) => !code.referredProfileId && !code.deactivatedAt) as code}
							{@const referralUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/r/${code.code}`}
							<Card>
								<CardContent className="p-3">
									<div class="space-y-2">
										<div class="flex items-center justify-between">
											<span
												class="font-mono text-xl font-semibold text-primary-600 dark:text-primary-400"
											>
												{code.code}
											</span>
											<span
												class="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs rounded-full border border-primary-300 dark:border-primary-700 uppercase font-semibold"
											>
												Ready
											</span>
										</div>
										<div
											class="text-xs font-mono text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-900 px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-800 break-all"
										>
											{referralUrl}
										</div>
										<div class="flex gap-2">
											<CopyButton text={referralUrl} label="Copy" className="flex-1 text-xs" />
											<Button
												variant="ghost"
												size="sm"
												onclick={() => handleDeactivate(code.id)}
												disabled={deactivatingId === code.id}
												className="text-error-600 dark:text-error-400 border-error-300 dark:border-error-700 hover:bg-error-50 dark:hover:bg-error-950 text-xs"
											>
												{deactivatingId === code.id ? '...' : 'Remove'}
											</Button>
										</div>
									</div>
								</CardContent>
							</Card>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Stats Grid -->
			<div class="grid md:grid-cols-3 gap-6">
				<Card>
					<CardContent className="text-center space-y-2">
						<div class="text-4xl font-semibold text-success-700 dark:text-success-300">
							{stats.activeReferrals}
						</div>
						<p class="text-neutral-950 dark:text-white font-medium">Active Referrals</p>
						<p class="text-sm text-neutral-700 dark:text-neutral-300">
							{slotsRemaining} slot{slotsRemaining !== 1 ? 's' : ''} remaining
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardContent className="text-center space-y-2">
						<div class="text-4xl font-semibold text-warning-700 dark:text-warning-300">
							{stats.queuedReferrals}
						</div>
						<p class="text-neutral-950 dark:text-white font-medium">In Queue</p>
						<p class="text-sm text-neutral-700 dark:text-neutral-300">Waiting for slots to open</p>
					</CardContent>
				</Card>

				<Card>
					<CardContent className="text-center space-y-2">
						<div class="text-4xl font-semibold text-primary-700 dark:text-primary-300">
							{stats.totalReferrals}
						</div>
						<p class="text-neutral-950 dark:text-white font-medium">Total Referrals</p>
						<p class="text-sm text-neutral-700 dark:text-neutral-300">All-time signups</p>
					</CardContent>
				</Card>
			</div>
		{/if}
	</div>
</Modal>
