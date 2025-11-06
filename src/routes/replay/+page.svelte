<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import Card from '$lib/components/ui/Card.svelte';
	import CardContent from '$lib/components/ui/CardContent.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ReelGrid from '$lib/components/game/ReelGrid.svelte';
	import HistoryReelGrid from '$lib/components/game/HistoryReelGrid.svelte';
	import { formatVoi } from '$lib/utils/format';
	import { ensureBase32TxId } from '$lib/utils/txIdUtils';
	import type { SymbolId } from '$lib/game-engine/types';
	import CheckCircleIcon from '$lib/components/icons/CheckCircleIcon.svelte';
	import CopyButton from '$lib/components/ui/CopyButton.svelte';

	let { data }: { data: PageData } = $props();

	// Animation state
	let isAnimating = $state(true);
	let showFinalGrid = $state(false);
	let reelGridComplete = $state(false);
	let showCelebration = $state(false);

	// Convert grid string[][] to SymbolId[][]
	const gridAsSymbolIds = data.replayData
		? (data.replayData.grid.map((col) => col.map((s) => s as SymbolId)) as SymbolId[][])
		: ([[], [], [], [], []] as SymbolId[][]);

	// Start animation on mount
	onMount(() => {
		// Show animation for 2.5 seconds
		setTimeout(() => {
			// Stop spinning but let ReelGrid show final outcome
			isAnimating = false;
		}, 2500);
	});

	// Handle when ReelGrid animation completes
	function handleReelGridComplete() {
		reelGridComplete = true;
		// Small delay to ensure smooth transition
		setTimeout(() => {
			showFinalGrid = true;
			// Show celebration if there's a win
			if (data.replayData && data.replayData.profit > 0) {
				setTimeout(() => {
					showCelebration = true;
					// Auto-hide celebration after duration based on win level
					const multiplier = data.replayData.multiplier;
					let duration = 2000; // default
					if (multiplier >= 100) duration = 4000; // jackpot
					else if (multiplier >= 20) duration = 3000; // large
					else if (multiplier >= 5) duration = 2500; // medium
					
					setTimeout(() => {
						showCelebration = false;
					}, duration);
				}, 300);
			}
		}, 100);
	}

	// Generate replay URL for sharing
	function getReplayUrl(): string {
		if (!data.replayData) return '';
		const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
		const txId = data.txId || data.replayData.txId;
		if (!txId) return '';
		return `${baseUrl}/replay?txid=${encodeURIComponent(txId)}&betPerLine=${data.replayData.betPerLine}&selectedPaylines=${data.replayData.selectedPaylines}`;
	}

	// Get blockchain explorer URL
	function getBlockchainExplorerUrl(txId: string): string {
		if (!txId) return '#';
		const normalizedTxId = ensureBase32TxId(txId);
		return `https://voi.observer/explorer/transaction/${normalizedTxId}`;
	}

	// Share replay
	async function shareReplay() {
		const url = getReplayUrl();
		if (!url) return;

		if (typeof navigator !== 'undefined' && navigator.share) {
			try {
				await navigator.share({
					title: 'House of Voi - Spin Replay',
					text: data.replayData?.profit && data.replayData.profit > 0
						? `Check out this winning spin! Won ${formatVoi(data.replayData.totalPayout)} VOI!`
						: 'Check out this spin replay!',
					url
				});
			} catch (err) {
				// User cancelled or error - fallback to clipboard
				await navigator.clipboard.writeText(url);
			}
		} else {
			// Fallback to clipboard
			await navigator.clipboard.writeText(url);
		}
	}
</script>

<svelte:head>
	<title>Spin Replay - House of Voi</title>
</svelte:head>

