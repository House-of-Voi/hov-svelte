<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';

	// New profile components
	import ProfileHeroSection from '$lib/components/profile/ProfileHeroSection.svelte';
	import PlayerStatsBar from '$lib/components/profile/PlayerStatsBar.svelte';
	import ProfileTabs from '$lib/components/profile/ProfileTabs.svelte';
	import PortfolioTab from '$lib/components/profile/tabs/PortfolioTab.svelte';
	import StatisticsTab from '$lib/components/profile/tabs/StatisticsTab.svelte';
	import ReferralsTab from '$lib/components/profile/tabs/ReferralsTab.svelte';
	import FavoriteGamesTab from '$lib/components/profile/tabs/FavoriteGamesTab.svelte';

	// Modals (reused from existing)
	import AvatarEditModal from '$lib/components/form/AvatarEditModal.svelte';
	import ProfileEditModal from '$lib/components/form/ProfileEditModal.svelte';
	import ReferralCodesModal from '$lib/components/form/ReferralCodesModal.svelte';
	import ReferralDetailModal from '$lib/components/referrals/ReferralDetailModal.svelte';

	import type { PageData } from './$types';
	import type { ProfileTab } from '$lib/types/profile';
	import type { ReferralWithStats } from '$lib/referrals/credits';
	import {
		getInitializedCdp,
		exportEvmPrivateKey,
		signOutCdpSession,
		getCurrentCdpUser
	} from '$lib/auth/cdpClient';
	import { deriveAlgorandAccountFromEVM } from '$lib/chains/algorand-derive';
	import { storeGameAccountKeys, type GameAccountKeys } from '$lib/auth/gameAccountStorage';

	let { data }: { data: PageData } = $props();

	// CDP-derived Voi address from session (reactive to account switches)
	const voiAddress = $derived(data.voiAddress ?? undefined);
	const activeAccount = $derived(data.gameAccounts.find(a => a.id === data.activeGameAccountId));

	// Tab state
	let activeTab = $state<ProfileTab>('portfolio');

	// Status messages
	let status = $state<{ type: 'success' | 'error'; message: string } | null>(
		data.referralFlash ?? null
	);

	// Referral code activation state
	let referralCode = $state('');
	let isLinkingReferral = $state(false);

	// Modal states
	let isAvatarModalOpen = $state(false);
	let isProfileEditModalOpen = $state(false);
	let isReferralCodesModalOpen = $state(false);
	let isReferralDetailModalOpen = $state(false);
	let selectedReferralProfileId = $state<string | null>(null);

	// Profile state
	let profile = $state({ ...data.profileData.profile });

	// OAuth callback handling state
	let oauthProcessing = $state(false);
	let oauthProcessed = $state(false);

	function clearStatusAfter(delayMs: number) {
		setTimeout(() => {
			status = null;
		}, delayMs);
	}

	// Link referral code (for activation)
	async function handleLinkReferralCode() {
		if (!referralCode || referralCode.length !== 7) {
			status = { type: 'error', message: 'Please enter a valid 7-character referral code' };
			return;
		}

		isLinkingReferral = true;
		status = null;

		try {
			const response = await fetch('/api/profile/link-referral', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ referralCode: referralCode.toUpperCase() })
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				status = { type: 'error', message: result.error || 'Failed to link referral code' };
				isLinkingReferral = false;
				return;
			}

			status = { type: 'success', message: 'Referral code activated! Refreshing...' };
			setTimeout(() => {
				window.location.reload();
			}, 1500);
		} catch (error) {
			console.error('Link referral error:', error);
			status = { type: 'error', message: 'Failed to link referral code. Please try again.' };
			isLinkingReferral = false;
		}
	}

	async function handleSaveProfile(displayName: string) {
		const response = await fetch('/api/profile/me', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ display_name: displayName || null })
		});

		const result = await response.json();

		if (response.ok && result.success) {
			profile = result.data.profile;
			status = { type: 'success', message: 'Profile updated!' };
			clearStatusAfter(3000);
			await invalidateAll();
		} else {
			throw new Error(result.error || 'Failed to update profile');
		}
	}

	function handleAvatarUploadSuccess(url: string) {
		profile = { ...profile, avatar_url: url };
		status = { type: 'success', message: 'Avatar updated!' };
		clearStatusAfter(3000);
		invalidateAll().catch((err) => console.error('Failed to invalidate after avatar upload', err));
	}

	function handleAvatarUploadError(errorMessage: string) {
		status = { type: 'error', message: errorMessage };
		clearStatusAfter(5000);
	}

	async function handleDeleteAvatar() {
		try {
			const response = await fetch('/api/profile/avatar', { method: 'DELETE' });
			const result = await response.json();

			if (response.ok && result.success) {
				profile = result.data.profile;
				status = { type: 'success', message: 'Avatar removed!' };
				clearStatusAfter(3000);
				isAvatarModalOpen = false;
				await invalidateAll();
			} else {
				status = { type: 'error', message: result.error || 'Failed to delete avatar' };
				clearStatusAfter(5000);
			}
		} catch (error) {
			console.error('Failed to delete avatar:', error);
			status = { type: 'error', message: 'Failed to delete avatar.' };
			clearStatusAfter(5000);
		}
	}

	function handleReferralCodesModalClose() {
		isReferralCodesModalOpen = false;
	}

	function handleReferralClick(referral: ReferralWithStats) {
		selectedReferralProfileId = referral.referredProfileId;
		isReferralDetailModalOpen = true;
	}

	function handleCloseReferralModal() {
		isReferralDetailModalOpen = false;
		selectedReferralProfileId = null;
	}

	function handleTabChange(tab: ProfileTab) {
		activeTab = tab;
	}

	// OAuth callback handling
	async function handleOAuthCallback() {
		if (!browser || oauthProcessed) return;

		const urlParams = new URLSearchParams(window.location.search);
		const code = urlParams.get('code');
		const flowId = urlParams.get('flow_id');
		const providerType = urlParams.get('provider_type');

		if (!code || !flowId || providerType !== 'google') {
			return;
		}

		oauthProcessed = true;
		oauthProcessing = true;
		status = { type: 'success', message: 'Completing Google sign-in...' };

		try {
			await getInitializedCdp();
			const user = await getCurrentCdpUser();

			if (!user) {
				throw new Error('Failed to authenticate with Google');
			}

			const baseAddress = user.evmAccounts?.[0] || user.evmSmartAccounts?.[0];
			if (!baseAddress) {
				throw new Error('No wallet found');
			}

			const formattedAddress = baseAddress.startsWith('0x')
				? (baseAddress as `0x${string}`)
				: (`0x${baseAddress}` as `0x${string}`);

			const privateKey = await exportEvmPrivateKey(formattedAddress);

			if (!privateKey) {
				throw new Error('Unable to access wallet');
			}

			const derivedAccount = deriveAlgorandAccountFromEVM(privateKey);
			const voiAddr = String(derivedAccount.addr);

			const voiPrivateKey = Array.from(derivedAccount.sk)
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');

			const baseAddressLower = (baseAddress as string).toLowerCase();
			const keys: GameAccountKeys = {
				basePrivateKey: privateKey,
				voiPrivateKey,
				baseAddress: baseAddressLower,
				voiAddress: voiAddr,
				storedAt: Date.now()
			};

			await storeGameAccountKeys(keys);
			derivedAccount.sk.fill(0);

			const googleEmail = user.authenticationMethods?.google?.email;
			const recoveryHint = googleEmail ? obfuscateEmail(googleEmail) : 'Google account';

			const response = await fetch('/api/game-accounts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cdpUserId: user.userId || (user as any).id,
					baseAddress: baseAddressLower,
					voiAddress: voiAddr,
					cdpRecoveryMethod: 'google',
					cdpRecoveryHint: recoveryHint
				})
			});

			const result = await response.json();

			await signOutCdpSession();

			if (!response.ok || !result.ok) {
				throw new Error(result.error || 'Failed to register wallet');
			}

			window.history.replaceState({}, '', '/app');
			status = { type: 'success', message: 'Google account added!' };
			clearStatusAfter(5000);

			await invalidateAll();
		} catch (err) {
			console.error('OAuth callback error:', err);
			await signOutCdpSession().catch(() => {});
			window.history.replaceState({}, '', '/app');
			status = {
				type: 'error',
				message: err instanceof Error ? err.message : 'Failed to add Google account'
			};
			clearStatusAfter(8000);
		} finally {
			oauthProcessing = false;
		}
	}

	function obfuscateEmail(email: string): string {
		const [local, domain] = email.split('@');
		if (!domain) return email;
		const [domainName, ...tld] = domain.split('.');
		const obfuscatedLocal = local.length > 1 ? local[0] + '***' : local;
		const obfuscatedDomain = domainName.length > 1 ? domainName[0] + '***' : domainName;
		return `${obfuscatedLocal}@${obfuscatedDomain}.${tld.join('.')}`;
	}

	onMount(() => {
		handleOAuthCallback();
	});

	$effect(() => {
		if (data.referralFlash) {
			status = data.referralFlash;
			clearStatusAfter(5000);
		}
	});
