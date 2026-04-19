import type { FastifyInstance } from 'fastify';
import { pluginEngine } from '../plugins/engine.js';
import { pluginRoutes } from '../plugins/routes.js';

/**
 * Load every installed plugin, register the routes they contribute, then mount the core
 * `/api/plugins` management endpoints. Run AFTER notifications init so plugin providers can
 * extend the notification system.
 *
 * A single broken plugin must not brick the host — `loadAll` captures per-plugin failures and
 * stores them with `{ enabled: false, error }`. We emit an aggregated warning at boot so the
 * failure is visible in the startup log rather than buried mid-stream.
 */
export async function registerPlugins(app: FastifyInstance) {
  await pluginEngine.loadAll();

  const failed = pluginEngine.listFailed();
  if (failed.length > 0) {
    app.log.warn(
      { failed },
      `${failed.length} plugin(s) failed to load — see earlier errors for details`,
    );
  }

  await pluginEngine.registerWithFastify(app);
  await app.register(pluginRoutes, { prefix: '/api/plugins' });
}
