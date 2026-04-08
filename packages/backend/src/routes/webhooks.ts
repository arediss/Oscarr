import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { getArrClient, getServiceDefinition } from '../providers/index.js';
import { promoteMediaToAvailable } from '../services/mediaService.js';
import { sendAvailabilityNotifications } from '../services/sync/helpers.js';
import { logEvent } from '../utils/logEvent.js';

export async function webhookRoutes(app: FastifyInstance) {

  app.post('/:serviceType', async (request, reply) => {
    const { serviceType } = request.params as { serviceType: string };

    // 1. Validate API key (X-Api-Key header, query param, or Basic Auth password)
    let apiKey = (request.headers['x-api-key'] as string)
      || (request.query as Record<string, string>).apikey;

    // Support Basic Auth — API key as password (Radarr/Sonarr webhook format)
    if (!apiKey && request.headers.authorization?.startsWith('Basic ')) {
      const decoded = Buffer.from(request.headers.authorization.slice(6), 'base64').toString();
      const password = decoded.split(':')[1];
      if (password) apiKey = password;
    }

    if (!apiKey) {
      return reply.status(401).send({ error: 'API key required' });
    }

    const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { apiKey: true } });
    if (!settings?.apiKey) {
      return reply.status(403).send({ error: 'No API key configured' });
    }
    const provided = Buffer.from(apiKey);
    const stored = Buffer.from(settings.apiKey);
    if (provided.length !== stored.length || !crypto.timingSafeEqual(provided, stored)) {
      return reply.status(403).send({ error: 'Invalid API key' });
    }

    // 2. Get provider and parse webhook
    const def = getServiceDefinition(serviceType);
    if (!def?.createClient) {
      return reply.status(400).send({ error: `Unknown service type: ${serviceType}` });
    }

    let client;
    try {
      client = await getArrClient(serviceType);
    } catch {
      // No service configured — create a temp client just for parsing
      // parseWebhookPayload doesn't need a real connection
      client = def.createClient({ url: '', apiKey: '' });
    }

    if (!client.parseWebhookPayload) {
      return reply.status(400).send({ error: `Service ${serviceType} does not support webhooks` });
    }

    const event = client.parseWebhookPayload(request.body);
    if (!event) {
      return reply.send({ ok: true, message: 'Payload ignored' });
    }

    // 3. Handle event
    if (event.type === 'test') {
      console.log(`[Webhook] ${serviceType} test received`);
      return reply.send({ ok: true, message: 'Webhook configured successfully' });
    }

    if (event.type === 'download') {
      const mediaType = client.mediaType;

      // Find media in DB
      let media;
      if (mediaType === 'movie') {
        media = await prisma.media.findUnique({
          where: { tmdbId_mediaType: { tmdbId: event.externalId, mediaType: 'movie' } },
        });
      } else {
        media = await prisma.media.findFirst({
          where: { mediaType: 'tv', tvdbId: event.externalId },
        });
      }

      if (!media) {
        console.log(`[Webhook] ${serviceType} download event for unknown media: ${event.title} (${event.externalId})`);
        return reply.send({ ok: true, message: 'Media not tracked' });
      }

      // Promote to available if not already
      if (media.status !== 'available') {
        await promoteMediaToAvailable(media.id, !!media.availableAt);
        sendAvailabilityNotifications(
          media.title || event.title,
          mediaType,
          media.posterPath,
          media.id,
          media.tmdbId,
        );
        logEvent('info', 'Webhook', `"${event.title}" is now available (via ${serviceType} webhook)`);
        console.log(`[Webhook] ${serviceType}: "${event.title}" → available`);
      }

      return reply.send({ ok: true, message: 'Media updated' });
    }

    // Unknown or unhandled event type — acknowledge silently
    return reply.send({ ok: true });
  });
}
