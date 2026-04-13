import type { FastifyInstance } from 'fastify';
import webpush from 'web-push';
import { prisma } from '../utils/prisma.js';

// Configure VAPID keys from env
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@oscarr.app';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export async function pushRoutes(app: FastifyInstance) {
  // POST /push/subscribe — save subscription for current user
  app.post('/subscribe', async (request, reply) => {
    if (!VAPID_PUBLIC) return reply.status(503).send({ error: 'Push notifications not configured' });

    const user = request.user as { id: number };
    const { endpoint, keys } = request.body as { endpoint: string; keys: { p256dh: string; auth: string } };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return reply.status(400).send({ error: 'Invalid subscription' });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth }, // Don't overwrite userId — endpoint belongs to whoever registered it first
      create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });

    return { ok: true };
  });

  // DELETE /push/unsubscribe — remove subscription
  app.delete('/unsubscribe', async (request) => {
    const user = request.user as { id: number };
    const { endpoint } = request.body as { endpoint: string };

    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    } else {
      // Delete all subscriptions for this user
      await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
    }

    return { ok: true };
  });
}

// Helper: send push notification to all subscriptions for a list of user IDs
export async function sendPushToUsers(userIds: number[], payload: { title: string; body: string; icon?: string; url?: string }) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  const payloadStr = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payloadStr
      );
    } catch (err: any) {
      // If subscription is expired/invalid, clean it up
      if (err.statusCode === 410 || err.statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
    }
  }
}
