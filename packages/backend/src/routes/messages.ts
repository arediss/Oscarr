import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';

const VALID_MESSAGE_TYPES = ['general', 'announcement', 'system'];
const MAX_MESSAGE_LENGTH = 2000;

function parseId(value: string): number | null {
  const id = parseInt(value, 10);
  return Number.isNaN(id) || id < 1 ? null : id;
}

function parsePage(value?: string): number {
  const page = parseInt(value || '1', 10);
  return Number.isNaN(page) || page < 1 ? 1 : page;
}

export async function messageRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { page, type } = request.query as { page?: string; type?: string };
    const pageNum = parsePage(page);
    const take = 30;
    const skip = (pageNum - 1) * take;

    const where: Record<string, unknown> = {};
    if (type && VALID_MESSAGE_TYPES.includes(type)) where.type = type;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        include: {
          user: { select: { id: true, plexUsername: true, avatar: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.message.count({ where }),
    ]);

    return {
      results: messages,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / take),
    };
  });

  // Post a message (authenticated users)
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { content, type } = request.body as { content: string; type?: string };

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return reply.status(400).send({ error: 'Le contenu est requis' });
    }

    if (content.trim().length > MAX_MESSAGE_LENGTH) {
      return reply.status(400).send({ error: `Le message ne peut pas dépasser ${MAX_MESSAGE_LENGTH} caractères` });
    }

    const messageType = type || 'general';
    if (!VALID_MESSAGE_TYPES.includes(messageType) || messageType === 'system') {
      return reply.status(400).send({ error: 'Type de message invalide' });
    }
    if (messageType === 'announcement' && user.role !== 'admin') {
      return reply.status(403).send({ error: 'Seuls les admins peuvent poster des annonces' });
    }

    const message = await prisma.message.create({
      data: {
        userId: user.id,
        content: content.trim(),
        type: messageType,
      },
      include: {
        user: { select: { id: true, plexUsername: true, avatar: true, role: true } },
      },
    });

    return reply.status(201).send(message);
  });

  // Delete a message (own or admin)
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { id } = request.params as { id: string };

    const messageId = parseId(id);
    if (!messageId) return reply.status(400).send({ error: 'ID invalide' });

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return reply.status(404).send({ error: 'Message introuvable' });

    if (user.role !== 'admin' && message.userId !== user.id) {
      return reply.status(403).send({ error: 'Non autorisé' });
    }

    await prisma.message.delete({ where: { id: messageId } });
    return reply.send({ ok: true });
  });
}
