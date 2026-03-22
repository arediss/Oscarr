import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { prisma } from '../utils/prisma.js';

// Track connected clients per channel
const clients = new Map<number, Set<{ ws: WebSocket; userId: number; username: string }>>();

function broadcast(channelId: number, message: unknown, excludeUserId?: number) {
  const channelClients = clients.get(channelId);
  if (!channelClients) return;
  const payload = JSON.stringify(message);
  for (const client of channelClients) {
    if (client.userId !== excludeUserId && client.ws.readyState === 1) {
      client.ws.send(payload);
    }
  }
}

export async function chatRoutes(app: FastifyInstance) {
  // === REST endpoints ===

  // Get incident banner (public, no auth needed for banner check)
  app.get('/banner', async () => {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    return { banner: settings?.incidentBanner || null, chatEnabled: settings?.chatEnabled ?? true };
  });

  // Get channels for current user
  app.get('/channels', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as { id: number; role: string };

    const channels = await prisma.chatChannel.findMany({
      where: {
        OR: [
          { isPrivate: false },
          { members: { some: { userId: user.id } } },
          ...(user.role === 'admin' ? [{ type: 'support' }] : []),
        ],
      },
      include: {
        _count: { select: { messages: true } },
        members: { include: { user: { select: { id: true, plexUsername: true, avatar: true } } } },
        messages: { take: 1, orderBy: { createdAt: 'desc' }, include: { user: { select: { plexUsername: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return channels.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      isPrivate: c.isPrivate,
      messageCount: c._count.messages,
      members: c.members.map((m) => m.user),
      lastMessage: c.messages[0] || null,
    }));
  });

  // Get messages for a channel
  app.get('/channels/:id/messages', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { id } = request.params as { id: string };
    const channelId = parseInt(id, 10);
    if (isNaN(channelId)) return reply.status(400).send({ error: 'ID invalide' });

    const { before } = request.query as { before?: string };

    // Check access
    const channel = await prisma.chatChannel.findUnique({ where: { id: channelId }, include: { members: true } });
    if (!channel) return reply.status(404).send({ error: 'Canal introuvable' });
    if (channel.isPrivate && user.role !== 'admin' && !channel.members.some((m) => m.userId === user.id)) {
      return reply.status(403).send({ error: 'Accès refusé' });
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        channelId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: { user: { select: { id: true, plexUsername: true, avatar: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return messages.reverse();
  });

  // Post a message (REST fallback)
  app.post('/channels/:id/messages', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { id } = request.params as { id: string };
    const channelId = parseInt(id, 10);
    if (isNaN(channelId)) return reply.status(400).send({ error: 'ID invalide' });

    const { content } = request.body as { content: string };
    if (!content || content.trim().length === 0) return reply.status(400).send({ error: 'Contenu requis' });

    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, plexUsername: true, avatar: true, role: true } });
    const message = await prisma.chatMessage.create({
      data: { channelId, userId: user.id, content: content.trim() },
    });

    const payload = { ...message, user: dbUser };
    broadcast(channelId, { type: 'message', data: payload });
    return reply.status(201).send(payload);
  });

  // Create a support ticket (user creates private channel with admins)
  app.post('/support', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { subject } = request.body as { subject?: string };

    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { plexUsername: true } });
    const channelName = subject || `Support - ${dbUser?.plexUsername || 'Utilisateur'}`;

    const channel = await prisma.chatChannel.create({
      data: {
        name: channelName,
        type: 'support',
        isPrivate: true,
        createdById: user.id,
        members: { create: { userId: user.id } },
      },
    });

    return reply.status(201).send(channel);
  });

  // === WebSocket endpoint ===
  app.get('/ws', { websocket: true }, (socket, request) => {
    const ws = socket;
    let userId = 0;
    let username = '';
    let currentChannelId = 0;

    ws.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        // Auth message: { type: "auth", token: "..." }
        if (msg.type === 'auth') {
          try {
            const decoded = app.jwt.verify<{ id: number; email: string; role: string }>(msg.token);
            userId = decoded.id;
            const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { plexUsername: true } });
            username = dbUser?.plexUsername || decoded.email;
            ws.send(JSON.stringify({ type: 'auth_ok', userId }));
          } catch {
            ws.send(JSON.stringify({ type: 'auth_error' }));
          }
          return;
        }

        if (!userId) { ws.send(JSON.stringify({ type: 'error', message: 'Non authentifié' })); return; }

        // Join channel: { type: "join", channelId: 1 }
        if (msg.type === 'join') {
          // Leave previous channel
          if (currentChannelId) {
            const prev = clients.get(currentChannelId);
            if (prev) { for (const c of prev) { if (c.ws === ws) { prev.delete(c); break; } } }
          }
          currentChannelId = msg.channelId;
          if (!clients.has(currentChannelId)) clients.set(currentChannelId, new Set());
          clients.get(currentChannelId)!.add({ ws, userId, username });
          ws.send(JSON.stringify({ type: 'joined', channelId: currentChannelId }));
          return;
        }

        // Send message: { type: "message", content: "..." }
        if (msg.type === 'message' && currentChannelId && msg.content?.trim()) {
          const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, plexUsername: true, avatar: true, role: true } });
          const chatMsg = await prisma.chatMessage.create({
            data: { channelId: currentChannelId, userId, content: msg.content.trim() },
          });
          const payload = { type: 'message', data: { ...chatMsg, user: dbUser } };
          // Broadcast to all including sender
          const channelClients = clients.get(currentChannelId);
          if (channelClients) {
            const json = JSON.stringify(payload);
            for (const c of channelClients) { if (c.ws.readyState === 1) c.ws.send(json); }
          }
          return;
        }
      } catch (err) {
        console.error('[WS] Error:', err);
      }
    });

    ws.on('close', () => {
      if (currentChannelId) {
        const ch = clients.get(currentChannelId);
        if (ch) { for (const c of ch) { if (c.ws === ws) { ch.delete(c); break; } } }
      }
    });
  });
}