</script>

<!-- OAuth Processing Overlay -->
{#if oauthProcessing}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div class="rounded-xl bg-[#4c4c4c] p-8 text-center shadow-xl">
			<div class="mb-4 flex justify-center">
				<div
					class="h-12 w-12 animate-spin rounded-full border-4 border-white border-t-transparent"
				></div>
			</div>
			<h3 class="text-lg font-semibold text-white">
				Adding Google Account...
			</h3>
			<p class="mt-2 text-sm text-white/70">
				Please wait while we complete the setup.
			</p>
		</div>
	</div>
{/if}

<div class="flex flex-col gap-6 px-4 py-0 w-full max-w-5xl">
	<!-- Status Message -->
	{#if status}
		<div
			class="p-4 rounded-xl text-center font-medium {status.type === 'success'
				? 'bg-green-500/20 text-green-300 border border-green-500/30'
				: 'bg-red-500/20 text-red-300 border border-red-500/30'}"
		>
			{status.message}
		</div>
	{/if}

	<!-- Activation Alert - Show if user is not activated -->
	{#if !data.isActivated}
		<Card>
			<CardContent class="p-6 bg-[#4c4c4c]">
				<div class="flex items-start gap-4">
					<div
						class="flex-shrink-0 w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center"
					>
						<span class="text-2xl">⏳</span>
					</div>
					<div class="flex-1">
						<h3 class="text-lg font-semibold text-white mb-2">
							Activate Your Account
						</h3>
						<p class="text-white/70 text-sm mb-4">
							Enter a referral code to unlock all features and start playing.
						</p>

						<div class="flex gap-3">
							<Input
								type="text"
								bind:value={referralCode}
								placeholder="Enter 7-character code"
								maxlength={7}
								onkeydown={(e: KeyboardEvent) => {
									if (e.key === 'Enter' && referralCode.length === 7) {
										handleLinkReferralCode();
									}
								}}
								class="flex-1 font-mono uppercase bg-[#333] border-[#808080] text-white"
							/>
							<Button
								variant="primary"
								size="md"
								onclick={handleLinkReferralCode}
								disabled={isLinkingReferral || referralCode.length !== 7}
							>
								{isLinkingReferral ? 'Activating...' : 'Activate'}
							</Button>
						</div>

						{#if referralCode && referralCode.length !== 7}
							<p class="text-xs text-white/50 mt-2">
								{7 - referralCode.length} more character{7 - referralCode.length !== 1 ? 's' : ''}
							</p>
						{/if}
					</div>
				</div>
			</CardContent>
		</Card>
	{/if}

	<!-- Profile Hero Section -->
	<ProfileHeroSection
		avatarUrl={profile.avatar_url}
		displayName={profile.display_name}
		{voiAddress}
		onEditAvatar={() => (isAvatarModalOpen = true)}
		onEditProfile={() => (isProfileEditModalOpen = true)}
	/>

	<!-- Player Stats Bar -->
	<PlayerStatsBar
		spins={data.playerStats.totalSpins}
		winRate={data.playerStats.winRate}
		streak={data.playerStats.currentStreak}
	/>

	<!-- Tab Navigation -->
	<ProfileTabs
		{activeTab}
		onTabChange={handleTabChange}
	/>

	<!-- Tab Content -->
	<div class="w-full">
		{#if activeTab === 'portfolio'}
			<PortfolioTab
				{voiAddress}
				gameAccounts={data.gameAccounts}
				activeAccountId={data.activeGameAccountId || ''}
			/>
		{:else if activeTab === 'statistics'}
			<StatisticsTab />
		{:else if activeTab === 'referrals'}
			<ReferralsTab />
		{:else if activeTab === 'favorites'}
			<FavoriteGamesTab />
		{/if}
	</div>
</div>

<!-- Modals -->
<AvatarEditModal
	isOpen={isAvatarModalOpen}
	onClose={() => (isAvatarModalOpen = false)}
	currentAvatarUrl={profile.avatar_url}
	onUploadSuccess={handleAvatarUploadSuccess}
	onUploadError={handleAvatarUploadError}
	onDelete={handleDeleteAvatar}
/>

<ProfileEditModal
	isOpen={isProfileEditModalOpen}
	onClose={() => (isProfileEditModalOpen = false)}
	currentDisplayName={profile.display_name}
	email={profile.primary_email}
	onSave={handleSaveProfile}
/>

<ReferralCodesModal isOpen={isReferralCodesModalOpen} onClose={handleReferralCodesModalClose} />

{#if selectedReferralProfileId}
	<ReferralDetailModal
		isOpen={isReferralDetailModalOpen}
		onClose={handleCloseReferralModal}
		referredProfileId={selectedReferralProfileId}
	/>
{/if}
