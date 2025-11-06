/**
 * Recent Wins Store
 * Manages state for recent wins and integrates with recentWinsService
 */

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { recentWinsService, type RecentWinEvent } from '$lib/services/recentWinsService';
import { truncateAddress } from '$lib/utils/format';

export interface RecentWinsState {
  wins: RecentWinEvent[];
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

const initialState: RecentWinsState = {
  wins: [],
  isLoading: false,
  isConnected: false,
  error: null,
  lastUpdated: null,
};

function createRecentWinsStore() {
  const { subscribe, set, update } = writable<RecentWinsState>(initialState);
  let unsubscribeWinEvents: (() => void) | null = null;
  let initializationPromise: Promise<void> | null = null;

  const store = {
    subscribe,

    /**
     * Initialize the store and fetch initial wins
     */
    async initialize(config?: { contractIds?: number[]; maxWins?: number }): Promise<void> {
      if (initializationPromise) return initializationPromise;
      if (!browser) return;

      initializationPromise = this._initialize(config);
      return initializationPromise;
    },

    async _initialize(config?: { contractIds?: number[]; maxWins?: number }): Promise<void> {
      try {
        update((state) => ({
          ...state,
          isLoading: true,
          error: null,
        }));

        // Initialize the service
        await recentWinsService.initialize({
          maxWins: config?.maxWins || 20,
          contractIds: config?.contractIds,
        });

        // Fetch initial wins
        const initialWins = await recentWinsService.fetchInitialWins(
          config?.maxWins || 20,
          config?.contractIds
        );

        update((state) => ({
          ...state,
          wins: initialWins,
          isLoading: false,
          isConnected: true,
          lastUpdated: new Date(),
        }));

        // Subscribe to new win events
        unsubscribeWinEvents = recentWinsService.onWinEvent((winEvent) => {
          this.handleWinEvent(winEvent, config?.maxWins || 20);
        });
      } catch (error) {
        console.error('Failed to initialize Recent Wins Store:', error);
        update((state => ({
          ...state,
          isLoading: false,
          isConnected: false,
          error: error instanceof Error ? error.message : 'Failed to initialize',
        })));
      }
    },

    /**
     * Handle incoming win events
     */
    handleWinEvent(winEvent: RecentWinEvent, maxWins: number): void {
      update((state) => {
        // Check if this win already exists (prevent duplicates)
        const exists = state.wins.some(
          (w) => w.txid === winEvent.txid && w.round === winEvent.round && w.intra === winEvent.intra
        );

        if (exists) {
          return state;
        }

        // Add new win to the beginning and limit to maxWins
        const newWins = [winEvent, ...state.wins].slice(0, maxWins);

        return {
          ...state,
          wins: newWins,
          lastUpdated: new Date(),
        };
      });
    },

    /**
     * Get display name for an address
     * For now, we'll use truncated address. Can be enhanced later with profile lookup
     */
    getDisplayName(address: string): string {
      return truncateAddress(address);
    },

    /**
     * Stop the store and cleanup
     */
    stop(): void {
      if (unsubscribeWinEvents) {
        unsubscribeWinEvents();
        unsubscribeWinEvents = null;
      }

      update((state) => ({
        ...state,
        isConnected: false,
      }));
    },

    /**
     * Cleanup and destroy
     */
    destroy(): void {
      this.stop();
      recentWinsService.destroy();
      set(initialState);
      initializationPromise = null;
    },
  };

  return store;
}

// Create the store instance
export const recentWinsStore = createRecentWinsStore();

// Derived stores for easy access
export const recentWins = derived(recentWinsStore, ($store) => $store.wins);
export const recentWinsLoading = derived(recentWinsStore, ($store) => $store.isLoading);
export const recentWinsConnected = derived(recentWinsStore, ($store) => $store.isConnected);
export const recentWinsError = derived(recentWinsStore, ($store) => $store.error);

