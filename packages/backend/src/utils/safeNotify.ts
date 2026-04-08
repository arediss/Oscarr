import { notificationRegistry } from '../notifications/index.js';
import { sendUserNotification as _sendUserNotification } from '../services/userNotifications.js';
import { prisma } from './prisma.js';

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

/** Fire-and-forget user notification — logs errors without crashing */
export function safeUserNotify(userId: number, payload: Parameters<typeof _sendUserNotification>[1]): void {
  _sendUserNotification(userId, payload).catch(err => console.error('[UserNotification] Failed:', err));
}
