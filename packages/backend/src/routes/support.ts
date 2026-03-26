import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import axios from 'axios';
import { prisma } from '../utils/prisma.js';
import { pluginEngine } from '../plugins/engine.js';
import { logEvent } from '../services/notifications.js';
import { runFullSync } from '../services/sync.js';
import { initScheduler } from '../services/scheduler.js';

const APP_VERSION = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../../package.json'), 'utf-8')
).version as string;

export async function supportRoutes(app: FastifyInstance) {
  // Check if app is installed (has at least one Plex service)
  app.get('/install-status', async () => {
    const plexService = await prisma.service.findFirst({ where: { type: 'plex' } });
    return { installed: !!plexService };
  });

  // Plex OAuth for setup — just get a token without creating a user
  app.post('/setup/plex-pin', async (_request, reply) => {
    const existing = await prisma.service.findFirst({ where: { type: 'plex' } });
    if (existing) return reply.status(403).send({ error: 'Installation déjà effectuée' });
    const { createPlexPin } = await import('../services/plex.js');
    const pin = await createPlexPin('oscarr-client');
    const authUrl = `https://app.plex.tv/auth#?clientID=oscarr-client&code=${pin.code}&context%5Bdevice%5D%5Bproduct%5D=Oscarr`;
    return reply.send({ pin, authUrl });
  });

  app.post('/setup/plex-check', {
    schema: {
      body: {
        type: 'object',
        required: ['pinId'],
        properties: {
          pinId: { type: 'number', description: 'Plex PIN ID to check' },
        },
      },
    },
  }, async (request, reply) => {
    const existing = await prisma.service.findFirst({ where: { type: 'plex' } });
    if (existing) return reply.status(403).send({ error: 'Installation déjà effectuée' });
    const { pinId } = request.body as { pinId: number };
    if (!pinId) return reply.status(400).send({ error: 'pinId requis' });
    const { checkPlexPin } = await import('../services/plex.js');
    const authToken = await checkPlexPin(pinId, 'oscarr-client');
    if (!authToken) return reply.status(400).send({ error: 'PIN non validé' });
    return reply.send({ token: authToken });
  });

  // Test a Plex URL from the backend (avoids browser CORS issues)
  app.post('/setup/test-url', {
    schema: {
      body: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'Plex server URL to test connectivity' },
        },
      },
    },
  }, async (request, reply) => {
    const { url } = request.body as { url: string };
    if (!url) return reply.status(400).send({ error: 'URL requis' });
    try {
      const { data } = await axios.get(`${url.replace(/\/+$/, '')}/identity`, {
        headers: { Accept: 'application/json' },
        timeout: 5000,
      });
      return { ok: true, machineIdentifier: data?.MediaContainer?.machineIdentifier };
    } catch {
      return reply.status(502).send({ error: 'Impossible de joindre le serveur' });
    }
  });

  // Initial setup — create first Plex service (locked once a Plex service exists)
  app.post('/setup', {
    schema: {
      body: {
        type: 'object',
        required: ['url', 'token'],
        properties: {
          url: { type: 'string', description: 'Plex server URL' },
          token: { type: 'string', description: 'Plex authentication token' },
          machineId: { type: 'string', description: 'Plex server machine identifier' },
          name: { type: 'string', description: 'Display name for the Plex service' },
        },
      },
    },
  }, async (request, reply) => {
    const existing = await prisma.service.findFirst({ where: { type: 'plex' } });
    if (existing) return reply.status(403).send({ error: 'Installation déjà effectuée' });

    const { url, token, machineId, name } = request.body as {
      url: string; token: string; machineId?: string; name?: string;
    };
    if (!url || !token) return reply.status(400).send({ error: 'URL et Token requis' });

    const service = await prisma.service.create({
      data: {
        name: name || 'Plex',
        type: 'plex',
        config: JSON.stringify({ url, token, machineId: machineId || '' }),
        isDefault: true,
        enabled: true,
      },
    });

    // Also store machineId in AppSettings for auth flow
    if (machineId) {
      await prisma.appSettings.upsert({
        where: { id: 1 },
        update: { plexMachineId: machineId },
        create: { id: 1, plexMachineId: machineId, updatedAt: new Date() },
      });
    }

    return reply.status(201).send({ ok: true, service: { ...service, config: JSON.parse(service.config) } });
  });

  // Test a Radarr/Sonarr connection during install
  app.post('/setup/test-arr', {
    schema: {
      body: {
        type: 'object',
        required: ['url', 'apiKey'],
        properties: {
          url: { type: 'string', description: 'Radarr/Sonarr service URL' },
          apiKey: { type: 'string', description: 'Radarr/Sonarr API key' },
        },
      },
    },
  }, async (request, reply) => {
    const { url, apiKey } = request.body as { url: string; apiKey: string };
    if (!url || !apiKey) return reply.status(400).send({ error: 'URL et API key requis' });
    try {
      const { data } = await axios.get(`${url.replace(/\/+$/, '')}/api/v3/system/status`, {
        params: { apikey: apiKey },
        timeout: 5000,
      });
      return { ok: true, version: data.version };
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter le service' });
    }
  });

  // Add a Radarr/Sonarr service during install (locked once first sync is done)
  app.post('/setup/service', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'type', 'url', 'apiKey'],
        properties: {
          name: { type: 'string', description: 'Display name for the service' },
          type: { type: 'string', enum: ['radarr', 'sonarr'], description: 'Service type' },
          url: { type: 'string', description: 'Service URL' },
          apiKey: { type: 'string', description: 'Service API key' },
        },
      },
    },
  }, async (request, reply) => {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (settings?.lastRadarrSync || settings?.lastSonarrSync) {
      return reply.status(403).send({ error: 'Installation déjà effectuée' });
    }

    const { name, type, url, apiKey } = request.body as {
      name: string; type: 'radarr' | 'sonarr'; url: string; apiKey: string;
    };
    if (!name || !type || !url || !apiKey) {
      return reply.status(400).send({ error: 'Tous les champs sont requis' });
    }
    if (!['radarr', 'sonarr'].includes(type)) {
      return reply.status(400).send({ error: 'Type invalide' });
    }

    const service = await prisma.service.create({
      data: {
        name,
        type,
        config: JSON.stringify({ url: url.replace(/\/+$/, ''), apiKey }),
        isDefault: true,
        enabled: true,
      },
    });

    logEvent('info', 'Setup', `Service "${name}" (${type}) ajouté via l'installation`);
    return reply.status(201).send({ ok: true, service: { ...service, config: JSON.parse(service.config) } });
  });

  // Run first full sync during install
  app.post('/setup/sync', async (_request, reply) => {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (settings?.lastRadarrSync || settings?.lastSonarrSync) {
      return reply.status(403).send({ error: 'Sync déjà effectuée' });
    }

    // Check at least one arr service exists
    const arrService = await prisma.service.findFirst({
      where: { type: { in: ['radarr', 'sonarr'] }, enabled: true },
    });
    if (!arrService) {
      return reply.status(400).send({ error: 'Configurez au moins un service Radarr ou Sonarr' });
    }

    try {
      const result = await runFullSync();

      // Start cron schedules now that first sync is done
      await initScheduler();

      logEvent('info', 'Setup', 'Première synchronisation complète effectuée');
      return { ok: true, result };
    } catch (err) {
      return reply.status(500).send({ error: 'Sync échouée', details: String(err) });
    }
  });

  // Get app version + check for updates
  app.get('/version', async () => {
    const result: { current: string; latest?: string; updateAvailable?: boolean; releaseUrl?: string } = {
      current: APP_VERSION,
    };
    try {
      const { data } = await axios.get('https://api.github.com/repos/arediss/Oscarr/releases/latest', {
        headers: { Accept: 'application/vnd.github.v3+json' },
        timeout: 5000,
      });
      const latest = (data.tag_name as string).replace(/^v/, '');
      result.latest = latest;
      result.updateAvailable = latest !== APP_VERSION;
      result.releaseUrl = data.html_url;
    } catch {
      // GitHub unreachable or no releases yet
    }
    return result;
  });

  // Get incident banner (no auth)
  app.get('/banner', async () => {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    return { banner: settings?.incidentBanner || null };
  });

  // Quality options available for requests (only those with at least one mapping)
  app.get('/quality-options', { preHandler: [app.authenticate] }, async () => {
    return prisma.qualityOption.findMany({
      where: { mappings: { some: {} } },
      orderBy: { position: 'asc' },
    });
  });

  // Get feature flags (no auth — needed by Layout before auth check)
  app.get('/features', async () => {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const pluginFeatures = pluginEngine.getAllFeatureFlags();
    return {
      requestsEnabled: settings?.requestsEnabled ?? true,
      supportEnabled: settings?.supportEnabled ?? true,
      calendarEnabled: settings?.calendarEnabled ?? true,
      siteName: settings?.siteName ?? 'Oscarr',
      ...pluginFeatures,
    };
  });

  // List tickets (user sees own, admin sees all)
  app.get('/tickets', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as { id: number; role: string };

    const tickets = await prisma.supportTicket.findMany({
      where: user.role === 'admin' ? {} : { userId: user.id },
      include: {
        user: { select: { id: true, plexUsername: true, avatar: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { plexUsername: true } } },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      createdAt: t.createdAt,
      closedAt: t.closedAt,
      user: t.user,
      messageCount: t._count.messages,
      lastMessage: t.messages[0] || null,
    }));
  });

  // Create a ticket
  app.post('/tickets', {
    preHandler: [app.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['subject', 'message'],
        properties: {
          subject: { type: 'string', description: 'Ticket subject line' },
          message: { type: 'string', description: 'Initial ticket message content' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as { id: number };
    const { subject, message } = request.body as { subject: string; message: string };

    if (!subject?.trim()) return reply.status(400).send({ error: 'Sujet requis' });
    if (!message?.trim()) return reply.status(400).send({ error: 'Message requis' });

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: user.id,
        subject: subject.trim(),
        messages: {
          create: { userId: user.id, content: message.trim() },
        },
      },
      include: {
        user: { select: { id: true, plexUsername: true, avatar: true } },
      },
    });

    logEvent('info', 'Support', `Ticket créé par ${ticket.user.plexUsername} : "${subject.trim()}"`);
    return reply.status(201).send(ticket);
  });

  // Get messages for a ticket
  app.get('/tickets/:id/messages', {
    preHandler: [app.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Ticket ID' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { id } = request.params as { id: string };
    const ticketId = parseInt(id, 10);
    if (isNaN(ticketId)) return reply.status(400).send({ error: 'ID invalide' });

    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) return reply.status(404).send({ error: 'Ticket introuvable' });
    if (user.role !== 'admin' && ticket.userId !== user.id) {
      return reply.status(403).send({ error: 'Accès refusé' });
    }

    const messages = await prisma.ticketMessage.findMany({
      where: { ticketId },
      include: { user: { select: { id: true, plexUsername: true, avatar: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return messages;
  });

  // Post a message to a ticket
  app.post('/tickets/:id/messages', {
    preHandler: [app.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Ticket ID' },
        },
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', description: 'Message content' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { id } = request.params as { id: string };
    const ticketId = parseInt(id, 10);
    if (isNaN(ticketId)) return reply.status(400).send({ error: 'ID invalide' });

    const { content } = request.body as { content: string };
    if (!content?.trim()) return reply.status(400).send({ error: 'Contenu requis' });

    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) return reply.status(404).send({ error: 'Ticket introuvable' });
    if (user.role !== 'admin' && ticket.userId !== user.id) {
      return reply.status(403).send({ error: 'Accès refusé' });
    }

    // Reopen ticket if closed and user replies
    if (ticket.status === 'closed') {
      await prisma.supportTicket.update({ where: { id: ticketId }, data: { status: 'open', closedAt: null } });
    }

    const message = await prisma.ticketMessage.create({
      data: { ticketId, userId: user.id, content: content.trim() },
      include: { user: { select: { id: true, plexUsername: true, avatar: true, role: true } } },
    });

    return reply.status(201).send(message);
  });

  // Close/reopen a ticket (admin only)
  app.patch('/tickets/:id', {
    preHandler: [app.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Ticket ID' },
        },
      },
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['open', 'closed'], description: 'New ticket status' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    if (user.role !== 'admin') return reply.status(403).send({ error: 'Admin requis' });

    const { id } = request.params as { id: string };
    const ticketId = parseInt(id, 10);
    if (isNaN(ticketId)) return reply.status(400).send({ error: 'ID invalide' });

    const { status } = request.body as { status: string };
    if (!['open', 'closed'].includes(status)) return reply.status(400).send({ error: 'Statut invalide' });

    const ticket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status,
        closedAt: status === 'closed' ? new Date() : null,
      },
    });

    logEvent('info', 'Support', `Ticket #${ticketId} ${status === 'closed' ? 'fermé' : 'réouvert'}`);
    return ticket;
  });
}
