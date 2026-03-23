import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import axios from 'axios';
import { prisma } from '../utils/prisma.js';
import { pluginEngine } from '../plugins/engine.js';

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

  app.post('/setup/plex-check', async (request, reply) => {
    const existing = await prisma.service.findFirst({ where: { type: 'plex' } });
    if (existing) return reply.status(403).send({ error: 'Installation déjà effectuée' });
    const { pinId } = request.body as { pinId: number };
    if (!pinId) return reply.status(400).send({ error: 'pinId requis' });
    const { checkPlexPin } = await import('../services/plex.js');
    const authToken = await checkPlexPin(pinId, 'oscarr-client');
    if (!authToken) return reply.status(400).send({ error: 'PIN non validé' });
    return reply.send({ token: authToken });
  });

  // Initial setup — create first Plex service (locked once a Plex service exists)
  app.post('/setup', async (request, reply) => {
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
  app.post('/tickets', { preHandler: [app.authenticate] }, async (request, reply) => {
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

    return reply.status(201).send(ticket);
  });

  // Get messages for a ticket
  app.get('/tickets/:id/messages', { preHandler: [app.authenticate] }, async (request, reply) => {
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
  app.post('/tickets/:id/messages', { preHandler: [app.authenticate] }, async (request, reply) => {
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
  app.patch('/tickets/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
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

    return ticket;
  });
}
