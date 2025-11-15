/**
 * Game State Store (Svelte 5)
 *
 * Svelte 5 runes-based store for managing game state.
 * Replaces the Zustand store from the React version.
 */

import type { GameState, QueuedSpin, SymbolId } from '../types';
import { SpinStatus } from '../types';
import { calculateReservedBalance } from '../utils/validation';

/**
 * Default reel symbols for initial grid
 */
const DEFAULT_SYMBOLS: SymbolId[] = ['A', 'B', 'C', 'D', '_'];

/**
 * Generate initial grid
 */
function generateInitialGrid(): SymbolId[][] {
  return Array(5)
    .fill(null)
    .map(() =>
      Array(3)
        .fill(null)
        .map((_, i) => DEFAULT_SYMBOLS[i % DEFAULT_SYMBOLS.length])
    );
}

/**
 * Initial game state
 */
const initialState: GameState = {
  isSpinning: false,
  currentSpinId: null,
  waitingForOutcome: false,
  spinQueue: [],
  visibleGrid: generateInitialGrid(),
  balance: 0,
  reservedBalance: 0,
  currentBet: {
    betPerLine: 1_000_000, // 1 VOI
    paylines: 1,
    totalBet: 1_000_000,
  },
  isAutoSpinning: false,
  autoSpinCount: 0,
  activePaylineHighlights: [],
  showingWinCelebration: false,
  lastError: null,
};

/**
 * Create game store with Svelte 5 runes
 */
export function createGameStore() {
  // State using $state rune
  let state = $state<GameState>({ ...initialState });

  return {
    // Getters - these return the reactive values
    get isSpinning() {
      return state.isSpinning;
    },
    get currentSpinId() {
      return state.currentSpinId;
    },
    get waitingForOutcome() {
      return state.waitingForOutcome;
    },
    get spinQueue() {
      return state.spinQueue;
    },
    get visibleGrid() {
      return state.visibleGrid;
    },
    get balance() {
      return state.balance;
    },
    get reservedBalance() {
      return state.reservedBalance;
    },
    get currentBet() {
      return state.currentBet;
    },
    get isAutoSpinning() {
      return state.isAutoSpinning;
    },
    get autoSpinCount() {
      return state.autoSpinCount;
    },
    get lastError() {
      return state.lastError;
    },
    get activePaylineHighlights() {
      return state.activePaylineHighlights;
    },
    get showingWinCelebration() {
      return state.showingWinCelebration;
    },

    // Actions

    /**
     * Add a spin to the queue
     */
    addSpin(spin: QueuedSpin) {
      state.spinQueue = [...state.spinQueue, spin];
      this.updateReservedBalance();
    },

    /**
     * Update a spin in the queue
     */
    updateSpin(id: string, updates: Partial<QueuedSpin>) {
      state.spinQueue = state.spinQueue.map((spin) =>
        spin.id === id ? { ...spin, ...updates } : spin
      );
      this.updateReservedBalance();
    },

    /**
     * Remove a spin from the queue
     */
    removeSpin(id: string) {
      state.spinQueue = state.spinQueue.filter((spin) => spin.id !== id);
      this.updateReservedBalance();
    },

    /**
     * Clear completed spins from the queue
     */
    clearCompletedSpins() {
      state.spinQueue = state.spinQueue.filter(
        (spin) =>
          spin.status !== SpinStatus.COMPLETED &&
          spin.status !== SpinStatus.FAILED &&
          spin.status !== SpinStatus.EXPIRED
      );
      this.updateReservedBalance();
    },

    /**
     * Set the visible grid
     */
    setVisibleGrid(grid: SymbolId[][]) {
      state.visibleGrid = grid;
    },

    /**
     * Reset grid to initial state
     */
    resetGrid() {
      state.visibleGrid = generateInitialGrid();
    },

    /**
     * Set spinning state
     */
    setSpinning(spinning: boolean, spinId?: string) {
      state.isSpinning = spinning;
      if (spinId !== undefined) {
        state.currentSpinId = spinId;
      }
    },

    /**
     * Set waiting for outcome state
     */
    setWaitingForOutcome(waiting: boolean) {
      state.waitingForOutcome = waiting;
    },

    /**
     * Set balance (replaces optimistic balance with actual on-chain balance)
     */
    setBalance(balance: number) {
      state.balance = balance;
    },

    /**
     * Add to balance optimistically (before on-chain confirmation)
     */
    addToBalance(amount: number) {
      state.balance = state.balance + amount;
    },

    /**
     * Subtract from balance optimistically (before on-chain confirmation)
     */
    subtractFromBalance(amount: number) {
      state.balance = Math.max(0, state.balance - amount);
    },

    /**
     * Update reserved balance based on pending spins
     */
    updateReservedBalance() {
      const reserved = calculateReservedBalance(state.spinQueue);
      state.reservedBalance = reserved;
    },

    /**
     * Set current bet configuration (5reel format)
     */
    setBet(betPerLine: number, paylines: number) {
      state.currentBet = {
        betPerLine,
        paylines,
        totalBet: betPerLine * paylines,
        gameType: '5reel',
      };
    },

    /**
     * Set current bet configuration (W2W format)
     */
    setBetW2W(betAmount: number, mode: number, index: number) {
      state.currentBet = {
        betAmount,
        mode,
        index,
        totalBet: betAmount,
        gameType: 'w2w',
      };
    },

    /**
     * Start auto-spin mode
     */
    startAutoSpin(count: number) {
      state.isAutoSpinning = true;
      state.autoSpinCount = count;
    },

    /**
     * Stop auto-spin mode
     */
    stopAutoSpin() {
      state.isAutoSpinning = false;
      state.autoSpinCount = 0;
    },

    /**
     * Decrement auto-spin count
     */
    decrementAutoSpin() {
      if (state.autoSpinCount === -1) return; // Unlimited

      const newCount = Math.max(0, state.autoSpinCount - 1);
      state.autoSpinCount = newCount;
      state.isAutoSpinning = newCount > 0;
    },

    /**
     * Set error message
     */
    setError(error: string | null) {
      state.lastError = error;
    },

    /**
     * Set payline highlights
     */
    setPaylineHighlights(highlights: typeof state.activePaylineHighlights) {
      state.activePaylineHighlights = highlights;
    },

    /**
     * Clear payline highlights
     */
    clearPaylineHighlights() {
      state.activePaylineHighlights = [];
    },

    /**
     * Set win celebration state
     */
    setWinCelebration(showing: boolean) {
      state.showingWinCelebration = showing;
    },

    /**
     * Reset store to initial state
     */
    reset() {
      state = { ...initialState };
    },
  };
}

/**
 * Singleton game store instance
 */
export const gameStore = createGameStore();
