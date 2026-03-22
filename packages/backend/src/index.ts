import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { authRoutes } from './routes/auth.js';
import { tmdbRoutes } from './routes/tmdb.js';
import { requestRoutes } from './routes/requests.js';
import { mediaRoutes } from './routes/media.js';
import { messageRoutes } from './routes/messages.js';
import { radarrSonarrRoutes } from './routes/radarr-sonarr.js';
import { adminRoutes } from './routes/admin.js';
import { authenticate } from './middleware/auth.js';
import { startSyncScheduler } from './services/sync.js';
import { prisma } from './utils/prisma.js';

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
  await app.register(messageRoutes, { prefix: '/api/messages' });
  await app.register(radarrSonarrRoutes, { prefix: '/api/services' });
  await app.register(adminRoutes, { prefix: '/api/admin' });

  const port = parseInt(process.env.PORT || '3001', 10);
  if (Number.isNaN(port)) {
    throw new Error('PORT environment variable must be a valid number');
  }
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Netflix du Pauvre API running on port ${port}`);

  // Start media sync scheduler
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  startSyncScheduler(settings?.syncIntervalHours ?? 6);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

export type App = typeof app;
