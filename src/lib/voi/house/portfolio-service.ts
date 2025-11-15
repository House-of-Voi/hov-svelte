/**
 * Portfolio Service
 * Aggregates house positions across all user addresses and contracts
 */

import { ybtService } from './ybt-service';
import type { HousePortfolio, HousePositionWithMetadata } from '$lib/types/house';
import type { SlotMachineConfig } from '$lib/types/database';

class PortfolioService {
	/**
	 * Get aggregated portfolio for user across all addresses and contracts
	 */
	async getPortfolio(
		addresses: string[],
		contracts: SlotMachineConfig[]
	): Promise<HousePortfolio> {
		const positions: HousePositionWithMetadata[] = [];
		let totalValue = 0n;
		let totalShares = 0n;
		let formattedTotalShares = 0;

		console.log('Getting portfolio for addresses:', addresses);
		console.log('Checking contracts:', contracts.map(c => ({
			id: c.contract_id,
			name: c.name,
			ybtAppId: c.ybt_app_id
		})));

		// Query each contract for each address
		for (const contract of contracts) {
			if (!contract.ybt_app_id) {
				console.log('Skipping contract', contract.contract_id, '- no YBT app ID configured');
				continue;
			}

			for (const address of addresses) {
				try {
					// Get user shares
					const shares = await ybtService.getUserShares(contract.ybt_app_id, address);
					console.log('shares', shares);

					if (shares === 0n) {
						console.log('No shares for', address, 'in contract', contract.contract_id);
						continue; // Skip if no position
					}

					// Get treasury balance to calculate value
					const treasuryBalance = await ybtService.getTreasuryBalance(
						contract.contract_id,
						contract.ybt_app_id
					);

					// Calculate VOI value of shares using helper method
					const voiValue = ybtService.calculateUserPortfolioValue(
						shares,
						treasuryBalance.totalSupply,
						treasuryBalance.balanceTotal
					);

					// Calculate share percentage using helper method
					const sharePercentage = ybtService.calculateSharePercentage(
						shares,
						treasuryBalance.totalSupply
					);

					// Format shares using decimals
					const formattedShares = ybtService.formatShares(shares, treasuryBalance.decimals);

					console.log('Found position:', {
						address,
						contractId: contract.contract_id,
						shares: shares.toString(),
						formattedShares,
						voiValue: voiValue.toString(),
						sharePercentage,
						decimals: treasuryBalance.decimals
					});

					positions.push({
						contractId: contract.contract_id,
						ybtAppId: contract.ybt_app_id,
						address,
						shares,
						formattedShares,
						voiValue,
						sharePercentage,
						lastUpdated: new Date(),
						contract
					});

					totalValue += voiValue;
					totalShares += shares;
					formattedTotalShares += formattedShares;
				} catch (error) {
					console.error(
						`Error getting position for ${address} in contract ${contract.contract_id}:`,
						error
					);
					// Continue with other positions
				}
			}
		}

		console.log('Portfolio summary:', {
			totalValue: totalValue.toString(),
			totalShares: totalShares.toString(),
			formattedTotalShares,
			positionCount: positions.length
		});

		return {
			totalValue,
			totalShares,
			formattedTotalShares,
			positions,
			addresses
		};
	}

	/**
	 * Get position for a specific address and contract
	 */
	async getPosition(
		address: string,
		contract: SlotMachineConfig
	): Promise<HousePositionWithMetadata | null> {
		if (!contract.ybt_app_id) return null;

		try {
			const shares = await ybtService.getUserShares(contract.ybt_app_id, address);

			if (shares === 0n) return null;

			const treasuryBalance = await ybtService.getTreasuryBalance(
				contract.contract_id,
				contract.ybt_app_id
			);

			// Calculate VOI value of shares using helper method
			const voiValue = ybtService.calculateUserPortfolioValue(
				shares,
				treasuryBalance.totalSupply,
				treasuryBalance.balanceTotal
			);

			// Calculate share percentage using helper method
			const sharePercentage = ybtService.calculateSharePercentage(
				shares,
				treasuryBalance.totalSupply
			);

			// Format shares using decimals
			const formattedShares = ybtService.formatShares(shares, treasuryBalance.decimals);

			return {
				contractId: contract.contract_id,
				ybtAppId: contract.ybt_app_id,
				address,
				shares,
				formattedShares,
				voiValue,
				sharePercentage,
				lastUpdated: new Date(),
				contract
			};
		} catch (error) {
			console.error(`Error getting position for ${address}:`, error);
			return null;
		}
	}
}

export const portfolioService = new PortfolioService();
