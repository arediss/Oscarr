import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { getRadarrAsync } from '../services/radarr.js';
import { getSonarrAsync } from '../services/sonarr.js';
import { parseId, parsePage, VALID_MEDIA_TYPES } from '../utils/params.js';

export async function mediaRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string', description: 'Page number for pagination' },
          mediaType: { type: 'string', description: 'Filter by media type (movie or tv)' },
          status: { type: 'string', description: 'Filter by media status' },
        },
      },
    },
    preHandler: [app.authenticate],
  }, async (request) => {
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
              user: { select: { id: true, displayName: true, avatar: true } },
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

  app.get('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Media ID' },
        },
      },
    },
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const mediaId = parseId(id);
    if (!mediaId) return reply.status(400).send({ error: 'ID invalide' });

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: {
        requests: {
          include: {
            user: { select: { id: true, displayName: true, avatar: true } },
            approvedBy: { select: { id: true, displayName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        seasons: { orderBy: { seasonNumber: 'asc' } },
      },
    });

    if (!media) return reply.status(404).send({ error: 'Média introuvable' });
    return media;
  });

  app.get('/tmdb/:tmdbId/:mediaType', {
    schema: {
      params: {
        type: 'object',
        required: ['tmdbId', 'mediaType'],
        properties: {
          tmdbId: { type: 'string', description: 'TMDB ID of the media' },
          mediaType: { type: 'string', description: 'Type of media (movie or tv)' },
        },
      },
    },
    preHandler: [app.authenticate],
  }, async (request, reply) => {
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
            user: { select: { id: true, displayName: true, avatar: true } },
          },
        },
        seasons: { orderBy: { seasonNumber: 'asc' } },
      },
    });

    // Live check against Radarr/Sonarr
    let sonarrSeasonStats: { seasonNumber: number; episodeFileCount: number; episodeCount: number; totalEpisodeCount: number }[] | null = null;
    let liveAvailable = false;

    try {
      if (mediaType === 'movie') {
        const radarr = await getRadarrAsync();
        const radarrMovie = await radarr.getMovieByTmdbId(tmdbIdNum);
        if (radarrMovie?.hasFile) liveAvailable = true;
      } else if (mediaType === 'tv') {
        // Try to find in Sonarr by tvdbId (from DB) or by looking up tvdbId via TMDB
        let tvdbId = media?.tvdbId;
        if (!tvdbId) {
          const { getTvDetails } = await import('../services/tmdb.js');
          const tmdbData = await getTvDetails(tmdbIdNum);
          tvdbId = tmdbData.external_ids?.tvdb_id ?? null;
        }
        if (tvdbId) {
          const sonarr = await getSonarrAsync();
          const sonarrSeries = await sonarr.getSeriesByTvdbId(tvdbId);
          if (sonarrSeries) {
            const stats = sonarrSeries.statistics;
            if (stats?.percentOfEpisodes >= 100) {
              liveAvailable = true;
            } else if (stats?.episodeFileCount && stats.episodeFileCount > 0) {
              // Partially available — don't set liveAvailable, let DB status stay as 'processing'
            }
            sonarrSeasonStats = sonarrSeries.seasons
              .filter((s) => s.seasonNumber > 0)
              .map((s) => ({
                seasonNumber: s.seasonNumber,
                episodeFileCount: s.statistics?.episodeFileCount ?? 0,
                episodeCount: s.statistics?.episodeCount ?? 0,
                totalEpisodeCount: s.statistics?.totalEpisodeCount ?? 0,
              }));
          }
        }
      }
    } catch { /* Radarr/Sonarr unreachable, use DB state */ }

    if (!media) {
      // Media not in our DB but may exist in Radarr/Sonarr
      const result: Record<string, unknown> = { exists: false };
      if (liveAvailable) result.status = 'available';
      if (sonarrSeasonStats) result.sonarrSeasons = sonarrSeasonStats;
      if (liveAvailable) result.inLibrary = true;
      return result;
    }

    // Update DB if newly available
    if (liveAvailable && media.status !== 'available') {
      await prisma.media.update({ where: { id: media.id }, data: { status: 'available' } });
      await prisma.mediaRequest.updateMany({
        where: { mediaId: media.id, status: { in: ['approved', 'processing'] } },
        data: { status: 'available' },
      });
      media.status = 'available';
      media.requests = media.requests.map((r) =>
        ['approved', 'processing'].includes(r.status) ? { ...r, status: 'available' } : r
      );
    }

    // Resolve which quality options match the media's quality profile
    const activeQualityOptionIds: number[] = [];
    if ((media.status === 'available' || liveAvailable) && media.qualityProfileId) {
      const mappings = await prisma.qualityMapping.findMany({
        where: { qualityProfileId: media.qualityProfileId },
        select: { qualityOptionId: true },
      });
      activeQualityOptionIds.push(...[...new Set(mappings.map(m => m.qualityOptionId))]);
    }

    const result: Record<string, unknown> = { ...media };
    if (sonarrSeasonStats) result.sonarrSeasons = sonarrSeasonStats;
    if (liveAvailable) result.inLibrary = true;
    if (activeQualityOptionIds.length > 0) result.activeQualityOptionIds = activeQualityOptionIds;
    return result;
  });

  // Recently added media (from Radarr/Sonarr sync)
  app.get('/recent', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', description: 'Maximum number of results (default 20, max 50)' },
        },
      },
    },
    preHandler: [app.authenticate],
  }, async (request) => {
    const { limit } = request.query as { limit?: string };
    const take = Math.min(parseInt(limit || '20', 10) || 20, 50);

    const media = await prisma.media.findMany({
      where: {
        tmdbId: { gt: 0 },
        status: 'available',
        availableAt: { not: null },
        OR: [
          { radarrId: { not: null } },
          { sonarrId: { not: null } },
        ],
      },
      orderBy: { availableAt: 'desc' },
      take,
      select: {
        tmdbId: true,
        mediaType: true,
        title: true,
        posterPath: true,
        backdropPath: true,
        releaseDate: true,
        voteAverage: true,
        status: true,
      },
    });

    return media;
  });

  // Batch lookup: check availability for multiple TMDB IDs
  app.post('/batch-status', {
    schema: {
      body: {
        type: 'object',
        required: ['ids'],
        properties: {
          ids: {
            type: 'array',
            description: 'Array of TMDB IDs with media types to check status for (max 50)',
            items: {
              type: 'object',
              required: ['tmdbId', 'mediaType'],
              properties: {
                tmdbId: { type: 'number', description: 'TMDB ID' },
                mediaType: { type: 'string', description: 'Media type (movie or tv)' },
              },
            },
          },
        },
      },
    },
    preHandler: [app.authenticate],
  }, async (request, reply) => {
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
