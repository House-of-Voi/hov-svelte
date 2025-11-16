/**
 * Tests for W2W Payout Calculator
 *
 * Test cases to verify that client-side payout calculations match the contract logic.
 */

import { describe, it, expect } from 'vitest';
import type { SymbolId } from '../../types';
import {
  calculateW2WPayouts,
  calculateSymbolPayout,
  getConsecutiveReelCount,
  calculateWaysForSymbol,
  getHighestWildMultiplier,
  isJackpotTriggered,
  isBonusTriggered,
  calculateCompletePayout,
  W2W_PAYTABLE
} from '../w2wPayoutCalculator';

describe('W2W Payout Calculator', () => {
  describe('Basic symbol matching', () => {
    it('should calculate a simple 3-match', () => {
      // Buffalo (0) on first 3 reels, middle row
      const grid: SymbolId[][] = [
        ['A', '0', 'A'], // Reel 1: Buffalo in middle
        ['A', '0', 'A'], // Reel 2: Buffalo in middle
        ['A', '0', 'A'], // Reel 3: Buffalo in middle
        ['A', 'A', 'A'], // Reel 4: No buffalo
        ['A', 'A', 'A']  // Reel 5: No buffalo
      ];

      const result = calculateSymbolPayout(grid, '0');

      expect(result).not.toBeNull();
      expect(result?.symbol).toBe('0');
      expect(result?.matchLength).toBe(3);
      expect(result?.ways).toBe(1); // 1 × 1 × 1
      expect(result?.wildMultiplier).toBe(1);
      expect(result?.payout).toBe(68); // Base payout for Buffalo 3-match
    });

    it('should calculate a 5-match with multiple ways', () => {
      // Eagle (1) on all 5 reels, 2 per reel
      const grid: SymbolId[][] = [
        ['1', '1', 'A'], // Reel 1: 2 Eagles
        ['1', '1', 'A'], // Reel 2: 2 Eagles
        ['1', '1', 'A'], // Reel 3: 2 Eagles
        ['1', '1', 'A'], // Reel 4: 2 Eagles
        ['1', '1', 'A']  // Reel 5: 2 Eagles
      ];

      const result = calculateSymbolPayout(grid, '1');

      expect(result).not.toBeNull();
      expect(result?.symbol).toBe('1');
      expect(result?.matchLength).toBe(5);
      expect(result?.ways).toBe(32); // 2 × 2 × 2 × 2 × 2 = 32
      expect(result?.wildMultiplier).toBe(1);
      expect(result?.payout).toBe(16000); // 500 × 32 × 1
    });

    it('should not pay for symbols not on first reel', () => {
      // Buffalo only on reels 2-4
      const grid: SymbolId[][] = [
        ['A', 'A', 'A'], // Reel 1: No buffalo
        ['0', '0', '0'], // Reel 2: All buffalo
        ['0', '0', '0'], // Reel 3: All buffalo
        ['0', '0', '0'], // Reel 4: All buffalo
        ['A', 'A', 'A']  // Reel 5: No buffalo
      ];

      const result = calculateSymbolPayout(grid, '0');
      expect(result).toBeNull();
    });

    it('should stop at first non-matching reel', () => {
      // Buffalo on reels 1-2, then gap, then 4-5
      const grid: SymbolId[][] = [
        ['0', '0', '0'], // Reel 1: All buffalo
        ['0', '0', '0'], // Reel 2: All buffalo
        ['A', 'A', 'A'], // Reel 3: No buffalo (STOP HERE)
        ['0', '0', '0'], // Reel 4: All buffalo (doesn't count)
        ['0', '0', '0']  // Reel 5: All buffalo (doesn't count)
      ];

      const result = calculateSymbolPayout(grid, '0');

      expect(result).not.toBeNull();
      expect(result?.matchLength).toBe(2);
      expect(result?.payout).toBe(0); // No payout for 2-match
    });
  });

  describe('Wild symbol behavior', () => {
    it('should substitute wilds for matching symbols', () => {
      // Buffalo (0) with Wild1 (B) substitution
      const grid: SymbolId[][] = [
        ['0', '0', 'A'], // Reel 1: 2 Buffalo
        ['B', 'B', 'A'], // Reel 2: 2 Wild1 (substitute for Buffalo)
        ['0', 'B', 'A'], // Reel 3: 1 Buffalo + 1 Wild
        ['A', 'A', 'A'], // Reel 4: No match
        ['A', 'A', 'A']  // Reel 5: No match
      ];

      const result = calculateSymbolPayout(grid, '0');

      expect(result).not.toBeNull();
      expect(result?.matchLength).toBe(3);
      expect(result?.ways).toBe(8); // 2 × 2 × 2
      expect(result?.wildMultiplier).toBe(1); // Wild1 = 1x
      expect(result?.payout).toBe(544); // 68 × 8 × 1
    });

    it('should use highest wild multiplier (Wild2)', () => {
      // Cougar (2) with Wild2 (C) on reel 2
      const grid: SymbolId[][] = [
        ['2', '2', '2'], // Reel 1: 3 Cougar
        ['C', 'C', 'A'], // Reel 2: 2 Wild2 (2x multiplier)
        ['2', '2', '2'], // Reel 3: 3 Cougar
        ['A', 'A', 'A'], // Reel 4: No match
        ['A', 'A', 'A']  // Reel 5: No match
      ];

      const result = calculateSymbolPayout(grid, '2');

      expect(result).not.toBeNull();
      expect(result?.matchLength).toBe(3);
      expect(result?.ways).toBe(18); // 3 × 2 × 3
      expect(result?.wildMultiplier).toBe(2); // Wild2 = 2x
      expect(result?.payout).toBe(1440); // 40 × 18 × 2
    });

    it('should use highest wild multiplier (Wild3)', () => {
      // Elk (3) with Wild3 (D) on reel 3
      const grid: SymbolId[][] = [
        ['3', '3', '3'], // Reel 1: 3 Elk
        ['B', 'B', 'B'], // Reel 2: 3 Wild1 (1x)
        ['D', 'C', 'B'], // Reel 3: Wild3, Wild2, Wild1 (3x wins)
        ['3', '3', '3'], // Reel 4: 3 Elk
        ['3', '3', '3']  // Reel 5: 3 Elk
      ];

      const result = calculateSymbolPayout(grid, '3');

      expect(result).not.toBeNull();
      expect(result?.matchLength).toBe(5);
      expect(result?.ways).toBe(243); // 3 × 3 × 3 × 3 × 3
      expect(result?.wildMultiplier).toBe(3); // Wild3 = 3x
      expect(result?.payout).toBe(189540); // 260 × 243 × 3
    });
  });

  describe('Multiple symbol wins on same grid', () => {
    it('should calculate all winning symbols independently', () => {
      // Grid with multiple winning symbols
      const grid: SymbolId[][] = [
        ['0', '1', '2'], // Reel 1: Buffalo, Eagle, Cougar
        ['0', '1', '2'], // Reel 2: Buffalo, Eagle, Cougar
        ['0', '1', '2'], // Reel 3: Buffalo, Eagle, Cougar
        ['A', 'A', 'A'], // Reel 4: No matches
        ['A', 'A', 'A']  // Reel 5: No matches
      ];

      const results = calculateW2WPayouts(grid);

      // Should find 3 wins: Buffalo, Eagle, Cougar
      expect(results.length).toBe(3);

      const buffalo = results.find(r => r.symbol === '0');
      const eagle = results.find(r => r.symbol === '1');
      const cougar = results.find(r => r.symbol === '2');

      expect(buffalo?.payout).toBe(68);  // 68 × 1 × 1
      expect(eagle?.payout).toBe(124);   // 124 × 1 × 1
      expect(cougar?.payout).toBe(40);   // 40 × 1 × 1
    });
  });

  describe('Scatter symbols (Jackpot and Bonus)', () => {
    it('should detect jackpot trigger (3+ HOV)', () => {
      const grid: SymbolId[][] = [
        ['E', 'A', 'A'], // Reel 1: 1 HOV
        ['A', 'E', 'A'], // Reel 2: 1 HOV
        ['A', 'A', 'E'], // Reel 3: 1 HOV
        ['A', 'A', 'A'], // Reel 4: 0 HOV
        ['A', 'A', 'A']  // Reel 5: 0 HOV
      ];

      expect(isJackpotTriggered(grid)).toBe(true);
    });

    it('should not trigger jackpot with less than 3 HOV', () => {
      const grid: SymbolId[][] = [
        ['E', 'A', 'A'], // Reel 1: 1 HOV
        ['A', 'E', 'A'], // Reel 2: 1 HOV
        ['A', 'A', 'A'], // Reel 3: 0 HOV
        ['A', 'A', 'A'], // Reel 4: 0 HOV
        ['A', 'A', 'A']  // Reel 5: 0 HOV
      ];

      expect(isJackpotTriggered(grid)).toBe(false);
    });

    it('should detect bonus trigger (2+ BONUS)', () => {
      const grid: SymbolId[][] = [
        ['F', 'A', 'A'], // Reel 1: 1 BONUS
        ['A', 'F', 'A'], // Reel 2: 1 BONUS
        ['A', 'A', 'A'], // Reel 3: 0 BONUS
        ['A', 'A', 'A'], // Reel 4: 0 BONUS
        ['A', 'A', 'A']  // Reel 5: 0 BONUS
      ];

      expect(isBonusTriggered(grid)).toBe(true);
    });
  });

  describe('Complete payout calculation', () => {
    it('should calculate complete payout with bonus multiplier', () => {
      const grid: SymbolId[][] = [
        ['0', '0', '0'], // Reel 1: 3 Buffalo
        ['0', '0', '0'], // Reel 2: 3 Buffalo
        ['0', '0', '0'], // Reel 3: 3 Buffalo
        ['A', 'A', 'A'], // Reel 4: No match
        ['A', 'A', 'A']  // Reel 5: No match
      ];

      // Without bonus
      const normalResult = calculateCompletePayout(grid, false, 0);
      expect(normalResult.linePayout).toBe(1836); // 68 × 27 × 1

      // With bonus (1.5x)
      const bonusResult = calculateCompletePayout(grid, true, 0);
      expect(bonusResult.linePayout).toBe(2754); // (1836 × 15000) / 10000 = 2754
    });

    it('should include jackpot in total payout', () => {
      const grid: SymbolId[][] = [
        ['E', '0', '0'], // Reel 1: HOV + 2 Buffalo
        ['E', '0', '0'], // Reel 2: HOV + 2 Buffalo
        ['E', '0', '0'], // Reel 3: HOV + 2 Buffalo
        ['A', 'A', 'A'], // Reel 4: No match
        ['A', 'A', 'A']  // Reel 5: No match
      ];

      const jackpotValue = 50000;
      const result = calculateCompletePayout(grid, false, jackpotValue);

      expect(result.jackpotHit).toBe(1);
      expect(result.jackpotAmount).toBe(jackpotValue);
      expect(result.totalPayout).toBe(result.linePayout + jackpotValue);
    });
  });

  describe('Paytable verification', () => {
    it('should have correct paytable values', () => {
      // Verify some key paytable values from contract
      expect(W2W_PAYTABLE['0']).toEqual([68, 520, 900]); // Buffalo
      expect(W2W_PAYTABLE['1']).toEqual([124, 270, 500]); // Eagle
      expect(W2W_PAYTABLE['9']).toEqual([4, 16, 39]); // Ten
      expect(W2W_PAYTABLE['A']).toEqual([3, 14, 37]); // Nine
      expect(W2W_PAYTABLE['E']).toEqual([0, 0, 0]); // HOV (scatter)
      expect(W2W_PAYTABLE['F']).toEqual([0, 0, 0]); // Bonus (scatter)
    });
  });
});
