import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { getServiceById } from '../../utils/services.js';
import { getAuthProvider, getServiceDefinition, getServiceSchemas, getArrClient, createArrClient } from '../../providers/index.js';
import { logEvent } from '../../utils/logEvent.js';
import { parseId } from '../../utils/params.js';

export async function servicesRoutes(app: FastifyInstance) {
  // === SERVICES REGISTRY ===

  // Service schemas — used by frontend to build dynamic forms
  app.get('/service-schemas', async (request, reply) => {

    return getServiceSchemas();
  });

  app.get('/services', async (request, reply) => {

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
      return reply.status(400).send({ error: 'Nom, type et configuration requis' });
    }
    // If this is set as default, unset other defaults of the same type
    if (isDefault) {
      await prisma.service.updateMany({ where: { type, isDefault: true }, data: { isDefault: false } });
    }
    const service = await prisma.service.create({
      data: { name, type, config: JSON.stringify(config), isDefault: isDefault ?? false },
    });
    logEvent('info', 'Service', `Service "${name}" (${type}) ajout\u00e9`);
    return reply.status(201).send({ ...service, config: JSON.parse(service.config) });
  });

  app.put('/services/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Service ID' },
        },
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
    if (!serviceId) return reply.status(400).send({ error: 'ID invalide' });
    const { name, config, isDefault, enabled } = request.body as {
      name?: string; config?: Record<string, string>; isDefault?: boolean; enabled?: boolean;
    };
    // If setting as default, unset others of the same type
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
        properties: {
          id: { type: 'string', description: 'Service ID' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const serviceId = parseId(id);
    if (!serviceId) return reply.status(400).send({ error: 'ID invalide' });
    const deleted = await prisma.service.delete({ where: { id: serviceId } });
    logEvent('info', 'Service', `Service "${deleted.name}" supprim\u00e9`);
    return { ok: true };
  });

  app.post('/services/:id/test', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Service ID' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const serviceId = parseId(id);
    if (!serviceId) return reply.status(400).send({ error: 'ID invalide' });
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) return reply.status(404).send({ error: 'Service introuvable' });
    const config = JSON.parse(service.config) as Record<string, string>;

    const def = getServiceDefinition(service.type);
    if (!def) return reply.status(400).send({ error: 'Test non support\u00e9 pour ce type de service' });

    try {
      return await def.test(config);
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter le service' });
    }
  });

  // === PLEX TOKEN HELPER (for service setup) ===

  app.get('/plex-token', async (request, reply) => {

    const provider = getAuthProvider('plex');
    if (!provider?.getToken) return reply.status(404).send({ error: 'Provider Plex non disponible' });
    const adminUser = request.user as { id: number };
    const token = await provider.getToken(adminUser.id);
    if (!token) return reply.status(404).send({ error: 'Aucun token Plex trouv\u00e9' });
    return { token };
  });

  // === SERVICE CONFIG (Radarr/Sonarr profiles & folders) ===

  app.get('/radarr/profiles', async (request, reply) => {

    try {
      const radarr = await getArrClient('radarr');
      const profiles = await radarr.getQualityProfiles();
      return profiles;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Radarr' });
    }
  });

  app.get('/radarr/rootfolders', async (request, reply) => {

    try {
      const radarr = await getArrClient('radarr');
      const folders = await radarr.getRootFolders();
      return folders;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Radarr' });
    }
  });

  app.get('/sonarr/profiles', async (request, reply) => {

    try {
      const sonarr = await getArrClient('sonarr');
      const profiles = await sonarr.getQualityProfiles();
      return profiles;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Sonarr' });
    }
  });

  app.get('/sonarr/rootfolders', async (request, reply) => {

    try {
      const sonarr = await getArrClient('sonarr');
      const folders = await sonarr.getRootFolders();
      return folders;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Sonarr' });
    }
  });

  // === SERVICE PROFILES (fetch quality profiles from a specific service) ===

  app.get('/services/:id/profiles', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Service ID' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const serviceId = parseId(id);
    if (!serviceId) return reply.status(400).send({ error: 'ID invalide' });
    const svc = await getServiceById(serviceId);
    if (!svc) return reply.status(404).send({ error: 'Service introuvable ou d\u00e9sactiv\u00e9' });
    try {
      const client = createArrClient(svc.type, svc.config);
      return await client.getQualityProfiles();
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support client creation')) {
        return reply.status(400).send({ error: 'Ce type de service ne supporte pas les profils qualit\u00e9' });
      }
      return reply.status(502).send({ error: 'Impossible de contacter le service' });
    }
  });

  app.get('/services/:id/rootfolders', {
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
    if (!serviceId) return reply.status(400).send({ error: 'ID invalide' });
    const svc = await getServiceById(serviceId);
    if (!svc) return reply.status(404).send({ error: 'Service introuvable ou d\u00e9sactiv\u00e9' });
    try {
      const client = createArrClient(svc.type, svc.config);
      return await client.getRootFolders();
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support client creation')) {
        return reply.status(400).send({ error: 'Ce type de service ne supporte pas les dossiers racine' });
      }
      return reply.status(502).send({ error: 'Impossible de contacter le service' });
    }
  });
}
