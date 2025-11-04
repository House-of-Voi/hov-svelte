<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PlayerDetail } from '$lib/types/admin';
	import DeleteUserModal from './DeleteUserModal.svelte';
	import { notificationStore } from '$lib/stores/notificationStore.svelte';

	interface Props {
		playerId: string;
	}

	let { playerId }: Props = $props();

	let player = $state<PlayerDetail | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let editing = $state(false);
	let editForm = $state<Partial<PlayerDetail>>({});
	let showDeleteModal = $state(false);

	async function fetchPlayer() {
		try {
			loading = true;
			error = null;

			const response = await fetch(`/api/admin/players/${playerId}`);
			const data = await response.json();

			if (data.success) {
				player = data.data;
				editForm = data.data;
			} else {
				error = data.error || 'Failed to fetch player';
			}
		} catch (err) {
			console.error('Error fetching player:', err);
			error = 'Failed to load player';
		} finally {
			loading = false;
		}
	}

	async function handleSave() {
		try {
			const response = await fetch(`/api/admin/players/${playerId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					display_name: editForm.display_name,
					primary_email: editForm.primary_email,
					max_referrals: editForm.max_referrals,
					game_access_granted: editForm.game_access_granted
				})
			});

			const data = await response.json();

			if (data.success) {
				notificationStore.success('Player updated successfully');
				editing = false;
				await fetchPlayer();
			} else {
				notificationStore.error(data.error || 'Failed to update player');
			}
		} catch (err) {
			console.error('Error updating player:', err);
			notificationStore.error('Failed to update player');
		}
	}

	function handleDeleteSuccess() {
		// Redirect to players list after successful deletion
		goto('/admin/players');
	}

	function formatNumberCompact(num: number): string {
		if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
		if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
		return num.toString();
	}

	onMount(() => {
		fetchPlayer();
	});
</script>

{#if loading}
	<div
		class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-8 text-center"
	>
		<div class="text-neutral-500 dark:text-neutral-400">Loading player details...</div>
	</div>
{:else if error || !player}
	<div
		class="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg p-4 text-error-800 dark:text-error-400"
	>
		{error || 'Player not found'}
	</div>
{:else}
	<div class="space-y-6">
		<!-- Profile Card -->
		<div
			class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6"
		>
			<div class="flex items-start justify-between mb-6">
				<h2 class="text-xl font-bold text-neutral-900 dark:text-neutral-100">
					Profile Information
				</h2>
				{#if editing}
					<div class="space-x-2">
						<button
							onclick={handleSave}
							class="px-4 py-2 bg-success-600 dark:bg-success-500 text-white rounded-lg hover:bg-success-700 dark:hover:bg-success-600 transition-colors font-medium"
						>
							Save
						</button>
						<button
							onclick={() => {
								editing = false;
								editForm = player;
							}}
							class="px-4 py-2 bg-neutral-600 dark:bg-neutral-700 text-white rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-600 transition-colors font-medium"
						>
							Cancel
						</button>
					</div>
				{:else}
					<button
						onclick={() => (editing = true)}
						class="px-4 py-2 bg-primary-600 dark:bg-primary-500 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors font-medium"
					>
						Edit
					</button>
				{/if}
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div>
					<label
						for="display-name"
						class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
						>Display Name</label
					>
					{#if editing}
						<input
							id="display-name"
							type="text"
							bind:value={editForm.display_name}
							class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
						/>
					{:else}
						<div class="text-neutral-900 dark:text-neutral-100">
							{player.display_name || 'Not set'}
						</div>
					{/if}
				</div>

				<div>
					<label
						for="email"
						class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
						>Email</label
					>
					{#if editing}
						<input
							id="email"
							type="email"
							bind:value={editForm.primary_email}
							class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
						/>
					{:else}
						<div class="text-neutral-900 dark:text-neutral-100">{player.primary_email}</div>
					{/if}
				</div>

				<div>
					<label
						for="game-access"
						class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
						>Game Access</label
					>
					{#if editing}
						<select
							id="game-access"
							bind:value={editForm.game_access_granted}
							class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
						>
							<option value={true}>Granted</option>
							<option value={false}>Not Granted</option>
						</select>
					{:else}
						<div>
							{#if player.game_access_granted}
								<span
									class="px-3 py-1 text-sm font-semibold rounded-full bg-success-100 dark:bg-success-900/30 text-success-800 dark:text-success-400 border border-success-300 dark:border-success-700"
								>
									Granted
								</span>
							{:else}
								<span
									class="px-3 py-1 text-sm font-semibold rounded-full bg-error-100 dark:bg-error-900/30 text-error-800 dark:text-error-400 border border-error-300 dark:border-error-700"
								>
									Not Granted
								</span>
							{/if}
						</div>
					{/if}
				</div>

				<div>
					<label
						for="max-referrals"
						class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
						>Max Referrals</label
					>
					{#if editing}
						<input
							id="max-referrals"
							type="number"
							bind:value={editForm.max_referrals}
							class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
						/>
					{:else}
						<div class="text-neutral-900 dark:text-neutral-100">{player.max_referrals}</div>
					{/if}
				</div>

				<div>
					<label
						for="player-id"
						class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
						>Player ID</label
					>
					<div id="player-id" class="text-neutral-900 dark:text-neutral-100 font-mono text-sm">
						{player.id}
					</div>
				</div>

				<div>
					<label
						for="joined-date"
						class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
						>Joined</label
					>
					<div id="joined-date" class="text-neutral-900 dark:text-neutral-100">
						{new Date(player.created_at).toLocaleString()}
					</div>
				</div>
			</div>
		</div>

		<!-- Accounts Card -->
		<div
			class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6"
		>
			<h2 class="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
				Linked Accounts
			</h2>
			<div class="space-y-3">
				{#each player.accounts as account, idx (idx)}
					<div
						class="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-900/50 rounded-lg"
					>
						<div class="flex items-center gap-3">
							<span
								class="px-3 py-1 text-sm font-medium rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200"
							>
								{account.chain.toUpperCase()}
							</span>
							<span class="font-mono text-sm text-neutral-900 dark:text-neutral-100"
								>{account.address}</span
							>
							{#if account.is_primary}
								<span
									class="px-2 py-0.5 text-xs font-semibold rounded bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-400 border border-primary-300 dark:border-primary-700"
								>
									Primary
								</span>
							{/if}
						</div>
					</div>
				{/each}
				{#if player.accounts.length === 0}
					<div class="text-neutral-500 dark:text-neutral-400 text-center py-4">
						No linked accounts
					</div>
				{/if}
			</div>
		</div>

		<!-- Stats Cards -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<!-- Game Stats -->
			<div
				class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6"
			>
				<h3 class="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-4">
					Game Statistics
				</h3>
				<div class="space-y-3">
					<div>
						<div class="text-sm text-neutral-600 dark:text-neutral-400">Total Spins</div>
						<div class="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
							{player.game_stats.total_spins}
						</div>
					</div>
					<div>
						<div class="text-sm text-neutral-600 dark:text-neutral-400">Total Bet</div>
						<div class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
							{formatNumberCompact(Number(player.game_stats.total_bet))}
						</div>
					</div>
					<div>
						<div class="text-sm text-neutral-600 dark:text-neutral-400">Total Won</div>
						<div class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
							{formatNumberCompact(Number(player.game_stats.total_won))}
						</div>
					</div>
					<div>
						<div class="text-sm text-neutral-600 dark:text-neutral-400">Net Result</div>
						<div
							class="text-lg font-semibold {parseFloat(player.game_stats.net_result) >= 0
								? 'text-success-600 dark:text-success-400'
								: 'text-error-600 dark:text-error-400'}"
						>
							{formatNumberCompact(Number(player.game_stats.net_result))}
						</div>
					</div>
					<div>
						<div class="text-sm text-neutral-600 dark:text-neutral-400">Win Rate</div>
						<div class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
							{player.game_stats.win_rate.toFixed(2)}%
						</div>
					</div>
				</div>
			</div>

			<!-- Referral Stats -->
			<div
				class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6"
			>
				<h3 class="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-4">
					Referral Statistics
				</h3>
				<div class="space-y-3">
					<div>
						<div class="text-sm text-neutral-600 dark:text-neutral-400">Total Referrals</div>
						<div class="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
							{player.referrals_count}
						</div>
					</div>
					<div>
						<div class="text-sm text-neutral-600 dark:text-neutral-400">Active Referrals</div>
						<div class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
							{player.active_referrals_count}
						</div>
					</div>
					<div>
						<div class="text-sm text-neutral-600 dark:text-neutral-400">Credits Earned</div>
						<div class="text-lg font-semibold text-success-600 dark:text-success-400">
							{player.referral_credits_earned}
						</div>
					</div>
					<div>
						<div class="text-sm text-neutral-600 dark:text-neutral-400">Max Referrals</div>
						<div class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
							{player.max_referrals}
						</div>
					</div>
				</div>
			</div>

			<!-- Account Stats -->
			<div
				class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6"
			>
				<h3 class="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-4">
					Account Information
				</h3>
				<div class="space-y-3">
					<div>
						<div class="text-sm text-neutral-600 dark:text-neutral-400">Total Plays</div>
						<div class="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
							{player.total_plays || 0}
						</div>
					</div>
					<div>
						<div class="text-sm text-neutral-600 dark:text-neutral-400">Total Wagered</div>
						<div class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
							{formatNumberCompact(Number(player.total_wagered))}
						</div>
					</div>
					<div>
						<div class="text-sm text-neutral-600 dark:text-neutral-400">Last Play</div>
						<div class="text-sm text-neutral-900 dark:text-neutral-100">
							{player.last_play_at ? new Date(player.last_play_at).toLocaleString() : 'Never'}
						</div>
					</div>
					<div>
						<div class="text-sm text-neutral-600 dark:text-neutral-400">Waitlist Position</div>
						<div class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
							{player.waitlist_position !== null ? `#${player.waitlist_position}` : 'N/A'}
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Danger Zone -->
		<div
			class="bg-white dark:bg-neutral-800 rounded-lg border-2 border-error-300 dark:border-error-700 p-6"
		>
			<h2 class="text-xl font-bold text-error-700 dark:text-error-400 mb-2">Danger Zone</h2>
			<p class="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
				Irreversible actions that affect this user account.
			</p>
			<button
				onclick={() => (showDeleteModal = true)}
				class="px-4 py-2 bg-error-600 hover:bg-error-700 dark:bg-error-600 dark:hover:bg-error-700 text-white rounded-lg transition-colors font-medium"
			>
				Deactivate User
			</button>
		</div>

		<!-- Delete Modal -->
		<DeleteUserModal
			isOpen={showDeleteModal}
			onClose={() => (showDeleteModal = false)}
			userId={playerId}
			userEmail={player.primary_email}
			userName={player.display_name}
			onSuccess={handleDeleteSuccess}
		/>
	</div>
{/if}
