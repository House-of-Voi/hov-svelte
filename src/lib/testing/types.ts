/**
 * Testing Suite Types
 *
 * Type definitions specific to the postMessage testing interface
 */

import type { GameRequest, GameResponse } from '$lib/game-engine/bridge/types';
import type { GameType } from './messageTemplates';

// ============================================================================
// MESSAGE LOG
// ============================================================================

export type MessageDirection = 'sent' | 'received';

export interface LoggedMessage {
	id: string;
	timestamp: number;
	direction: MessageDirection;
	message: GameRequest | GameResponse;
	messageType: string;
}

// ============================================================================
// MESSAGE SENDER
// ============================================================================

export type SenderMode = 'form' | 'json';

export interface FormField {
	name: string;
	label: string;
	type: 'text' | 'number' | 'select' | 'checkbox' | 'textarea';
	placeholder?: string;
	options?: { value: string | number; label: string }[];
	defaultValue?: string | number | boolean;
	required?: boolean;
	min?: number;
	max?: number;
	help?: string;
}

// ============================================================================
// OVERLAY STATE
// ============================================================================

export interface OverlayPosition {
	x: number;
	y: number;
}

export interface OverlaySize {
	width: number;
	height: number;
}

export interface OverlayState {
	position: OverlayPosition;
	size: OverlaySize;
	isCollapsed: boolean;
	activeTab: 'sender' | 'log' | 'live' | 'stats';
}

// ============================================================================
// STATISTICS
// ============================================================================

export interface MessageStats {
	totalSent: number;
	totalReceived: number;
	byType: Record<string, { sent: number; received: number }>;
	errors: number;
}

// ============================================================================
// GAME PRESET
// ============================================================================

export interface GamePreset {
	id: string;
	name: string;
	url: string;
	gameType: GameType;
	description?: string;
}
