import { prisma } from '../utils/prisma.js';
import { sendNotification } from './notifications.js';

export async function checkExpiringSubscriptions() {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 86400000);
  const in1Day = new Date(now.getTime() + 1 * 86400000);

  // Users expiring within 7 days (but more than 1 day)
  const expiring7 = await prisma.user.findMany({
    where: {
      subscriptionEndDate: { gte: in1Day, lte: in7Days },
      role: { not: 'admin' },
    },
    select: { plexUsername: true, email: true, subscriptionEndDate: true },
  });

  // Users expiring within 1 day
  const expiring1 = await prisma.user.findMany({
    where: {
      subscriptionEndDate: { gte: now, lte: in1Day },
      role: { not: 'admin' },
    },
    select: { plexUsername: true, email: true, subscriptionEndDate: true },
  });

  for (const user of [...expiring7, ...expiring1]) {
    sendNotification('subscription_expiring', {
      title: 'Expiration abonnement',
      username: user.plexUsername || user.email,
      expiresAt: user.subscriptionEndDate?.toLocaleDateString('fr-FR') || '',
    });
  }

  if (expiring7.length + expiring1.length > 0) {
    console.log(`[SubCheck] ${expiring7.length} users expiring in 7d, ${expiring1.length} in 1d`);
  }
}
