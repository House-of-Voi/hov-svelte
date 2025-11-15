<script lang="ts">
	import type { WinLevel } from '$lib/game-engine/types';
	import { formatVoi } from '$lib/game-engine/utils/gameConstants';
	import { fly, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	interface Props {
		/** Whether to show the win display */
		show: boolean;
		/** Win amount in VOI */
		winAmount: number;
		/** Total bet in microVOI */
		totalBet: number;
		/** Win level for styling */
		winLevel?: WinLevel;
		/** Callback when display should close */
		onClose?: () => void;
	}

	let { show, winAmount, totalBet, winLevel = 'small', onClose }: Props = $props();

	// Calculate multiplier (convert totalBet from microVOI to VOI)
	let totalBetVOI = $derived(totalBet / 1_000_000);
	let multiplier = $derived(totalBetVOI > 0 ? (winAmount / totalBetVOI).toFixed(2) : '0');

	// Get win level styling
	let winLevelConfig = $derived.by(() => {
		switch (winLevel) {
			case 'jackpot':
				return {
					title: '🎉 JACKPOT! 🎉',
					color: '#FFD700',
					glow: '#FFF700',
					duration: 6000
				};
			case 'large':
				return {
					title: '🌟 BIG WIN! 🌟',
					color: '#FF6B35',
					glow: '#FF8C61',
					duration: 4000
				};
			case 'medium':
				return {
					title: '⭐ Nice Win! ⭐',
					color: '#A78BFA',
					glow: '#C4B5FD',
					duration: 2500
				};
			default:
				return {
					title: '✨ Winner! ✨',
					color: '#3B82F6',
					glow: '#60A5FA',
					duration: 1500
				};
		}
	});

	// Auto-close after duration
	$effect(() => {
		if (show && onClose) {
			const timeout = setTimeout(() => {
				onClose();
			}, winLevelConfig.duration);

			return () => clearTimeout(timeout);
		}
	});
</script>

{#if show}
	<div
		class="win-display-overlay"
		transition:fly={{ y: -50, duration: 400, easing: cubicOut }}
		role="dialog"
		aria-live="polite"
		aria-label="Win celebration"
	>
		<div
			class="win-display-content"
			class:jackpot={winLevel === 'jackpot'}
			class:large={winLevel === 'large'}
			class:medium={winLevel === 'medium'}
			transition:scale={{ duration: 300, easing: cubicOut }}
			style="--win-color: {winLevelConfig.color}; --win-glow: {winLevelConfig.glow}"
		>
			<h2 class="win-title">
				{winLevelConfig.title}
			</h2>

			<div class="win-amount">
				<span class="win-amount-value">{formatVoi(winAmount * 1_000_000)}</span>
			</div>

			<div class="win-multiplier">
				<span class="multiplier-label">Multiplier:</span>
				<span class="multiplier-value">{multiplier}x</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.win-display-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(8px);
		z-index: 1000;
	}

	.win-display-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		padding: 3rem 2rem;
		background: linear-gradient(
			135deg,
			rgba(30, 30, 50, 0.95),
			rgba(20, 20, 40, 0.95)
		);
		border: 3px solid var(--win-color);
		border-radius: 1.5rem;
		box-shadow:
			0 0 30px var(--win-glow),
			0 0 60px rgba(59, 130, 246, 0.3);
		max-width: 500px;
		width: 90%;
		cursor: default;
		animation: winPulse 2s ease-in-out infinite;
	}

	.win-display-content.jackpot {
		animation: jackpotPulse 1s ease-in-out infinite;
	}

	.win-title {
		font-size: 2.5rem;
		font-weight: 900;
		color: var(--win-color);
		text-align: center;
		text-shadow:
			0 0 20px var(--win-glow),
			0 0 40px var(--win-glow),
			0 4px 8px rgba(0, 0, 0, 0.5);
		margin: 0;
		letter-spacing: 0.05em;
	}

	.win-amount {
		padding: 1.5rem 2rem;
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid var(--win-color);
		border-radius: 1rem;
		width: 100%;
	}

	.win-amount-value {
		display: block;
		font-size: 3rem;
		font-weight: 900;
		color: var(--win-color);
		text-align: center;
		text-shadow: 0 0 15px var(--win-glow);
	}

	.win-multiplier {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1.5rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 0.75rem;
	}

	.multiplier-label {
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 600;
	}

	.multiplier-value {
		font-size: 1.5rem;
		font-weight: 800;
		color: var(--win-color);
		text-shadow: 0 0 10px var(--win-glow);
	}

	@keyframes winPulse {
		0%,
		100% {
			transform: scale(1);
			box-shadow:
				0 0 30px var(--win-glow),
				0 0 60px rgba(59, 130, 246, 0.3);
		}
		50% {
			transform: scale(1.02);
			box-shadow:
				0 0 40px var(--win-glow),
				0 0 80px rgba(59, 130, 246, 0.5);
		}
	}

	@keyframes jackpotPulse {
		0%,
		100% {
			transform: scale(1) rotate(0deg);
		}
		25% {
			transform: scale(1.05) rotate(1deg);
		}
		75% {
			transform: scale(1.05) rotate(-1deg);
		}
	}

	/* Responsive */
	@media (max-width: 640px) {
		.win-display-content {
			padding: 2rem 1.5rem;
		}

		.win-title {
			font-size: 1.75rem;
		}

		.win-amount-value {
			font-size: 2rem;
		}

		.multiplier-value {
			font-size: 1.25rem;
		}
	}
</style>
