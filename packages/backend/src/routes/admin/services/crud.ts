import type { FastifyInstance } from 'fastify';
import { prisma } from '../../../utils/prisma.js';
import { getServiceDefinition, getServiceSchemas } from '../../../providers/index.js';
import { logEvent } from '../../../utils/logEvent.js';
import { parseId } from '../../../utils/params.js';

/** Core service CRUD + connection test — the registry surface that drives the Services admin
 *  tab. Schemas power the dynamic form; test exercises the provider's connection helper. */
export async function servicesCrudRoutes(app: FastifyInstance) {
  app.get('/service-schemas', async () => getServiceSchemas());

  app.get('/services', async () => {
    const services = await prisma.service.findMany({ orderBy: { createdAt: 'asc' } });
    return services.map((s) => ({ ...s, config: JSON.parse(s.config) }));
  });

  app.post('/services', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'type', 'config'],
        properties: {
          name: { type: 'string', description: 'Service display name' },
          type: { type: 'string', description: 'Service type (radarr, sonarr, plex, qbittorrent, tautulli, trackarr)' },
          config: { type: 'object', description: 'Service-specific configuration (url, apiKey, token, etc.)' },
          isDefault: { type: 'boolean', description: 'Set as the default service for its type' },
        },
      },
    },
  }, async (request, reply) => {
    const { name, type, config, isDefault } = request.body as {
      name: string; type: string; config: Record<string, string>; isDefault?: boolean;
    };
    if (!name || !type || !config) {
      return reply.status(400).send({ error: 'Name, type and config required' });
    }
    // Only one default per type — clear the previous one before setting this.
    if (isDefault) {
      await prisma.service.updateMany({ where: { type, isDefault: true }, data: { isDefault: false } });
    }
    const service = await prisma.service.create({
      data: { name, type, config: JSON.stringify(config), isDefault: isDefault ?? false },
    });
    logEvent('info', 'Service', `Service "${name}" (${type}) added`);
    return reply.status(201).send({ ...service, config: JSON.parse(service.config) });
  });

  app.put('/services/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'Service ID' } },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Service display name' },
          config: { type: 'object', description: 'Service-specific configuration' },
          isDefault: { type: 'boolean', description: 'Set as the default service for its type' },
          enabled: { type: 'boolean', description: 'Enable or disable the service' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const serviceId = parseId(id);
    if (!serviceId) return reply.status(400).send({ error: 'Invalid ID' });
    const { name, config, isDefault, enabled } = request.body as {
      name?: string; config?: Record<string, string>; isDefault?: boolean; enabled?: boolean;
    };
    if (isDefault) {
      const existing = await prisma.service.findUnique({ where: { id: serviceId } });
      if (existing) {
        await prisma.service.updateMany({ where: { type: existing.type, isDefault: true, NOT: { id: serviceId } }, data: { isDefault: false } });
      }
    }
    const service = await prisma.service.update({
      where: { id: serviceId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(config !== undefined ? { config: JSON.stringify(config) } : {}),
        ...(isDefault !== undefined ? { isDefault } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
      },
    });
    return { ...service, config: JSON.parse(service.config) };
  });

  app.delete('/services/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'Service ID' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const serviceId = parseId(id);
    if (!serviceId) return reply.status(400).send({ error: 'Invalid ID' });
    const deleted = await prisma.service.delete({ where: { id: serviceId } });
    logEvent('info', 'Service', `Service "${deleted.name}" deleted`);
    return { ok: true };
  });

  app.post('/services/:id/test', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'Service ID' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const serviceId = parseId(id);
    if (!serviceId) return reply.status(400).send({ error: 'Invalid ID' });
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) return reply.status(404).send({ error: 'Service not found' });
    const config = JSON.parse(service.config) as Record<string, string>;

    const def = getServiceDefinition(service.type);
    if (!def) return reply.status(400).send({ error: 'Test not supported for this service type' });

    try {
      return await def.test(config);
    } catch {
      return reply.status(502).send({ error: 'Unable to reach the service' });
    }
  });
}
