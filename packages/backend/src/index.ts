import './env.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { authRoutes } from './routes/auth.js';
import { tmdbRoutes } from './routes/tmdb.js';
import { requestRoutes } from './routes/requests.js';
import { mediaRoutes } from './routes/media.js';
import { radarrSonarrRoutes } from './routes/radarr-sonarr.js';
import { adminRoutes } from './routes/admin.js';
import { supportRoutes } from './routes/support.js';
import { authenticate } from './middleware/auth.js';
import { initScheduler } from './services/scheduler.js';
import { pluginEngine } from './plugins/engine.js';
import { pluginRoutes } from './plugins/routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: true });

async function start() {
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

  app.decorate('authenticate', authenticate);

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(tmdbRoutes, { prefix: '/api/tmdb' });
  await app.register(requestRoutes, { prefix: '/api/requests' });
  await app.register(mediaRoutes, { prefix: '/api/media' });
  await app.register(radarrSonarrRoutes, { prefix: '/api/services' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(supportRoutes, { prefix: '/api/support' });

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
