import webpush from 'web-push';
import { withRetry } from '../utils/fetchWithRetry.js';
import { prisma } from '../utils/prisma.js';
import { logEvent } from '../utils/logEvent.js';

/** Web-push VAPID setup + fan-out. Consumed by routes (one-way dependency). */

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@oscarr.app';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
}

export async function sendPushToUsers(
  userIds: number[],
  payload: { title: string; body: string; icon?: string; url?: string },
) {
  if (!isPushConfigured()) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  const payloadStr = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      // Retry on transient push-endpoint failures (mozilla/google brief 5xx during rollouts).
      // 404/410 bubble as-is since they indicate a permanently-dead subscription we clean up.
      await withRetry(
        () => webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadStr,
        ),
        { label: 'WebPush' },
      );
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } })
          .catch((dbErr) => logEvent('warn', 'WebPush', `stale subscription cleanup failed: ${String(dbErr)}`));
      }
    }
  }
}
