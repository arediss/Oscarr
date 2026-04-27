import { existsSync } from 'fs';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { FRONTEND_DIST } from '../utils/paths.js';

/**
 * Production-only: serve the built frontend and fall back to `index.html` for unknown non-API
 * routes so the React Router SPA can handle them. No-op in dev — Vite owns the frontend there.
 */
export async function registerStatic(app: FastifyInstance) {
  if (process.env.NODE_ENV !== 'production') return;

  const frontendDir = FRONTEND_DIST;
  // Operators sometimes deploy the backend image without the frontend stage (headless / API-only
  // setup, broken multi-stage Dockerfile, wrong volume mount). A silent no-op here leaves the
  // admin puzzled by a 404 on /. Surface it loudly so the boot log makes the cause obvious.
  if (!existsSync(frontendDir)) {
    app.log.warn({ frontendDir }, 'Frontend bundle not found — serving API only');
    return;
  }

  await app.register(fastifyStatic, {
    root: frontendDir,
    prefix: '/',
    wildcard: false,
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'Not found' });
    }
    reply.header('Cache-Control', 'no-store');
    return reply.sendFile('index.html');
  });
}
