import { prisma } from '../utils/prisma.js';

interface NotificationPayload {
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export async function sendUserNotification(userId: number, payload: NotificationPayload): Promise<void> {
  await prisma.userNotification.create({
    data: {
      userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
    },
  });
}
