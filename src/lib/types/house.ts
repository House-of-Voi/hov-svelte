/**
 * Types for House Treasury / YBT (Yield Bearing Token) functionality
 */

import type { Machine } from './database';

/**
 * User's position in a specific house pool (YBT contract)
 */
export interface HousePosition {
  contractId: number; // Game contract ID (renamed from slot machine)
  ybtAppId: number; // Treasury contract app ID (YBT)
  address: string; // Voi address holding the position
  shares: bigint; // YBT shares held (raw value with decimals)
  formattedShares: number; // Human-readable shares (divided by 10^decimals)
  voiValue: bigint; // Current VOI value of shares (microVOI)
  sharePercentage: number; // Percentage of total YBT supply
  lastUpdated: Date;
}

/**
 * Aggregate portfolio across all user addresses and contracts
 */
export interface HousePortfolio {
  totalValue: bigint; // Total value in microVOI
  totalShares: bigint; // Total YBT shares across all contracts (raw value)
  formattedTotalShares: number; // Human-readable total shares (sum of formatted shares)
  positions: HousePositionWithMetadata[];
  addresses: string[]; // All addresses included in portfolio
}

/**
 * House position with additional contract/machine metadata
 */
export interface HousePositionWithMetadata extends HousePosition {
  contract: Machine; // Renamed internally but kept as 'contract' for compatibility
  profitLoss?: ProfitLoss;
}

/**
 * Profit/Loss calculation for a position
 */
export interface ProfitLoss {
  amount: bigint; // P/L in microVOI
  percentage: number; // P/L as percentage
  isProfit: boolean;
  totalDeposited: bigint; // Total VOI deposited
  totalWithdrawn: bigint; // Total VOI withdrawn
  currentValue: bigint; // Current position value
}

/**
 * Transaction event from blockchain (deposit or withdrawal)
 */
export interface YBTTransaction {
  txHash: string;
  type: 'deposit' | 'withdraw';
  address: string;
  contractId: number;
  ybtAppId: number;
  voiAmount: bigint; // VOI amount (microVOI)
  sharesAmount: bigint; // YBT shares amount
  timestamp: Date;
  blockNumber: number;
  round: number;
}

/**
 * Contract treasury balance information
 * Supports both native VOI and ARC200 token treasuries
 */
export interface TreasuryBalance {
  contractId: number;
  ybtAppId: number;
  balanceTotal: bigint; // Total contract balance (in token atomic units)
  balanceAvailable: bigint; // Available for payouts
  balanceLocked: bigint; // Locked in active bets
  totalSupply: bigint; // Total YBT shares in circulation
  decimals: number; // YBT token decimals (typically 9)
  sharePrice: bigint; // Token per YBT share (with decimals)
  lastUpdated: Date;
  // Token information (null/undefined for native VOI)
  tokenContractId?: number | null; // ARC200 token contract ID
  tokenSymbol?: string; // Token symbol (e.g., "WAD", "VOI")
  tokenDecimals?: number; // Token decimals (for balance display)
}

/**
 * Wallet source for deposits/withdrawals
 */
export type WalletSource = 'cdp' | 'external';

/**
 * Wallet information for external wallets
 */
export interface ExternalWallet {
  address: string;
  provider: 'kibisis' | 'lute' | 'pera' | 'walletconnect';
  isConnected: boolean;
  isLinked: boolean; // Linked to user profile
}

/**
 * Deposit request parameters
 */
export interface DepositParams {
  contractId: number;
  ybtAppId: number;
  amount: bigint; // VOI amount in microVOI
  walletSource: WalletSource;
  address: string;
}

/**
 * Withdraw request parameters
 */
export interface WithdrawParams {
  contractId: number;
  ybtAppId: number;
  shares: bigint; // YBT shares to withdraw
  walletSource: WalletSource;
  address: string;
}

/**
 * Transaction result
 */
export interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  amount?: bigint;
  shares?: bigint;
}

/**
 * Contract statistics for display
 */
export interface ContractStats {
  contractId: number;
  name: string;
  displayName: string;
  treasuryBalance: TreasuryBalance;
  userPosition?: HousePosition;
  isActive: boolean;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
}
