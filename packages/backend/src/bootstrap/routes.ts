import type { FastifyInstance } from 'fastify';
import { authRoutes } from '../routes/auth.js';
import { tmdbRoutes } from '../routes/tmdb.js';
import { requestRoutes } from '../routes/requests.js';
import { mediaRoutes } from '../routes/media.js';
import { radarrSonarrRoutes } from '../routes/radarr-sonarr.js';
import { adminRoutes } from '../routes/admin/index.js';
import { setupRoutes } from '../routes/setup.js';
import { appRoutes } from '../routes/app.js';
import { supportRoutes } from '../routes/support.js';
import { notificationRoutes } from '../routes/notifications.js';
import { pushRoutes } from '../routes/push.js';

/**
 * Mount every HTTP route group under its /api/<prefix>. The TMDB language cache is warmed here
 * so the first request doesn't pay the hydration cost.
 *
 * Webhooks are lazy-imported because they pull in a handful of provider-specific modules that
 * we don't need evaluated unless the server actually starts handling requests.
 */
export async function registerRoutes(app: FastifyInstance) {
  const { getInstanceLanguages } = await import('../services/tmdb.js');
  await getInstanceLanguages();

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(tmdbRoutes, { prefix: '/api/tmdb' });
  await app.register(requestRoutes, { prefix: '/api/requests' });
  await app.register(mediaRoutes, { prefix: '/api/media' });
  await app.register(radarrSonarrRoutes, { prefix: '/api/services' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(setupRoutes, { prefix: '/api/setup' });
  await app.register(appRoutes, { prefix: '/api/app' });
  await app.register(supportRoutes, { prefix: '/api/support' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.register(pushRoutes, { prefix: '/api/push' });
  await app.register((await import('../routes/webhooks.js')).webhookRoutes, { prefix: '/api/webhooks' });
}
