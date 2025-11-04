/**
 * Notification Store
 * Svelte 5 runes-based notification system with support for multiple simultaneous notifications
 */

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
	id: string;
	type: NotificationType;
	message: string;
	duration: number;
	createdAt: number;
	paused: boolean;
	timeoutId?: ReturnType<typeof setTimeout>;
}

const DEFAULT_DURATION = 5000; // 5 seconds
const ERROR_DURATION = 10000; // 10 seconds for errors
const MAX_NOTIFICATIONS = 5;

class NotificationStore {
	notifications = $state<Notification[]>([]);
	private pausedNotifications = new Map<string, number>(); // Track remaining time for paused notifications

	private generateId(): string {
		return `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	private scheduleRemoval(id: string, duration: number): ReturnType<typeof setTimeout> {
		return setTimeout(() => {
			this.remove(id);
		}, duration);
	}

	notify(type: NotificationType, message: string, duration?: number): string {
		const id = this.generateId();

		// Determine duration: use provided duration, or default based on type
		const finalDuration = duration ?? (type === 'error' ? ERROR_DURATION : DEFAULT_DURATION);

		const notification: Notification = {
			id,
			type,
			message,
			duration: finalDuration,
			createdAt: Date.now(),
			paused: false,
			timeoutId: this.scheduleRemoval(id, finalDuration)
		};

		// Add to notifications array
		this.notifications.push(notification);

		// Remove oldest if we exceed max
		if (this.notifications.length > MAX_NOTIFICATIONS) {
			const oldest = this.notifications[0];
			this.remove(oldest.id);
		}

		return id;
	}

	success(message: string, duration?: number): string {
		return this.notify('success', message, duration);
	}

	error(message: string, duration?: number): string {
		return this.notify('error', message, duration);
	}

	warning(message: string, duration?: number): string {
		return this.notify('warning', message, duration);
	}

	info(message: string, duration?: number): string {
		return this.notify('info', message, duration);
	}

	pause(id: string): void {
		const notification = this.notifications.find(n => n.id === id);
		if (!notification || notification.paused) return;

		// Calculate remaining time
		const elapsed = Date.now() - notification.createdAt;
		const remaining = Math.max(0, notification.duration - elapsed);

		// Store remaining time
		this.pausedNotifications.set(id, remaining);

		// Clear existing timeout
		if (notification.timeoutId) {
			clearTimeout(notification.timeoutId);
		}

		// Update state
		notification.paused = true;
		this.notifications = [...this.notifications];
	}

	resume(id: string): void {
		const notification = this.notifications.find(n => n.id === id);
		if (!notification || !notification.paused) return;

		// Get remaining time
		const remaining = this.pausedNotifications.get(id) ?? 0;
		this.pausedNotifications.delete(id);

		// Reset created time to current time (so we can track elapsed time correctly on next pause)
		notification.createdAt = Date.now();
		notification.duration = remaining;

		// Schedule new removal with remaining time
		notification.timeoutId = this.scheduleRemoval(id, remaining);
		notification.paused = false;

		this.notifications = [...this.notifications];
	}

	remove(id: string): void {
		const notification = this.notifications.find(n => n.id === id);
		if (notification?.timeoutId) {
			clearTimeout(notification.timeoutId);
		}

		this.pausedNotifications.delete(id);
		this.notifications = this.notifications.filter(n => n.id !== id);
	}

	clear(): void {
		// Clear all timeouts
		this.notifications.forEach(n => {
			if (n.timeoutId) {
				clearTimeout(n.timeoutId);
			}
		});

		this.pausedNotifications.clear();
		this.notifications = [];
	}
}

// Export singleton instance
export const notificationStore = new NotificationStore();
