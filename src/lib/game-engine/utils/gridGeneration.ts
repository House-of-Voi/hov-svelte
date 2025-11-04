/**
 * Grid Generation Utility
 *
 * Deterministically generates slot machine grids from blockchain data.
 * Ported from the original Algorand service implementation.
 */

import type { SymbolId } from '../types';

/**
 * Generate a deterministic grid from a seed and reel data
 */
export async function generateGridFromSeed(
	seed: Uint8Array,
	reelData: string,
	reelLength: number = 100,
	windowLength: number = 3
): Promise<SymbolId[][]> {
	// Get reel tops from seed (5 positions, one per reel)
	const reelTops = getReelTopsFromSeed(seed, reelLength);

	// Generate grid from reel tops
	const grid: SymbolId[][] = [];
	for (let reelIndex = 0; reelIndex < 5; reelIndex++) {
		const reelWindow = getReelWindow(reelData, reelIndex, reelTops[reelIndex], reelLength, windowLength);
		grid[reelIndex] = reelWindow.split('') as SymbolId[];
	}

	return grid;
}

/**
 * Get reel top positions from seed
 * Maps 32-byte seed to 5 reel positions
 */
function getReelTopsFromSeed(seed: Uint8Array, reelLength: number): number[] {
	const reelTops: number[] = [];

	for (let i = 0; i < 5; i++) {
		// Use 4 bytes per reel top (bytes 0-3, 4-7, 8-11, 12-15, 16-19)
		const offset = i * 4;
		const value =
			(seed[offset] << 24) | (seed[offset + 1] << 16) | (seed[offset + 2] << 8) | seed[offset + 3];

		// Map to reel position using modulo
		reelTops[i] = value % reelLength;
	}

	return reelTops;
}

/**
 * Get a window of symbols from a specific reel at given position
 */
function getReelWindow(
	reelData: string,
	reelIndex: number,
	position: number,
	reelLength: number,
	windowLength: number
): string {
	// Get the reel data for this specific reel
	const reelStartInFullData = reelIndex * reelLength;
	const reelDataForThisReel = reelData.slice(
		reelStartInFullData,
		reelStartInFullData + reelLength
	);

	// Build window with wrap-around
	let window = '';
	for (let i = 0; i < windowLength; i++) {
		const pos = (position + i) % reelLength;
		window += reelDataForThisReel[pos];
	}

	return window;
}

/**
 * Generate grid deterministically from bet key and block seed
 */
export async function generateGridFromBetKey(
	betKey: Uint8Array,
	blockSeed: Uint8Array,
	reelData: string,
	reelLength: number = 100,
	windowLength: number = 3
): Promise<SymbolId[][]> {
	// Combine block seed and bet key
	const combined = new Uint8Array(blockSeed.length + betKey.length);
	combined.set(blockSeed);
	combined.set(betKey, blockSeed.length);

	// Hash the combined data
	const hashedBytes = await crypto.subtle.digest('SHA-256', combined);
	const seed = new Uint8Array(hashedBytes);

	// Generate grid from seed
	return generateGridFromSeed(seed, reelData, reelLength, windowLength);
}

/**
 * Convert grid from 2D array to flat string (column-major order)
 */
export function gridToString(grid: SymbolId[][]): string {
	let result = '';
	for (let col = 0; col < 5; col++) {
		for (let row = 0; row < 3; row++) {
			result += grid[col][row];
		}
	}
	return result;
}

/**
 * Convert flat string to 2D grid array (column-major order)
 */
export function stringToGrid(gridString: string): SymbolId[][] {
	if (gridString.length !== 15) {
		throw new Error(`Invalid grid string length: expected 15, got ${gridString.length}`);
	}

	const grid: SymbolId[][] = [];
	for (let col = 0; col < 5; col++) {
		grid[col] = [];
		for (let row = 0; row < 3; row++) {
			const index = col * 3 + row;
			grid[col][row] = gridString[index] as SymbolId;
		}
	}

	return grid;
}
