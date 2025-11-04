<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let referralCode = $state('');
	let loading = $state(false);
	let status = $state<{ type: 'success' | 'error'; message: string } | null>(null);

	async function handleAddReferral() {
		if (!referralCode || referralCode.length !== 7) {
			status = { type: 'error', message: 'Please enter a valid 7-character referral code' };
			return;
		}

		loading = true;
		status = null;

		try {
			const response = await fetch('/api/waitlist/add-referral', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ referralCode: referralCode.toUpperCase() })
			});

			const result = await response.json();

			if (!response.ok || !result.ok) {
				throw new Error(result.error || 'Failed to add referral code');
			}

			status = { type: 'success', message: 'Referral code added successfully! Refreshing...' };

			// Refresh the page to show updated info
			setTimeout(() => {
				window.location.reload();
			}, 1500);
		} catch (error) {
			console.error('Add referral error:', error);
			status = {
				type: 'error',
				message: error instanceof Error ? error.message : 'Failed to add referral code'
			};
		} finally {
			loading = false;
		}
	}

	const joinedDate = data.profile.joinedAt
		? new Date(data.profile.joinedAt).toLocaleDateString()
		: 'Unknown';
</script>

<div class="space-y-8 max-w-4xl mx-auto">
	<div class="text-center space-y-3">
		<h1 class="text-5xl font-black text-gold-400 neon-text uppercase">Waitlist</h1>
		<p class="text-neutral-400 text-lg">You're on the waitlist for game access</p>
	</div>

	<!-- Status Banner -->
	{#if status}
		<div
			class="p-6 rounded-xl text-center font-semibold text-lg {status.type === 'success'
				? 'bg-green-500/20 text-green-400 border-2 border-green-500/30'
				: 'bg-ruby-500/20 text-ruby-400 border-2 border-ruby-500/30'}"
		>
			{status.message}
		</div>
	{/if}

	<!-- Waitlist Status Card -->
	<Card glow={true}>
		<CardHeader>
			<h2 class="text-2xl font-bold text-gold-400 uppercase">Your Status</h2>
		</CardHeader>
		<CardContent className="space-y-6">
			<div class="grid md:grid-cols-2 gap-6">
				<div
					class="p-6 border border-gold-900/20 rounded-xl bg-gradient-to-br from-gold-500/5 to-transparent"
				>
					<div class="text-neutral-500 text-sm uppercase tracking-wider mb-2">Position</div>
					<div class="text-4xl font-black text-gold-400">
						{data.profile.waitlistPosition || '—'}
					</div>
					<div class="text-neutral-400 text-sm mt-2">
						{data.totalOnWaitlist > 0
							? `of ${data.totalOnWaitlist} total`
							: 'Pending assignment'}
					</div>
				</div>

				<div
					class="p-6 border border-gold-900/20 rounded-xl bg-gradient-to-br from-gold-500/5 to-transparent"
				>
					<div class="text-neutral-500 text-sm uppercase tracking-wider mb-2">Joined</div>
					<div class="text-2xl font-bold text-gold-400">
						{joinedDate}
					</div>
					<div class="text-neutral-400 text-sm mt-2">Waiting for admin approval</div>
				</div>
			</div>

			{#if data.referrerInfo}
				<div
					class="p-6 border border-gold-900/20 rounded-xl bg-gradient-to-br from-blue-500/5 to-transparent"
				>
					<div class="flex items-center justify-between">
						<div>
							<div class="text-neutral-500 text-sm uppercase tracking-wider mb-2">
								Referred By
							</div>
							<div class="text-xl font-bold text-gold-400">
								{data.referrerInfo.name}
							</div>
						</div>
						<div
							class="px-4 py-2 rounded-lg font-semibold text-sm {data.referrerInfo.isActive
								? 'bg-green-500/20 text-green-400'
								: 'bg-yellow-500/20 text-yellow-400'}"
						>
							{data.referrerInfo.isActive ? 'Active Boost' : 'On Waitlist'}
						</div>
					</div>
				</div>
			{/if}
		</CardContent>
	</Card>

	<!-- Add Referral Code (if not already have one) -->
	{#if !data.hasReferral}
		<Card glow={true}>
			<CardHeader>
				<h2 class="text-2xl font-bold text-gold-400 uppercase">Boost Your Position</h2>
			</CardHeader>
			<CardContent className="space-y-4">
				<p class="text-neutral-400">
					Have a referral code? Add it here to potentially improve your position on the waitlist.
				</p>
				<div class="flex gap-4">
					<Input
						type="text"
						bind:value={referralCode}
						placeholder="Enter 7-character code"
						maxlength={7}
						className="flex-1"
					/>
					<Button
						variant="primary"
						size="md"
						onclick={handleAddReferral}
						disabled={loading || referralCode.length !== 7}
					>
						{loading ? 'Adding...' : 'Add Code'}
					</Button>
				</div>
				{#if referralCode && referralCode.length !== 7}
					<p class="text-sm text-neutral-500">
						{7 - referralCode.length} characters remaining
					</p>
				{/if}
			</CardContent>
		</Card>
	{/if}

	<!-- Info Card -->
	<Card>
		<CardHeader>
			<h2 class="text-2xl font-bold text-gold-400 uppercase">How It Works</h2>
		</CardHeader>
		<CardContent className="space-y-4">
			<div class="space-y-3 text-neutral-400">
				<p>
					<span class="text-gold-400 font-semibold">1. Waitlist:</span> All new users start on the
					waitlist. Admins manually approve users for game access.
				</p>
				<p>
					<span class="text-gold-400 font-semibold">2. Referrals:</span> If you have a referral code,
					adding it may boost your position in the queue.
				</p>
				<p>
					<span class="text-gold-400 font-semibold">3. Access:</span> Once approved by an admin, you'll
					be able to access all games on the platform.
				</p>
				<p>
					<span class="text-gold-400 font-semibold">4. Your Code:</span> Your referral code is
					<span class="font-mono font-bold text-gold-400"
						>{data.profile.displayName || data.profile.email}</span
					>. Share it with friends once you get access!
				</p>
			</div>
		</CardContent>
	</Card>

	<!-- Action Buttons -->
	<div class="flex gap-4 justify-center">
		<a href="/app">
			<Button variant="secondary" size="md"> ← Back to Dashboard </Button>
		</a>
	</div>
</div>
