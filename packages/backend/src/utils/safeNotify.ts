import { notificationRegistry } from '../notifications/index.js';
import { sendUserNotification as _sendUserNotification } from '../services/userNotifications.js';
import { prisma } from './prisma.js';
import { pluginEventBus } from '../plugins/eventBus.js';
import { logEvent } from './logEvent.js';
import type { PluginUserNotificationCreatedV1 } from '@oscarr/shared';

let _siteUrl: string | null = null;
let _siteUrlFetched = false;

/** Get the configured site URL (cached) */
export async function getSiteUrl(): Promise<string | null> {
  if (_siteUrlFetched) return _siteUrl;
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { siteUrl: true } });
  _siteUrl = settings?.siteUrl || process.env.FRONTEND_URL || null;
  _siteUrlFetched = true;
  return _siteUrl;
}

/** Invalidate cached site URL (call after settings update) */
export function invalidateSiteUrl(): void { _siteUrlFetched = false; }

/** Build a full URL from a path (e.g. /movie/123) */
export async function buildSiteLink(path: string): Promise<string | undefined> {
  const base = await getSiteUrl();
  if (!base) return undefined;
  return `${base.replace(/\/$/, '')}${path}`;
}

/** Fire-and-forget notification — logs errors without crashing */
export function safeNotify(type: string, data: Parameters<typeof notificationRegistry.send>[1]): void {
  notificationRegistry.send(type, data).catch(err => console.error('[Notification] Failed:', err));
}

/** Fire-and-forget user notification — logs errors without crashing. Also fans out a
 *  `user.notification.created` event on the plugin bus so subscribers (Discord bots, Slack
 *  pushers, analytics) can react without having to poll the UserNotification table. The
 *  payload is the stable v1 envelope defined in `@oscarr/shared`. */
export function safeUserNotify(userId: number, payload: Parameters<typeof _sendUserNotification>[1]): void {
  _sendUserNotification(userId, payload).catch(err => console.error('[UserNotification] Failed:', err));
  const event: PluginUserNotificationCreatedV1 = {
    v: 1,
    userId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    metadata: payload.metadata ?? {},
    createdAt: new Date().toISOString(),
  };
  // Event bus emit is sync-returning but handler resolution is awaited inside emit; fire and
  // swallow so one misbehaving subscriber doesn't block the caller. Route failures to AppLog
  // (not console.error) — plugins are this code path's consumers, and admins need a
  // persisted breadcrumb when a subscriber throws.
  pluginEventBus.emit('user.notification.created', event).catch(err => {
    logEvent('error', 'PluginEvent', `Subscriber of 'user.notification.created' threw: ${String(err)}`);
  });
}
