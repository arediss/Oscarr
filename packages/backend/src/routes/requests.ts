import type { FastifyInstance } from 'fastify';
import { requestListRoutes } from './requests/list.js';
import { requestCreateRoutes } from './requests/create.js';
import { requestLifecycleRoutes } from './requests/lifecycle.js';
import { requestMaintenanceRoutes } from './requests/maintenance.js';

/**
 * /api/requests — user-facing request management. Split into read (list/stats/resolve),
 * write (create/collection), per-request lifecycle (approve/decline/update/delete), and
 * bulk maintenance (missing search / cleanup). Route URLs and behavior unchanged.
 */
export async function requestRoutes(app: FastifyInstance) {
  await app.register(requestListRoutes);
  await app.register(requestCreateRoutes);
  await app.register(requestLifecycleRoutes);
  await app.register(requestMaintenanceRoutes);
}
