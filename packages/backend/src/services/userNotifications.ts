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

export async function notifyRequestOwner(requestId: number, payload: Omit<NotificationPayload, 'type'> & { type: string }): Promise<void> {
  const request = await prisma.mediaRequest.findUnique({
    where: { id: requestId },
    select: { userId: true },
  });
  if (!request) return;
  await sendUserNotification(request.userId, payload);
}
