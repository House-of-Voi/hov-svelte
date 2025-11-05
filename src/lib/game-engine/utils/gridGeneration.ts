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
	const reelTops = await getReelTopsFromSeed(seed, reelLength, windowLength);

	// Verify reel data length
	if (reelData.length !== reelLength * 5) {
		throw new Error(`Invalid reel data length: expected ${reelLength * 5} (${reelLength} per reel × 5 reels), got ${reelData.length}`);
	}

	// Generate grid from reel tops
	const grid: SymbolId[][] = [];
	for (let reelIndex = 0; reelIndex < 5; reelIndex++) {
		const reelWindow = getReelWindow(reelData, reelIndex, reelTops[reelIndex], reelLength, windowLength);
		if (reelWindow.length !== windowLength) {
			throw new Error(`Invalid reel window length for reel ${reelIndex}: expected ${windowLength}, got ${reelWindow.length}`);
		}
		grid[reelIndex] = reelWindow.split('') as SymbolId[];
	}

	return grid;
}

/**
 * Get reel top positions from seed
 * Matches contract algorithm: hash(seed + reelNumber), take last 8 bytes, convert to BigUint64BE, mod maxReelStop
 */
async function getReelTopsFromSeed(seed: Uint8Array, reelLength: number, windowLength: number = 3): Promise<number[]> {
	const reelTops: number[] = [];
	const maxReelStop = reelLength - (windowLength + 1);

	// For each reel (1-5), hash the seed with the reel number
	for (let reelIndex = 1; reelIndex <= 5; reelIndex++) {
		// Create reel number byte (0x31 = "1", 0x32 = "2", etc.)
		const reelIdByte = new Uint8Array([0x30 + reelIndex]);
		
		// Combine seed + reel number byte (seed first, then reel ID byte)
		const combined = new Uint8Array(seed.length + 1);
		combined.set(seed);
		combined.set(reelIdByte, seed.length);
		
		// Hash to get reel-specific seed
		const hashedSeed = await crypto.subtle.digest('SHA-256', combined);
		const reelSeedBytes = new Uint8Array(hashedSeed);
		
		// Get last 8 bytes and convert to BigUint64 (big endian, as per contract)
		// Match working implementation exactly: DataView with buffer offset
		const seedValue = new DataView(reelSeedBytes.buffer, reelSeedBytes.length - 8).getBigUint64(0, false);
		
		// Calculate position using modulo
		const position = Number(seedValue % BigInt(maxReelStop));
		reelTops.push(position);
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

	// Verify we got the correct slice
	if (reelDataForThisReel.length !== reelLength) {
		throw new Error(`Invalid reel data slice for reel ${reelIndex}: expected ${reelLength} chars, got ${reelDataForThisReel.length}. Reel data total length: ${reelData.length}, start: ${reelStartInFullData}`);
	}

	// Build window with wrap-around (matches contract: pos1 = index+0, pos2 = index+1, pos3 = index+2)
	let window = '';
	for (let i = 0; i < windowLength; i++) {
		const pos = (position + i) % reelLength;
		const char = reelDataForThisReel[pos];
		window += char;
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
	// Combine block seed and bet key (blockSeed first, then betKey - matches working implementation)
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
