import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { rbacPlugin } from '../middleware/rbac.js';

/**
 * Security layer: CORS, cookies, JWT session, rate-limit, RBAC.
 * Must run before any route is registered so permission checks + auth decorators are available.
 */
export async function registerSecurity(app: FastifyInstance) {
  await app.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');

  await app.register(cookie);
  await app.register(jwt, {
    secret: jwtSecret,
    cookie: { cookieName: 'token', signed: false },
  });
  await app.register(rateLimit, { global: false });

  rbacPlugin(app);
}
