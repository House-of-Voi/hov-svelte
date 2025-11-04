<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import BalancesCard from '$lib/components/wallet/BalancesCard.svelte';
	import AvatarEditModal from '$lib/components/form/AvatarEditModal.svelte';
	import ProfileEditModal from '$lib/components/form/ProfileEditModal.svelte';
	import ReferralCodesModal from '$lib/components/form/ReferralCodesModal.svelte';
	import { getInitializedCdp } from '$lib/auth/cdpClient';
	import { deriveAlgorandAddressFromEVM } from '$lib/chains/algorand-derive';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Get primary Voi address from database (may be outdated if derivation changed)
	const primaryVoiAccountFromDb =
		data.profileData.accounts.find((account) => account.chain === 'voi' && account.is_primary) ||
		data.profileData.accounts.find((account) => account.chain === 'voi');

	// State for dynamically derived Voi address (for CDP wallets)
	let primaryVoiAccount = $state<{ address: string; chain: string; is_primary: boolean } | undefined>(
		primaryVoiAccountFromDb
	);

	// State
	let status = $state<{ type: 'success' | 'error'; message: string } | null>(
		data.referralFlash ?? null
	);
	let referralCode = $state('');
	let isLinkingReferral = $state(false);
	let isAvatarModalOpen = $state(false);
	let isProfileEditModalOpen = $state(false);
	let isReferralCodesModalOpen = $state(false);
	let profile = $state({ ...data.profileData.profile });

	// Referral stats (loaded client-side)
	let referralStats = $state<any>(null);
	let loadingReferrals = $state(true);

	// Derive correct Voi address for CDP users on mount
	onMount(async () => {
		// If user has a CDP account, derive the correct Voi address
		if (data.session?.cdpUserId) {
			try {
				const cdpSdk = await getInitializedCdp();
				const currentUser = await cdpSdk.getCurrentUser();
				const baseWalletAddress =
					(Array.isArray((currentUser as { evmAccounts?: string[] }).evmAccounts)
						? (currentUser as { evmAccounts: string[] }).evmAccounts[0]
						: undefined) || (currentUser as { walletAddress?: string }).walletAddress;

				if (baseWalletAddress) {
					// Export the private key to derive the Voi address
					const { privateKey } = await cdpSdk.exportEvmAccount({
						evmAccount: baseWalletAddress as `0x${string}`
					});

					if (privateKey) {
						const derivedVoiAddress = deriveAlgorandAddressFromEVM(privateKey);

						// Update the primary Voi account with correct address
						primaryVoiAccount = {
							address: derivedVoiAddress,
							chain: 'voi',
							is_primary: true
						};
					}
				}
			} catch (error) {
				console.error('Failed to derive Voi address from CDP:', error);
				// Fall back to database address
			}
		}
	});

	// Load referral stats
	async function fetchReferralStats() {
		try {
			const response = await fetch('/api/referrals/info');
			const result = await response.json();

			if (result.ok) {
				referralStats = {
					codesGenerated: result.codesGenerated,
					codesAvailable: result.codesAvailable,
					maxReferrals: result.maxReferrals,
					activeReferrals: result.activeReferrals,
					queuedReferrals: result.queuedReferrals,
					totalReferrals: result.totalReferrals,
					codes: result.codes
				};
			}
		} catch (error) {
			console.error('Failed to fetch referral stats:', error);
		} finally {
			loadingReferrals = false;
		}
	}

	function clearStatusAfter(delayMs: number) {
		setTimeout(() => {
			status = null;
		}, delayMs);
	}

	// Copy address to clipboard
	function copyAddress(address: string) {
		navigator.clipboard.writeText(address);
		status = { type: 'success', message: 'Address copied!' };
		clearStatusAfter(2000);
	}

	// Link referral code
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

			// Refresh the page to show activated state
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
			body: JSON.stringify({
				display_name: displayName || null
			})
		});

		const result = await response.json();

		if (response.ok && result.success) {
			profile = result.data.profile;
			status = { type: 'success', message: 'Profile updated successfully!' };
			clearStatusAfter(3000);
			await invalidateAll();
		} else {
			throw new Error(result.error || 'Failed to update profile');
		}
	}

	function handleAvatarUploadSuccess(url: string) {
		profile = { ...profile, avatar_url: url };
		status = { type: 'success', message: 'Avatar uploaded successfully!' };
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
				status = { type: 'success', message: 'Avatar removed successfully!' };
				clearStatusAfter(3000);
				isAvatarModalOpen = false;
				await invalidateAll();
			} else {
				status = { type: 'error', message: result.error || 'Failed to delete avatar' };
				clearStatusAfter(5000);
			}
		} catch (error) {
			console.error('Failed to delete avatar:', error);
			status = { type: 'error', message: 'Failed to delete avatar. Please try again.' };
			clearStatusAfter(5000);
		}
	}

	function handleReferralCodesModalClose() {
		isReferralCodesModalOpen = false;
		fetchReferralStats();
	}

	// Fetch referral stats on mount
	$effect(() => {
		if (data.profileData.profile.max_referrals > 0) {
			fetchReferralStats();
		}
	});

	// Show referral flash message from server when present
	$effect(() => {
		if (data.referralFlash) {
			status = data.referralFlash;
			clearStatusAfter(5000);
		}
	});
