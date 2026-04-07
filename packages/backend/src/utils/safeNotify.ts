import { notificationRegistry } from '../notifications/index.js';
import { sendUserNotification as _sendUserNotification } from '../services/userNotifications.js';

/** Fire-and-forget notification — logs errors without crashing */
export function safeNotify(type: string, data: Parameters<typeof notificationRegistry.send>[1]): void {
  notificationRegistry.send(type, data).catch(err => console.error('[Notification] Failed:', err));
}

/** Fire-and-forget user notification — logs errors without crashing */
export function safeUserNotify(userId: number, payload: Parameters<typeof _sendUserNotification>[1]): void {
  _sendUserNotification(userId, payload).catch(err => console.error('[UserNotification] Failed:', err));
}
