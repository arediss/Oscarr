import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { logEvent } from '../../utils/logEvent.js';

const DEFAULT_LAYOUT = {
  version: 1,
  items: [
    { i: 'builtin:stats-counters', x: 0, y: 0, w: 12, h: 1 },
    { i: 'builtin:service-health', x: 0, y: 1, w: 6,  h: 3 },
    { i: 'builtin:system',         x: 6, y: 1, w: 6,  h: 3 },
  ],
} as const;

const layoutBodySchema = {
  type: 'object',
  required: ['version', 'items'],
  properties: {
    version: { type: 'integer', minimum: 1 },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['i', 'x', 'y', 'w', 'h'],
        properties: {
          i: { type: 'string', minLength: 1 },
          x: { type: 'integer', minimum: 0 },
          y: { type: 'integer', minimum: 0 },
          w: { type: 'integer', minimum: 1 },
          h: { type: 'integer', minimum: 1 },
        },
      },
    },
  },
} as const;

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard-layout', async () => {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings?.adminDashboardLayout) return DEFAULT_LAYOUT;
    try {
      return JSON.parse(settings.adminDashboardLayout);
    } catch (err) {
      logEvent('warn', 'AdminDashboard', `Invalid adminDashboardLayout JSON, returning defaults: ${String(err)}`);
      return DEFAULT_LAYOUT;
    }
  });

  app.put('/dashboard-layout', { schema: { body: layoutBodySchema } }, async (request) => {
    const body = request.body as { version: number; items: unknown[] };
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { adminDashboardLayout: JSON.stringify(body) },
      create: { id: 1, adminDashboardLayout: JSON.stringify(body), updatedAt: new Date() },
    });
    return { ok: true };
  });

  app.delete('/dashboard-layout', async () => {
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { adminDashboardLayout: null },
      create: { id: 1, updatedAt: new Date() },
    });
    return { ok: true };
  });
}
