import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';

const VALID_MEDIA_TYPES = ['movie', 'tv'];

function parseId(value: string): number | null {
  const id = parseInt(value, 10);
  return Number.isNaN(id) || id < 1 ? null : id;
}

function parsePage(value?: string): number {
  const page = parseInt(value || '1', 10);
  return Number.isNaN(page) || page < 1 ? 1 : page;
}

export async function mediaRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { page, mediaType, status } = request.query as {
      page?: string;
      mediaType?: string;
      status?: string;
    };
    const pageNum = parsePage(page);
    const take = 20;
    const skip = (pageNum - 1) * take;

    const where: Record<string, unknown> = {};
    if (mediaType && VALID_MEDIA_TYPES.includes(mediaType)) where.mediaType = mediaType;
    if (status) where.status = status;

    const [media, total] = await Promise.all([
      prisma.media.findMany({
        where,
        include: {
          requests: {
            include: {
              user: { select: { id: true, plexUsername: true, avatar: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
          seasons: { orderBy: { seasonNumber: 'asc' } },
        },
        orderBy: { updatedAt: 'desc' },
        take,
        skip,
      }),
      prisma.media.count({ where }),
    ]);

    return {
      results: media,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / take),
    };
  });

  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const mediaId = parseId(id);
    if (!mediaId) return reply.status(400).send({ error: 'ID invalide' });

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: {
        requests: {
          include: {
            user: { select: { id: true, plexUsername: true, avatar: true } },
            approvedBy: { select: { id: true, plexUsername: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        seasons: { orderBy: { seasonNumber: 'asc' } },
      },
    });

    if (!media) return reply.status(404).send({ error: 'Média introuvable' });
    return media;
  });

  app.get('/tmdb/:tmdbId/:mediaType', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { tmdbId, mediaType } = request.params as { tmdbId: string; mediaType: string };
    const tmdbIdNum = parseId(tmdbId);
    if (!tmdbIdNum) return reply.status(400).send({ error: 'tmdbId invalide' });
    if (!VALID_MEDIA_TYPES.includes(mediaType)) return reply.status(400).send({ error: 'mediaType invalide' });

    const media = await prisma.media.findUnique({
      where: {
        tmdbId_mediaType: {
          tmdbId: tmdbIdNum,
          mediaType,
        },
      },
      include: {
        requests: {
          include: {
            user: { select: { id: true, plexUsername: true, avatar: true } },
          },
        },
        seasons: { orderBy: { seasonNumber: 'asc' } },
      },
    });

    return media || { exists: false };
  });

  // Batch lookup: check availability for multiple TMDB IDs
  app.post('/batch-status', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { ids } = request.body as { ids?: unknown };
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({ error: 'ids requis (array of {tmdbId, mediaType})' });
    }

    // Limit to 50 per request
    const limited = ids.slice(0, 50) as { tmdbId: number; mediaType: string }[];

    const results: Record<string, { status: string; requestStatus?: string }> = {};

    const media = await prisma.media.findMany({
      where: {
        OR: limited.map((item) => ({
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
        })),
      },
      include: {
        requests: {
          select: { status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    for (const m of media) {
      const key = `${m.mediaType}:${m.tmdbId}`;
      results[key] = {
        status: m.status,
        requestStatus: m.requests[0]?.status,
      };
    }

    return results;
  });
}
