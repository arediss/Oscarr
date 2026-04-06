import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { notificationRegistry } from '../../notifications/index.js';

export async function notificationsAdminRoutes(app: FastifyInstance) {
  // === NOTIFICATION TEST (dynamic) ===
  app.post<{ Params: { providerId: string } }>('/notifications/test/:providerId', {
    schema: {
      params: {
        type: 'object',
        required: ['providerId'],
        properties: { providerId: { type: 'string' } },
      },
      body: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
    },
  }, async (request, reply) => {
    const { providerId } = request.params;
    const settings = request.body as Record<string, string>;
    try {
      await notificationRegistry.testProvider(providerId, settings);
      return { ok: true };
    } catch (err) {
      return reply.status(502).send({ error: `Test failed for ${providerId}` });
    }
  });

  // Get registry metadata (providers + event types) for the frontend
  app.get('/notifications/meta', async () => {
    return notificationRegistry.toJSON();
  });

  // Get all provider configs from DB
  app.get('/notifications/providers', async () => {
    return prisma.notificationProviderConfig.findMany();
  });

  // Save a provider's config
  app.put<{ Params: { providerId: string } }>('/notifications/providers/:providerId', {
    schema: {
      params: {
        type: 'object',
        required: ['providerId'],
        properties: { providerId: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          settings: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
    },
  }, async (request) => {
    const { providerId } = request.params;
    const { enabled, settings } = request.body as { enabled?: boolean; settings?: Record<string, string> };

    return prisma.notificationProviderConfig.upsert({
      where: { providerId },
      update: {
        ...(enabled !== undefined && { enabled }),
        ...(settings && { settings: JSON.stringify(settings) }),
      },
      create: {
        providerId,
        enabled: enabled ?? false,
        settings: settings ? JSON.stringify(settings) : '{}',
      },
    });
  });
}
