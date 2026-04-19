import type { FastifyInstance } from 'fastify';
import { servicesCrudRoutes } from './services/crud.js';
import { servicesHelperRoutes } from './services/helpers.js';
import { servicesWebhookRoutes } from './services/webhooks.js';

/**
 * /api/admin/services — service registry + helpers + webhook management. Split per concern so
 * each submodule owns its own handler group; shared deps (prisma, provider registry) stay
 * imported independently in each file. Route URLs and behavior are unchanged.
 */
export async function servicesRoutes(app: FastifyInstance) {
  await app.register(servicesCrudRoutes);
  await app.register(servicesHelperRoutes);
  await app.register(servicesWebhookRoutes);
}
