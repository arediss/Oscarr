import './env.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { authRoutes } from './routes/auth.js';
import { tmdbRoutes } from './routes/tmdb.js';
import { requestRoutes } from './routes/requests.js';
import { mediaRoutes } from './routes/media.js';
import { radarrSonarrRoutes } from './routes/radarr-sonarr.js';
import { adminRoutes } from './routes/admin/index.js';
import { setupRoutes } from './routes/setup.js';
import { appRoutes } from './routes/app.js';
import { supportRoutes } from './routes/support.js';
import { notificationRoutes } from './routes/notifications.js';
import { rbacPlugin, getAccessTag } from './middleware/rbac.js';
import { initScheduler } from './services/scheduler.js';
import { initNotifications } from './notifications/index.js';
import { pluginEngine } from './plugins/engine.js';
import { pluginRoutes } from './plugins/routes.js';
import { loadInstallState } from './utils/install.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: true });

async function start() {
  loadInstallState();
  await app.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  await app.register(jwt, {
    secret: jwtSecret,
    cookie: { cookieName: 'token', signed: false },
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  // Hydrate instance language cache before any route handles requests
  const { getInstanceLanguages } = await import('./services/tmdb.js');
  await getInstanceLanguages();

  // Register RBAC middleware (central access control for all routes)
  rbacPlugin(app);

  // OpenAPI / Swagger (disabled in production — no /api/docs route exposed)
  if (process.env.NODE_ENV !== 'production') {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Oscarr API',
          description: 'API documentation for Oscarr — media request management',
          version: '0.1.0-alpha',
        },
        components: {
          securitySchemes: {
            cookieAuth: {
              type: 'apiKey',
              in: 'cookie',
              name: 'token',
            },
          },
        },
        security: [{ cookieAuth: [] }],
        tags: [
          { name: 'Public', description: 'No authentication required — open to anyone' },
          { name: 'Auth Required', description: 'Requires a valid JWT session (logged-in user)' },
          { name: 'Admin Only', description: 'Requires admin role — sensitive operations' },
        ],
      },
    });

    await app.register(swaggerUi, {
      routePrefix: '/api/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
      uiHooks: {
        preHandler: async (request, reply) => {
          try { await request.jwtVerify(); } catch { return reply.status(401).send({ error: 'Non autorisé' }); }
          const user = request.user as { id: number; role: string };
          if (user.role !== 'admin') return reply.status(403).send({ error: 'Admin only' });
        },
      },
    });
  }

  // Auto-tag every route for Swagger using the RBAC permission map
  app.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url.startsWith('/api/docs')) return;
    if (!routeOptions.url.startsWith('/api/')) return;

    const segment = (routeOptions.prefix || '').split('/').filter(Boolean).pop() || 'other';
    const categoryTag = segment.charAt(0).toUpperCase() + segment.slice(1);

    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
    const accessTag = getAccessTag(methods[0], routeOptions.url);

    routeOptions.schema = { ...routeOptions.schema, tags: [categoryTag, accessTag] };
  });

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

  // Initialize notification system (before plugins, so they can extend it)
  initNotifications();

  // Load plugins and register their routes
  await pluginEngine.loadAll();
  await pluginEngine.registerWithFastify(app);
  await app.register(pluginRoutes, { prefix: '/api/plugins' });

  // In production, serve the frontend SPA
  const frontendDir = resolve(__dirname, '../../frontend/dist');
  if (process.env.NODE_ENV === 'production' && existsSync(frontendDir)) {
    await app.register(fastifyStatic, {
      root: frontendDir,
      prefix: '/',
      wildcard: false,
    });

    // SPA fallback: serve index.html for non-API routes
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  const port = parseInt(process.env.PORT || '3001', 10);
  if (Number.isNaN(port)) {
    throw new Error('PORT environment variable must be a valid number');
  }
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Oscarr API running on port ${port}`);

  // Start CRON scheduler (with plugin jobs)
  await initScheduler(pluginEngine);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

export type App = typeof app;
