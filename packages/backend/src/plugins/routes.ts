import type { FastifyInstance } from 'fastify';
import { pluginEngine } from './engine.js';

export async function pluginRoutes(app: FastifyInstance) {
  // List all plugins (admin only)
  app.get('/', { preHandler: [app.authenticate, requireAdmin] }, async () => {
    return pluginEngine.getPluginList();
  });

  // Toggle plugin enable/disable (admin only)
  app.put<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/:id/toggle',
    { preHandler: [app.authenticate, requireAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const { enabled } = request.body;
      try {
        await pluginEngine.togglePlugin(id, enabled);
        return { success: true };
      } catch (err) {
        return reply.status(404).send({ error: String(err) });
      }
    }
  );

  // Get plugin settings schema + values (admin only)
  app.get<{ Params: { id: string } }>(
    '/:id/settings',
    { preHandler: [app.authenticate, requireAdmin] },
    async (request, reply) => {
      try {
        return await pluginEngine.getSettings(request.params.id);
      } catch (err) {
        return reply.status(404).send({ error: String(err) });
      }
    }
  );

  // Update plugin settings (admin only)
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/:id/settings',
    { preHandler: [app.authenticate, requireAdmin] },
    async (request, reply) => {
      try {
        await pluginEngine.updateSettings(request.params.id, request.body);
        return { success: true };
      } catch (err) {
        return reply.status(404).send({ error: String(err) });
      }
    }
  );

  // Get UI contributions for a hook point (authenticated)
  app.get<{ Params: { hookPoint: string } }>(
    '/ui/:hookPoint',
    { preHandler: [app.authenticate] },
    async (request) => {
      return pluginEngine.getUIContributions(request.params.hookPoint);
    }
  );

  // Get plugin feature flags (no auth - needed before login)
  app.get('/features', async () => {
    return pluginEngine.getAllFeatureFlags();
  });
}

async function requireAdmin(request: any, reply: any) {
  if (request.user?.role !== 'admin') {
    return reply.status(403).send({ error: 'Admin access required' });
  }
}
