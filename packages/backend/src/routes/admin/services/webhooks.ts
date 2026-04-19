import type { FastifyInstance } from 'fastify';
import { prisma } from '../../../utils/prisma.js';
import { getServiceDefinition } from '../../../providers/index.js';
import { logEvent } from '../../../utils/logEvent.js';
import { parseId } from '../../../utils/params.js';

/** Per-service webhook registration — status probe, enable (register on the *arr server and
 *  persist the returned ID on the Service row), disable (remove on the *arr side, null the ID).
 *  The URL returned to the admin uses siteUrl when configured, otherwise derives from the
 *  incoming request's forwarded host so an *arr instance can reach Oscarr without manual config. */
export async function servicesWebhookRoutes(app: FastifyInstance) {
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
    } catch { /* createClient failed — service type doesn't support webhooks */ }

    const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { siteUrl: true } });
    const protocol = request.headers['x-forwarded-proto'] || 'http';
    const host = request.headers['x-forwarded-host'] || request.headers.host;
    const baseUrl = settings?.siteUrl || `${protocol}://${host}`;

    // Verify the webhook still exists on the *arr side; orphaned ID means the admin removed it
    // manually in Radarr/Sonarr — null it locally so the UI reflects reality.
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

    const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { siteUrl: true, apiKey: true } });
    if (!settings?.apiKey) return reply.status(400).send({ error: 'API key not configured (Admin > General)' });

    const protocol = request.headers['x-forwarded-proto'] || 'http';
    const host = request.headers['x-forwarded-host'] || request.headers.host;
    const baseUrl = settings?.siteUrl || `${protocol}://${host}`;
    const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/webhooks/${svc.type}`;

    try {
      const webhookId = await client.registerWebhook('Oscarr', webhookUrl, settings.apiKey);
      try {
        await prisma.service.update({ where: { id: serviceId }, data: { webhookId } });
      } catch (dbErr) {
        // Rollback: the *arr side registered the webhook but our DB write failed — remove the
        // orphan on the *arr to keep the two sides consistent.
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
        // *arr unreachable — null the DB anyway so the UI doesn't stay stuck on "enabled"; admin
        // can garbage-collect the orphan on the *arr side manually if it ever comes back.
        logEvent('debug', 'Webhook', `Failed to remove webhook ${svc.webhookId} from ${svc.name}: ${err}`);
      }
    }

    await prisma.service.update({ where: { id: serviceId }, data: { webhookId: null } });
    logEvent('info', 'Webhook', `Webhook disabled for ${svc.name}`);
    return { ok: true };
  });
}
