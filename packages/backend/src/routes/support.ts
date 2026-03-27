import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { logEvent } from '../services/notifications.js';
import { sendUserNotification } from '../services/userNotifications.js';

export async function supportRoutes(app: FastifyInstance) {
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

    // Notify ticket owner when an admin replies
    if (user.role === 'admin' && ticket.userId !== user.id) {
      sendUserNotification(ticket.userId, {
        type: 'support_reply',
        title: `Réponse sur votre ticket #${ticketId}`,
        message: content.trim().slice(0, 200),
        metadata: { ticketId },
      }).catch(err => console.error('[UserNotification] Failed:', err));
    }

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