</script>

<div class="space-y-8 max-w-4xl">
	<!-- Header -->
	<div class="flex items-end justify-between gap-4">
		<div>
			<h1 class="text-3xl md:text-4xl font-semibold text-neutral-950 dark:text-white">
				Welcome Back
			</h1>
			<p class="text-neutral-700 dark:text-neutral-300 mt-2">
				Manage your profile, wallets, and referrals.
			</p>
		</div>
	</div>

	<!-- Status Message -->
	{#if status}
		<div
			class="p-4 rounded-xl text-center font-medium {status.type === 'success'
				? 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300 border border-success-300 dark:border-success-700'
				: 'bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-300 border border-error-300 dark:border-error-700'}"
		>
			{status.message}
		</div>
	{/if}

	<!-- Waitlist/Activation Alert - Show if user is not activated -->
	{#if !data.isActivated}
		<Card>
			<CardContent className="p-6">
				<div class="space-y-4">
					<div class="flex items-start gap-4">
						<div
							class="flex-shrink-0 w-12 h-12 rounded-full bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center"
						>
							<span class="text-2xl">⏳</span>
						</div>
						<div class="flex-1">
							<h3 class="text-lg font-semibold text-neutral-950 dark:text-white mb-2">
								Account Not Yet Activated
							</h3>
							<p class="text-neutral-700 dark:text-neutral-300 mb-4">
								Enter a referral code to activate your account and access all features.
							</p>

							<div class="flex gap-3">
								<Input
									type="text"
									bind:value={referralCode}
									placeholder="Enter 7-character code"
									maxlength={7}
									onKeyDown={(e) => {
										if (e.key === 'Enter' && referralCode.length === 7) {
											handleLinkReferralCode();
										}
									}}
									className="flex-1"
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
								<p class="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
									{7 - referralCode.length} character{7 - referralCode.length !== 1
										? 's'
										: ''} remaining
								</p>
							{/if}
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	{/if}

	<!-- Profile Hero Section -->
	<Card>
		<CardContent className="p-8">
			<div class="flex items-start gap-6">
				<!-- Avatar -->
				<div class="relative">
					<Avatar
						src={profile.avatar_url}
						displayName={profile.display_name}
						alt={profile.display_name || profile.primary_email}
						size="xl"
						editable={true}
						onEditClick={() => {
							isAvatarModalOpen = true;
						}}
					/>
				</div>

				<!-- Profile Info -->
				<div class="flex-1 min-w-0">
					<div class="flex items-start justify-between gap-4">
						<div class="flex-1 min-w-0">
							<h2 class="text-2xl font-semibold text-neutral-950 dark:text-white">
								{profile.display_name || 'Set your name'}
							</h2>
							<p class="text-neutral-700 dark:text-neutral-300 text-sm mt-1">
								{profile.primary_email}
							</p>

							<!-- Primary Address -->
							{#if primaryVoiAccount}
								<div class="mt-3 flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
									<a
										href="https://block.voi.network/explorer/account/{primaryVoiAccount.address}"
										target="_blank"
										rel="noopener noreferrer"
										class="font-mono text-sm hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
									>
										{primaryVoiAccount.address.slice(0, 6)}...{primaryVoiAccount.address.slice(-4)}
									</a>
									<button
										onclick={() => copyAddress(primaryVoiAccount.address)}
										class="p-1 hover:bg-primary-50 dark:hover:bg-primary-950 rounded transition-colors"
										title="Copy address"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											class="text-primary-600 dark:text-primary-400"
										>
											<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
											<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
										</svg>
									</button>
								</div>
							{/if}
						</div>

						<!-- Edit Button -->
						<Button
							variant="secondary"
							size="sm"
							onclick={() => {
								isProfileEditModalOpen = true;
							}}
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
							>
								<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
								<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
							</svg>
							<span>Edit Profile</span>
						</Button>
					</div>
				</div>
			</div>
		</CardContent>
	</Card>

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

	<ReferralCodesModal
		isOpen={isReferralCodesModalOpen}
		onClose={handleReferralCodesModalClose}
	/>

	<!-- Unified Balances Card -->
	{#if primaryVoiAccount}
		<BalancesCard address={primaryVoiAccount.address} />
	{/if}

	<!-- Referral Section - Only show if user has referral slots -->
	{#if data.profileData.profile.max_referrals > 0}
		<Card id="referrals">
			<CardHeader>
				<h2 class="text-xl font-semibold text-neutral-950 dark:text-white">
					Your Referral Codes
				</h2>
			</CardHeader>
			<CardContent>
				{#if loadingReferrals}
					<p class="text-neutral-700 dark:text-neutral-300">Loading referral information...</p>
				{:else if referralStats}
					<div class="space-y-6">
						<!-- Referral Codes Summary -->
						<div
							class="text-center p-6 bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-950/30 dark:to-accent-950/30 border border-primary-200 dark:border-primary-800 rounded-xl"
						>
							<p class="text-neutral-700 dark:text-neutral-300 text-sm mb-2">Generated Codes</p>
							<div class="flex justify-center items-baseline gap-2">
								<span class="text-3xl font-semibold text-neutral-950 dark:text-white">
									{referralStats.codesGenerated}
								</span>
								<span class="text-xl text-neutral-700 dark:text-neutral-300"
									>/ {referralStats.maxReferrals}</span
								>
							</div>
							<p class="text-neutral-500 dark:text-neutral-400 text-xs mt-3">
								{#if referralStats.codesAvailable > 0}
									You can create {referralStats.codesAvailable} more code{referralStats.codesAvailable !==
									1
										? 's'
										: ''}
								{:else}
									All referral slots used
								{/if}
							</p>
						</div>

						<!-- Stats Grid -->
						<div class="grid grid-cols-3 gap-4">
							<div
								class="text-center p-4 bg-success-100 dark:bg-success-900/20 border border-success-300 dark:border-success-700 rounded-lg"
							>
								<div class="text-2xl font-semibold text-success-700 dark:text-success-300">
									{referralStats.activeReferrals}
								</div>
								<p class="text-xs text-neutral-700 dark:text-neutral-300 mt-1">Active</p>
							</div>
							<div
								class="text-center p-4 bg-warning-100 dark:bg-warning-900/20 border border-warning-300 dark:border-warning-700 rounded-lg"
							>
								<div class="text-2xl font-semibold text-warning-700 dark:text-warning-300">
									{referralStats.queuedReferrals}
								</div>
								<p class="text-xs text-neutral-700 dark:text-neutral-300 mt-1">Queued</p>
							</div>
							<div
								class="text-center p-4 bg-primary-100 dark:bg-primary-900/20 border border-primary-300 dark:border-primary-700 rounded-lg"
							>
								<div class="text-2xl font-semibold text-primary-700 dark:text-primary-300">
									{referralStats.totalReferrals}
								</div>
								<p class="text-xs text-neutral-700 dark:text-neutral-300 mt-1">Total</p>
							</div>
						</div>

						<!-- Actions -->
						<div class="flex justify-center">
							<Button
								variant="primary"
								size="md"
								className="px-8"
								onclick={() => {
									isReferralCodesModalOpen = true;
								}}
							>
								<div class="flex items-center gap-2 justify-center">
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
									<span>Manage Referral Codes</span>
								</div>
							</Button>
						</div>
					</div>
				{:else}
					<p class="text-error-600 dark:text-error-400">Failed to load referral information</p>
				{/if}
			</CardContent>
		</Card>
	{/if}

	<!-- Account Actions -->
	<Card>
		<CardHeader>
			<h2 class="text-xl font-semibold text-neutral-950 dark:text-white">Account Actions</h2>
		</CardHeader>
		<CardContent>
			<div class="flex justify-end">
				<button
					class="px-6 py-3 border-2 border-error-300 dark:border-error-700 text-error-600 dark:text-error-400 rounded-xl font-medium hover:bg-error-50 dark:hover:bg-error-950 transition-colors"
				>
					Delete Account
				</button>
			</div>
		</CardContent>
	</Card>
</div>
