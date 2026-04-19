import type { FastifyInstance } from 'fastify';
import { pluginEngine } from '../plugins/engine.js';
import { pluginRoutes } from '../plugins/routes.js';

/**
 * Load every installed plugin, register the routes they contribute, then mount the core
 * `/api/plugins` management endpoints. Run AFTER notifications init so plugin providers can
 * extend the notification system.
 */
export async function registerPlugins(app: FastifyInstance) {
  await pluginEngine.loadAll();
  await pluginEngine.registerWithFastify(app);
  await app.register(pluginRoutes, { prefix: '/api/plugins' });
}
