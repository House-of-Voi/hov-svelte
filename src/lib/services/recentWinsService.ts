/**
 * Recent Wins Service
 * Manages real-time subscriptions to hov_events for recent wins display
 */

import { mimirBrowser } from '$lib/mimir/browserClient';
import { browser } from '$app/environment';

export interface RecentWinEvent {
  round: bigint;
  intra: number;
  txid: string;
  app_id: bigint;
  who: string;
  amount: bigint;
  max_payline_index: bigint;
  payout: bigint;
  total_bet_amount: bigint;
  net_result: bigint;
  created_at: Date;
}

export interface RecentWinsConfig {
  maxWins: number; // Maximum number of wins to keep in memory
  contractIds?: number[]; // Optional filter by contract IDs
}

const DEFAULT_CONFIG: RecentWinsConfig = {
  maxWins: 20,
};

class RecentWinsService {
  private subscription: (() => void) | null = null;
  private isInitialized = false;
  private config = DEFAULT_CONFIG;
  private eventHandlers: Array<(event: RecentWinEvent) => void> = [];

  /**
   * Initialize the service and set up subscription
   */
  async initialize(config?: Partial<RecentWinsConfig>): Promise<void> {
    if (!browser) return;
    if (this.isInitialized) return;

    try {
      this.config = { ...DEFAULT_CONFIG, ...config };

      // Set up realtime subscription
      this.setupRealtimeSubscription();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize Recent Wins Service:', error);
      throw error;
    }
  }

  /**
   * Setup realtime subscription to hov_events
   */
  private setupRealtimeSubscription(): void {
    try {
      // Only subscribe to UPDATE events (BetClaimed sets payout)
      // BetPlaced events are INSERTs with payout=NULL, BetClaimed events are UPDATEs with payout>0
      const channelName = `recent_wins_changes_${Date.now()}`;
      
      const channel = mimirBrowser
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE', // Only listen for UPDATE events (when payout is set)
            schema: 'public',
            table: 'hov_events',
            // Filter by contract IDs if specified
            // For multiple IDs, we subscribe without filter and filter in code
            // Or create separate subscriptions per contract ID
            filter: undefined, // We'll filter in the handler for multiple contract IDs
          },
          (payload) => {
            // Only process UPDATE events where payout is set (BetClaimed) and > 0
            if (
              payload.eventType === 'UPDATE' &&
              payload.new &&
              payload.new.payout > 0
            ) {
              // Filter by contract IDs if specified
              if (this.config.contractIds && this.config.contractIds.length > 0) {
                const appId = Number(payload.new.app_id);
                if (!this.config.contractIds.includes(appId)) {
                  return; // Skip if not in our contract IDs list
                }
              }
              
              this.handleWinEvent(payload.new);
            }
          }
        );

      // Subscribe to the channel
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Recent wins subscription established');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Recent wins subscription error');
        } else if (status === 'TIMED_OUT') {
          console.warn('⏱️ Recent wins subscription timed out');
        } else if (status === 'CLOSED') {
          console.log('🔌 Recent wins subscription closed');
        }
      });

      this.subscription = () => {
        try {
          channel.unsubscribe();
          mimirBrowser.removeChannel(channel);
          console.log('🔌 Recent wins subscription cleaned up');
        } catch (error) {
          console.error('Error removing channel:', error);
        }
      };
    } catch (error) {
      console.error('Failed to setup realtime subscription:', error);
      throw error;
    }
  }

  /**
   * Handle incoming win events
   */
  private handleWinEvent(eventData: any): void {
    try {
      const winEvent: RecentWinEvent = {
        round: BigInt(eventData.round || 0),
        intra: eventData.intra || 0,
        txid: eventData.txid || '',
        app_id: BigInt(eventData.app_id || 0),
        who: eventData.who || '',
        amount: BigInt(eventData.amount || 0),
        max_payline_index: BigInt(eventData.max_payline_index || 0),
        payout: BigInt(eventData.payout || 0),
        total_bet_amount: BigInt(eventData.total_bet_amount || eventData.amount * (Number(eventData.max_payline_index || 0) + 1)),
        net_result: BigInt(eventData.net_result || (Number(eventData.payout || 0) - Number(eventData.amount || 0) * (Number(eventData.max_payline_index || 0) + 1))),
        created_at: new Date(eventData.created_at || eventData.updated_at || Date.now()),
      };

      // Notify all handlers
      this.eventHandlers.forEach((handler) => {
        try {
          handler(winEvent);
        } catch (error) {
          console.error('Error in win event handler:', error);
        }
      });
    } catch (error) {
      console.error('Error handling win event:', error);
    }
  }

  /**
   * Add event handler
   */
  onWinEvent(handler: (event: RecentWinEvent) => void): () => void {
    this.eventHandlers.push(handler);

    // Return cleanup function
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Fetch initial recent wins from Mimir database
   */
  async fetchInitialWins(limit = 20, contractIds?: number[]): Promise<RecentWinEvent[]> {
    try {
      let query = mimirBrowser
        .from('hov_events')
        .select('*')
        .gt('payout', 0)
        .order('created_at', { ascending: false })
        .limit(limit);

      // Filter by contract IDs if provided
      if (contractIds && contractIds.length > 0) {
        query = query.in('app_id', contractIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching initial wins:', error);
        return [];
      }

      if (!data) {
        return [];
      }

      // Transform the data to RecentWinEvent format
      return data.map((row: any) => ({
        round: BigInt(row.round || 0),
        intra: row.intra || 0,
        txid: row.txid || '',
        app_id: BigInt(row.app_id || 0),
        who: row.who || '',
        amount: BigInt(row.amount || 0),
        max_payline_index: BigInt(row.max_payline_index || 0),
        payout: BigInt(row.payout || 0),
        total_bet_amount: BigInt(row.total_bet_amount || row.amount * (Number(row.max_payline_index || 0) + 1)),
        net_result: BigInt(row.net_result || (Number(row.payout || 0) - Number(row.amount || 0) * (Number(row.max_payline_index || 0) + 1))),
        created_at: new Date(row.created_at || Date.now()),
      }));
    } catch (error) {
      console.error('Error fetching initial wins:', error);
      return [];
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RecentWinsConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Cleanup and destroy service
   */
  destroy(): void {
    if (this.subscription) {
      this.subscription();
      this.subscription = null;
    }

    this.eventHandlers = [];
    this.isInitialized = false;
  }

  /**
   * Check if service is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const recentWinsService = new RecentWinsService();

