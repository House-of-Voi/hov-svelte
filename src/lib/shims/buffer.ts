/**
 * Buffer polyfill shim for browser compatibility
 * Makes Buffer available globally for algokit and other dependencies
 */
import { Buffer } from 'buffer';

// Make Buffer available globally for both browser and Node.js
if (typeof globalThis !== 'undefined') {
	(globalThis as any).Buffer = Buffer;
}
if (typeof global !== 'undefined') {
	(global as any).Buffer = Buffer;
}
if (typeof window !== 'undefined') {
	(window as any).Buffer = Buffer;
}

export { Buffer };

