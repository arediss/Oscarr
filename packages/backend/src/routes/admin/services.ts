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
      return reply.status(400).send({ error: 'Name, type and config required' });
    }
    // If this is set as default, unset other defaults of the same type
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
    if (!serviceId) return reply.status(400).send({ error: 'Invalid ID' });
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
        properties: {
          id: { type: 'string', description: 'Service ID' },
        },
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

  // === PLEX TOKEN HELPER (for service setup) ===

  app.get('/plex-token', async (request, reply) => {

    const provider = getAuthProvider('plex');
    if (!provider?.getToken) return reply.status(404).send({ error: 'Plex provider not available' });
    const adminUser = request.user as { id: number };
    const token = await provider.getToken(adminUser.id);
    if (!token) return reply.status(404).send({ error: 'No Plex token found' });
    return { token };
  });

  // === SERVICE CONFIG (Radarr/Sonarr profiles & folders) ===

  app.get('/radarr/profiles', async (request, reply) => {

    try {
      const radarr = await getArrClient('radarr');
      const profiles = await radarr.getQualityProfiles();
      return profiles;
    } catch {
      return reply.status(502).send({ error: 'Unable to reach Radarr' });
    }
  });

  app.get('/radarr/rootfolders', async (request, reply) => {

    try {
      const radarr = await getArrClient('radarr');
      const folders = await radarr.getRootFolders();
      return folders;
    } catch {
      return reply.status(502).send({ error: 'Unable to reach Radarr' });
    }
  });

  app.get('/sonarr/profiles', async (request, reply) => {

    try {
      const sonarr = await getArrClient('sonarr');
      const profiles = await sonarr.getQualityProfiles();
      return profiles;
    } catch {
      return reply.status(502).send({ error: 'Unable to reach Sonarr' });
    }
  });

  app.get('/sonarr/rootfolders', async (request, reply) => {

    try {
      const sonarr = await getArrClient('sonarr');
      const folders = await sonarr.getRootFolders();
      return folders;
    } catch {
      return reply.status(502).send({ error: 'Unable to reach Sonarr' });
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
    if (!serviceId) return reply.status(400).send({ error: 'Invalid ID' });
    const svc = await getServiceById(serviceId);
    if (!svc) return reply.status(404).send({ error: 'Service not found or disabled' });
    try {
      const client = createArrClient(svc.type, svc.config);
      return await client.getQualityProfiles();
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support client creation')) {
        return reply.status(400).send({ error: 'This service type does not support quality profiles' });
      }
      return reply.status(502).send({ error: 'Unable to reach the service' });
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
    if (!serviceId) return reply.status(400).send({ error: 'Invalid ID' });
    const svc = await getServiceById(serviceId);
    if (!svc) return reply.status(404).send({ error: 'Service not found or disabled' });
    try {
      const client = createArrClient(svc.type, svc.config);
      return await client.getRootFolders();
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support client creation')) {
        return reply.status(400).send({ error: 'This service type does not support root folders' });
      }
      return reply.status(502).send({ error: 'Unable to reach the service' });
    }
  });

  // ─── Webhook status + toggle ─────────────────────────────────────────

  app.get('/services/:id/webhook/status', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const serviceId = parseId((request.params as { id: string }).id);
    if (!serviceId) return reply.status(400).send({ error: 'Invalid ID' });

    const svc = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!svc) return reply.status(404).send({ error: 'Service not found' });

    const config = JSON.parse(svc.config);
    const def = getServiceDefinition(svc.type);
    let client: ReturnType<NonNullable<NonNullable<typeof def>['createClient']>> | null = null;
    let serviceReachable = true;
    try {
      client = def?.createClient?.(config) ?? null;
    } catch { /* createClient failed */ }

    const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { siteUrl: true } });
    const protocol = request.headers['x-forwarded-proto'] || 'http';
    const host = request.headers['x-forwarded-host'] || request.headers.host;
    const baseUrl = settings?.siteUrl || `${protocol}://${host}`;

    // Verify webhook still exists in the service (skip cleanup if service unreachable)
    if (svc.webhookId && client?.checkWebhookExists) {
      try {
        const exists = await client.checkWebhookExists(svc.webhookId);
        if (!exists) {
          await prisma.service.update({ where: { id: serviceId }, data: { webhookId: null } });
          svc.webhookId = null;
        }
      } catch { serviceReachable = false; }
    }

    return {
      enabled: !!svc.webhookId,
      webhookId: svc.webhookId,
      serviceReachable,
      url: `${baseUrl.replace(/\/$/, '')}/api/webhooks/${svc.type}`,
      events: client?.getWebhookEvents?.() || [],
      supportsWebhooks: !!(client?.parseWebhookPayload && client?.registerWebhook),
    };
  });

  app.post('/services/:id/webhook/enable', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const serviceId = parseId((request.params as { id: string }).id);
    if (!serviceId) return reply.status(400).send({ error: 'Invalid ID' });

    const svc = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!svc) return reply.status(404).send({ error: 'Service not found' });
    if (svc.webhookId) return reply.status(409).send({ error: 'Webhook already enabled', webhookId: svc.webhookId });

    const config = JSON.parse(svc.config);
    const def = getServiceDefinition(svc.type);
    if (!def?.createClient) return reply.status(400).send({ error: 'Service does not support webhooks' });

    const client = def.createClient(config);
    if (!client.registerWebhook) return reply.status(400).send({ error: 'Service does not support webhooks' });

    // Build webhook URL — use the request's origin (the actual backend URL) not siteUrl
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { siteUrl: true, apiKey: true } });
    if (!settings?.apiKey) return reply.status(400).send({ error: 'API key not configured (Admin > General)' });

    // Prefer siteUrl if set, otherwise derive from the incoming request
    const protocol = request.headers['x-forwarded-proto'] || 'http';
    const host = request.headers['x-forwarded-host'] || request.headers.host;
    const baseUrl = settings?.siteUrl || `${protocol}://${host}`;
    const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/webhooks/${svc.type}`;

    try {
      const webhookId = await client.registerWebhook('Oscarr', webhookUrl, settings.apiKey);
      try {
        await prisma.service.update({ where: { id: serviceId }, data: { webhookId } });
      } catch (dbErr) {
        // Rollback: remove webhook from service if DB update failed
        await client.removeWebhook?.(webhookId).catch(() => {});
        throw dbErr;
      }
      logEvent('info', 'Webhook', `Webhook enabled for ${svc.name} (ID: ${webhookId})`);
      return { ok: true, webhookId };
    } catch (err) {
      logEvent('debug', 'Webhook', `Failed to register webhook for ${svc.name}: ${err}`);
      return reply.status(502).send({ error: 'Failed to register webhook in service' });
    }
  });

  app.post('/services/:id/webhook/disable', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const serviceId = parseId((request.params as { id: string }).id);
    if (!serviceId) return reply.status(400).send({ error: 'Invalid ID' });

    const svc = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!svc) return reply.status(404).send({ error: 'Service not found' });
    if (!svc.webhookId) return reply.send({ ok: true, message: 'Webhook already disabled' });

    const config = JSON.parse(svc.config);
    const def = getServiceDefinition(svc.type);
    const client = def?.createClient?.(config);

    if (client?.removeWebhook) {
      try {
        await client.removeWebhook(svc.webhookId);
      } catch (err) {
        logEvent('debug', 'Webhook', `Failed to remove webhook ${svc.webhookId} from ${svc.name}: ${err}`);
      }
    }

    await prisma.service.update({ where: { id: serviceId }, data: { webhookId: null } });
    logEvent('info', 'Webhook', `Webhook disabled for ${svc.name}`);
    return { ok: true };
  });
}
