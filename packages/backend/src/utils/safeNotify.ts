import { notificationRegistry } from '../notifications/index.js';
import { sendUserNotification as _sendUserNotification } from '../services/userNotifications.js';
import { prisma } from './prisma.js';
import { pluginEventBus } from '../plugins/eventBus.js';
import { logEvent } from './logEvent.js';
import type { PluginUserNotificationCreatedV1 } from '@oscarr/shared';

let _siteUrl: string | null = null;
let _siteUrlFetched = false;
let _instanceLang: string | null = null;
let _instanceLangFetched = false;

/** Get the configured site URL (cached) */
export async function getSiteUrl(): Promise<string | null> {
  if (_siteUrlFetched) return _siteUrl;
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { siteUrl: true } });
  _siteUrl = settings?.siteUrl || process.env.FRONTEND_URL || null;
  _siteUrlFetched = true;
  return _siteUrl;
}

/** Invalidate cached site URL + instance language (call after settings update) */
export function invalidateSiteUrl(): void {
  _siteUrlFetched = false;
  _instanceLangFetched = false;
}

/** Build a full URL from a path (e.g. /movie/123) */
export async function buildSiteLink(path: string): Promise<string | undefined> {
  const base = await getSiteUrl();
  if (!base) return undefined;
  return `${base.replace(/\/$/, '')}${path}`;
}

/** Resolve the first language in AppSettings.instanceLanguages, with the same caching
 *  posture as siteUrl. Plugins (Leonarr DM bot, Slack pushers, …) consume the translated
 *  text via the event bus — picking the language at emit time means we resolve once per
 *  outbound event instead of once per subscriber. */
async function getInstanceLanguage(): Promise<string> {
  if (_instanceLangFetched && _instanceLang) return _instanceLang;
  try {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { instanceLanguages: true } });
    const arr = settings?.instanceLanguages ? JSON.parse(settings.instanceLanguages) as unknown : null;
    _instanceLang = Array.isArray(arr) && typeof arr[0] === 'string' ? arr[0] : 'en';
  } catch {
    _instanceLang = 'en';
  }
  _instanceLangFetched = true;
  return _instanceLang;
}

// ─── Notification i18n ──────────────────────────────────────────────
//
// Mirror of the `notifications.msg.*` + `notifications.title.*` keys from the frontend
// translation bundles, vendored here so the backend can pre-translate the event-bus payload
// without depending on the frontend at runtime. Keep this in sync with
// packages/frontend/src/i18n/locales/<lang>/translation.json — five-ish keys, manual sync
// is fine, and a typo would only fall back to the raw key.
const NOTIF_I18N: Record<string, Record<string, string>> = {
  en: {
    'notifications.msg.request_auto_approved': 'Your request for "{{title}}" has been auto-approved.',
    'notifications.msg.request_approved':      'Your request for "{{title}}" has been approved.',
    'notifications.msg.request_declined':      'Your request for "{{title}}" has been declined.',
    'notifications.msg.media_available':       '"{{title}}" is now available.',
    'notifications.msg.support_reply':         'Reply on your ticket #{{ticketId}}',
  },
  fr: {
    'notifications.msg.request_auto_approved': 'Votre demande pour "{{title}}" a été approuvée automatiquement.',
    'notifications.msg.request_approved':      'Votre demande pour "{{title}}" a été approuvée.',
    'notifications.msg.request_declined':      'Votre demande pour "{{title}}" a été refusée.',
    'notifications.msg.media_available':       '"{{title}}" est maintenant disponible.',
    'notifications.msg.support_reply':         'Réponse sur votre ticket #{{ticketId}}',
  },
};

function translateNotif(value: string, lang: string, params: Record<string, unknown>): string {
  // Only translate strings that look like our canonical i18n keys; everything else is
  // already a literal title (e.g. a media title from the request flow) and should pass
  // through untouched.
  if (!value.startsWith('notifications.')) return value;
  const bundle = NOTIF_I18N[lang] ?? NOTIF_I18N.en;
  const fallback = NOTIF_I18N.en;
  const template = bundle[value] ?? fallback[value];
  if (!template) return value; // unknown key — keep as-is so a typo is visible
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (
    params[k] !== undefined ? String(params[k]) : `{{${k}}}`
  ));
}

/** Fire-and-forget notification — logs errors without crashing */
export function safeNotify(type: string, data: Parameters<typeof notificationRegistry.send>[1]): void {
  notificationRegistry.send(type, data).catch(err => console.error('[Notification] Failed:', err));
}

/** Fire-and-forget user notification — logs errors without crashing. Also fans out a
 *  `user.notification.created` event on the plugin bus so subscribers (Discord bots, Slack
 *  pushers, analytics) can react without having to poll the UserNotification table. The
 *  payload is the stable v1 envelope defined in `@oscarr/shared`.
 *
 *  Translation: the row stored in DB carries the raw i18n key (so the web frontend can
 *  re-translate on render with the user's current locale), but the *event* fires a
 *  pre-translated `titleText` / `messageText` resolved against the instance language —
 *  plugins typically don't have access to the i18n bundle and shouldn't re-implement
 *  lookup. Fall back to the raw value when the key isn't in the table. */
export function safeUserNotify(userId: number, payload: Parameters<typeof _sendUserNotification>[1]): void {
  _sendUserNotification(userId, payload).catch(err => console.error('[UserNotification] Failed:', err));

  // Resolve the language + interpolate keys before emitting. Async, but we're already in a
  // fire-and-forget surface — chaining `.then` keeps the caller signature unchanged.
  getInstanceLanguage().then((lang) => {
    const params = ((payload.metadata as { msgParams?: Record<string, unknown> } | undefined)?.msgParams) ?? {};
    const event: PluginUserNotificationCreatedV1 = {
      v: 1,
      userId,
      type: payload.type,
      title: payload.title,
      titleText: translateNotif(payload.title, lang, params),
      message: payload.message,
      messageText: translateNotif(payload.message, lang, params),
      metadata: payload.metadata ?? {},
      createdAt: new Date().toISOString(),
    };
    // Event bus emit is sync-returning but handler resolution is awaited inside emit; fire and
    // swallow so one misbehaving subscriber doesn't block the caller. Route failures to AppLog
    // (not console.error) — plugins are this code path's consumers, and admins need a
    // persisted breadcrumb when a subscriber throws.
    return pluginEventBus.emit('user.notification.created', event);
  }).catch(err => {
    logEvent('error', 'PluginEvent', `Subscriber of 'user.notification.created' threw: ${String(err)}`);
  });
}