<div class="space-y-8 max-w-6xl mx-auto">
	<!-- Header -->
	<div>
		<h1 class="text-4xl font-black text-accent-500 dark:text-accent-400 neon-text uppercase">
			Spin Replay
		</h1>
		<p class="text-primary-600 dark:text-primary-400 mt-2">
			Relive your spin with full animation and outcome details.
		</p>
	</div>

	{#if data.error}
		<!-- Error State -->
		<Card>
			<CardContent class="p-8 text-center">
				<div class="text-error-600 dark:text-error-400 text-2xl mb-4">⚠️</div>
				<h2 class="text-2xl font-bold text-primary-700 dark:text-primary-300 mb-2">
					Unable to Load Replay
				</h2>
				<p class="text-primary-600 dark:text-primary-400 mb-6">{data.error}</p>
				<a href="/games/history">
					<Button variant="primary">Back to History</Button>
				</a>
			</CardContent>
		</Card>
	{:else if data.replayData}
		<!-- Replay Content -->
		<div class="space-y-6">
			<!-- Game Stats -->
			<div class="grid md:grid-cols-4 gap-6">
				<Card glow={true}>
					<CardContent class="p-6">
						<div class="text-sm text-primary-600 dark:text-primary-400 uppercase tracking-wider font-bold mb-2">
							Total Bet
						</div>
						<div class="text-3xl font-black text-accent-600 dark:text-accent-400">
							{formatVoi(data.replayData.totalBet)} VOI
						</div>
						<div class="text-xs text-primary-600/70 dark:text-primary-400/70 mt-1">
							{formatVoi(data.replayData.betPerLine)} × {data.replayData.selectedPaylines} lines
						</div>
					</CardContent>
				</Card>

				<Card glow={true}>
					<CardContent class="p-6">
						<div class="text-sm text-primary-600 dark:text-primary-400 uppercase tracking-wider font-bold mb-2">
							Payout
						</div>
						<div class="text-3xl font-black text-success-600 dark:text-success-400">
							{formatVoi(data.replayData.totalPayout)} VOI
						</div>
					</CardContent>
				</Card>

				<Card glow={true}>
					<CardContent class="p-6">
						<div class="text-sm text-primary-600 dark:text-primary-400 uppercase tracking-wider font-bold mb-2">
							Profit
						</div>
						<div
							class="text-3xl font-black {data.replayData.profit >= 0
								? 'text-success-600 dark:text-success-400'
								: 'text-error-600 dark:text-error-400'}"
						>
							{data.replayData.profit >= 0 ? '+' : ''}{formatVoi(data.replayData.profit)} VOI
						</div>
					</CardContent>
				</Card>

				<Card glow={true}>
					<CardContent class="p-6">
						<div class="text-sm text-primary-600 dark:text-primary-400 uppercase tracking-wider font-bold mb-2">
							Multiplier
						</div>
						<div class="text-3xl font-black text-accent-600 dark:text-accent-400">
							{data.replayData.multiplier > 0 ? data.replayData.multiplier.toFixed(2) : '0.00'}x
						</div>
					</CardContent>
				</Card>
			</div>

			<!-- Slot Machine Display -->
			<Card glow={true}>
				<CardContent class="p-6" style="position: relative;">
					{#if !showFinalGrid}
						<!-- Animated Reel Grid - shows spinning, then final outcome, then transitions -->
						<ReelGrid
							grid={gridAsSymbolIds}
							isSpinning={isAnimating}
							waitingForOutcome={isAnimating}
							winningLines={isAnimating ? [] : data.replayData.winningLines}
							onSpinComplete={handleReelGridComplete}
						/>
					{:else}
						<!-- Final Grid with Winning Lines -->
						<HistoryReelGrid
							grid={data.replayData.grid}
							winningLines={data.replayData.winningLines}
						/>
					{/if}

					<!-- Win Celebration Overlay -->
					{#if showCelebration && data.replayData && data.replayData.profit > 0}
						{@const multiplier = data.replayData.multiplier}
						{@const winLevel = multiplier >= 100 ? 'jackpot' : multiplier >= 20 ? 'large' : multiplier >= 5 ? 'medium' : 'small'}
						<div class="win-celebration-overlay">
							<div class="win-celebration-content">
								<div class="win-title win-title-{winLevel}">
									{#if winLevel === 'jackpot'}
										🎉 JACKPOT! 🎉
									{:else if winLevel === 'large'}
										🎊 BIG WIN! 🎊
									{:else if winLevel === 'medium'}
										✨ GREAT WIN! ✨
									{:else}
										🎰 WIN! 🎰
									{/if}
								</div>
								<div class="win-amount">
									+{formatVoi(data.replayData.totalPayout)} VOI
								</div>
								{#if multiplier > 0}
									<div class="win-multiplier">
										{multiplier.toFixed(2)}x Multiplier
									</div>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Winning Lines Details -->
					{#if showFinalGrid && data.replayData.winningLines.length > 0}
						<div
							class="mt-6 p-4 rounded-lg bg-success-100 dark:bg-success-900/20 border border-success-300 dark:border-success-500/30"
						>
							<div class="font-bold text-success-700 dark:text-success-300 mb-3 text-sm">
								Winning Lines: {data.replayData.winningLines.length}
							</div>
							<div class="space-y-2">
								{#each data.replayData.winningLines as line}
									<div class="text-primary-700 dark:text-primary-300 text-xs">
										Payline {line.paylineIndex + 1}: <span
											class="font-semibold text-accent-600 dark:text-accent-400"
										>{line.matchCount}x {line.symbol}</span> = <span
											class="font-bold text-success-600 dark:text-success-400"
										>{formatVoi(line.payout)} VOI</span>
									</div>
								{/each}
							</div>
						</div>
					{:else if showFinalGrid}
						<div class="mt-6 text-center text-primary-600/70 dark:text-primary-400/70 text-sm">
							No winning lines
						</div>
					{/if}
				</CardContent>
			</Card>

			<!-- Actions -->
			<Card>
				<CardHeader>
					<h2 class="text-2xl font-bold text-accent-600 dark:text-accent-400 uppercase">
						Actions
					</h2>
				</CardHeader>
				<CardContent>
					<div class="flex flex-wrap gap-4">
						<Button variant="primary" onclick={shareReplay}>
							Share Replay
						</Button>
						<CopyButton text={getReplayUrl()} label="Copy Link" />
						{#if data.replayData.txId}
							<a
								href={getBlockchainExplorerUrl(data.replayData.txId)}
								target="_blank"
								rel="noopener noreferrer"
							>
								<Button variant="outline">
									<CheckCircleIcon size={16} class="mr-2" />
									View on Explorer
								</Button>
							</a>
						{/if}
						<a href="/games/history">
							<Button variant="ghost">Back to History</Button>
						</a>
					</div>
				</CardContent>
			</Card>
		</div>
	{:else}
		<!-- Loading State -->
		<Card>
			<CardContent class="p-8 text-center">
				<div class="text-primary-600 dark:text-primary-400">Loading replay data...</div>
			</CardContent>
		</Card>
	{/if}
</div>

<style>
	.win-celebration-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10;
		pointer-events: none;
		animation: fadeIn 0.3s ease-in;
	}

	.win-celebration-content {
		text-align: center;
		animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.win-title {
		font-size: 3rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin-bottom: 1rem;
		text-shadow: 0 0 20px currentColor, 0 0 40px currentColor;
		animation: pulse 1s ease-in-out infinite;
	}

	.win-title-jackpot {
		color: #fbbf24;
		font-size: 4rem;
		animation: jackpotPulse 0.8s ease-in-out infinite;
	}

	.win-title-large {
		color: #f59e0b;
		font-size: 3.5rem;
	}

	.win-title-medium {
		color: #10b981;
		font-size: 3rem;
	}

	.win-title-small {
		color: #3b82f6;
		font-size: 2.5rem;
	}

	.win-amount {
		font-size: 2.5rem;
		font-weight: 800;
		color: #10b981;
		margin-bottom: 0.5rem;
		text-shadow: 0 0 15px rgba(16, 185, 129, 0.5);
		animation: slideUp 0.6s ease-out 0.2s both;
	}

	.win-multiplier {
		font-size: 1.25rem;
		font-weight: 600;
		color: #fbbf24;
		opacity: 0.9;
		animation: slideUp 0.6s ease-out 0.4s both;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes scaleIn {
		from {
			transform: scale(0.5);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	@keyframes pulse {
		0%, 100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.05);
		}
	}

	@keyframes jackpotPulse {
		0%, 100% {
			transform: scale(1) rotate(0deg);
		}
		25% {
			transform: scale(1.1) rotate(-2deg);
		}
		75% {
			transform: scale(1.1) rotate(2deg);
		}
	}

	@keyframes slideUp {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	/* Responsive */
	@media (max-width: 768px) {
		.win-title {
			font-size: 2rem;
		}

		.win-title-jackpot {
			font-size: 2.5rem;
		}

		.win-title-large {
			font-size: 2.25rem;
		}

		.win-title-medium {
			font-size: 2rem;
		}

		.win-title-small {
			font-size: 1.75rem;
		}

		.win-amount {
			font-size: 1.75rem;
		}

		.win-multiplier {
			font-size: 1rem;
		}
	}
</style>

