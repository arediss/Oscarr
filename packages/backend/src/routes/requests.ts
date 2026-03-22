import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { radarr } from '../services/radarr.js';
import { sonarr } from '../services/sonarr.js';
import { getMovieDetails, getTvDetails } from '../services/tmdb.js';

const VALID_STATUSES = ['pending', 'approved', 'declined', 'processing', 'available', 'failed'];
const VALID_MEDIA_TYPES = ['movie', 'tv'];

function parseId(value: string): number | null {
  const id = parseInt(value, 10);
  return Number.isNaN(id) || id < 1 ? null : id;
}

function parsePage(value?: string): number {
  const page = parseInt(value || '1', 10);
  return Number.isNaN(page) || page < 1 ? 1 : page;
}

export async function requestRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as { id: number; role: string };
    const { status, page, userId } = request.query as { status?: string; page?: string; userId?: string };
    const pageNum = parsePage(page);
    const take = 20;
    const skip = (pageNum - 1) * take;

    const where: Record<string, unknown> = {};
    if (user.role !== 'admin') {
      where.userId = user.id;
    } else if (userId) {
      const uid = parseId(userId);
      if (uid) where.userId = uid;
    }
    if (status && VALID_STATUSES.includes(status)) where.status = status;

    const [requests, total] = await Promise.all([
      prisma.mediaRequest.findMany({
        where,
        include: {
          media: true,
          user: { select: { id: true, plexUsername: true, avatar: true } },
          approvedBy: { select: { id: true, plexUsername: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.mediaRequest.count({ where }),
    ]);

    return {
      results: requests,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / take),
    };
  });

  // Stats for the current user (or all if admin)
  app.get('/stats', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as { id: number; role: string };
    const userFilter = user.role !== 'admin' ? { userId: user.id } : {};

    const [total, pending, approved, available, declined, searching, upcoming] = await Promise.all([
      prisma.mediaRequest.count({ where: userFilter }),
      prisma.mediaRequest.count({ where: { ...userFilter, status: 'pending' } }),
      prisma.mediaRequest.count({ where: { ...userFilter, status: 'approved' } }),
      prisma.mediaRequest.count({ where: { ...userFilter, status: 'available' } }),
      prisma.mediaRequest.count({ where: { ...userFilter, status: 'declined' } }),
      prisma.mediaRequest.count({ where: { ...userFilter, status: { in: ['searching'] } } }),
      prisma.mediaRequest.count({ where: { ...userFilter, status: 'upcoming' } }),
    ]);

    return { total, pending, approved, available, declined, processing: searching + upcoming };
  });

  // Create a new request
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { tmdbId, mediaType, seasons, rootFolder } = request.body as {
      tmdbId: unknown;
      mediaType: unknown;
      seasons?: unknown;
      rootFolder?: string;
    };

    if (typeof tmdbId !== 'number' || !Number.isFinite(tmdbId) || tmdbId < 1) {
      return reply.status(400).send({ error: 'tmdbId invalide' });
    }
    if (!VALID_MEDIA_TYPES.includes(mediaType as string)) {
      return reply.status(400).send({ error: 'mediaType doit être "movie" ou "tv"' });
    }
    const validMediaType = mediaType as 'movie' | 'tv';
    const validSeasons = Array.isArray(seasons) && seasons.every((s) => typeof s === 'number' && Number.isFinite(s))
      ? (seasons as number[])
      : undefined;

    const tmdbData = validMediaType === 'movie'
      ? await getMovieDetails(tmdbId)
      : await getTvDetails(tmdbId);

    const title = 'title' in tmdbData ? tmdbData.title : tmdbData.name;
    const releaseDate = 'release_date' in tmdbData ? tmdbData.release_date : tmdbData.first_air_date;

    // Find or create media
    let media = await prisma.media.findUnique({
      where: { tmdbId_mediaType: { tmdbId, mediaType: validMediaType } },
    });

    if (!media) {
      const tvdbId = tmdbData.external_ids?.tvdb_id ?? null;
      media = await prisma.media.create({
        data: {
          tmdbId,
          tvdbId,
          mediaType: validMediaType,
          title,
          overview: tmdbData.overview || null,
          posterPath: tmdbData.poster_path,
          backdropPath: tmdbData.backdrop_path,
          releaseDate: releaseDate || null,
          voteAverage: tmdbData.vote_average,
          genres: tmdbData.genres ? JSON.stringify(tmdbData.genres.map(g => g.name)) : null,
        },
      });

      if (validMediaType === 'tv' && 'seasons' in tmdbData && tmdbData.seasons) {
        await prisma.season.createMany({
          data: tmdbData.seasons
            .filter(s => s.season_number > 0)
            .map(s => ({
              mediaId: media!.id,
              seasonNumber: s.season_number,
              episodeCount: s.episode_count,
            })),
        });
      }
    }

    // Check for existing pending/approved request
    const existing = await prisma.mediaRequest.findFirst({
      where: {
        mediaId: media.id,
        userId: user.id,
        status: { in: ['pending', 'approved', 'processing'] },
      },
    });

    if (existing) {
      return reply.status(409).send({ error: 'Vous avez déjà une demande en cours pour ce média' });
    }

    const mediaRequest = await prisma.mediaRequest.create({
      data: {
        mediaId: media.id,
        userId: user.id,
        mediaType: validMediaType,
        seasons: validSeasons ? JSON.stringify(validSeasons) : null,
        rootFolder: typeof rootFolder === 'string' ? rootFolder : null,
        status: user.role === 'admin' ? 'approved' : 'pending',
        approvedById: user.role === 'admin' ? user.id : null,
      },
      include: {
        media: true,
        user: { select: { id: true, plexUsername: true, avatar: true } },
      },
    });

    if (user.role === 'admin') {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { plexUsername: true, email: true } });
      const tagName = dbUser?.plexUsername || dbUser?.email || `user-${user.id}`;
      await sendToService(media, validMediaType, tagName, validSeasons, typeof rootFolder === 'string' ? rootFolder : undefined);
    }

    return reply.status(201).send(mediaRequest);
  });

  app.post('/:id/approve', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    if (user.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin uniquement' });
    }

    const { id } = request.params as { id: string };
    const requestId = parseId(id);
    if (!requestId) return reply.status(400).send({ error: 'ID invalide' });

    const mediaRequest = await prisma.mediaRequest.findUnique({
      where: { id: requestId },
      include: { media: true, user: { select: { plexUsername: true, email: true, id: true } } },
    });

    if (!mediaRequest) return reply.status(404).send({ error: 'Demande introuvable' });
    if (mediaRequest.status !== 'pending') {
      return reply.status(400).send({ error: 'Cette demande ne peut pas être approuvée' });
    }

    const seasons = mediaRequest.seasons ? JSON.parse(mediaRequest.seasons) : undefined;
    const tagName = mediaRequest.user.plexUsername || mediaRequest.user.email || `user-${mediaRequest.user.id}`;
    await sendToService(mediaRequest.media, mediaRequest.mediaType, tagName, seasons, mediaRequest.rootFolder ?? undefined);

    const updated = await prisma.mediaRequest.update({
      where: { id: requestId },
      data: { status: 'approved', approvedById: user.id },
      include: {
        media: true,
        user: { select: { id: true, plexUsername: true, avatar: true } },
      },
    });

    return reply.send(updated);
  });

  app.post('/:id/decline', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    if (user.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin uniquement' });
    }

    const { id } = request.params as { id: string };
    const requestId = parseId(id);
    if (!requestId) return reply.status(400).send({ error: 'ID invalide' });

    const updated = await prisma.mediaRequest.update({
      where: { id: requestId },
      data: { status: 'declined', approvedById: user.id },
      include: {
        media: true,
        user: { select: { id: true, plexUsername: true, avatar: true } },
      },
    });

    return reply.send(updated);
  });

  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { id } = request.params as { id: string };
    const requestId = parseId(id);
    if (!requestId) return reply.status(400).send({ error: 'ID invalide' });

    const mediaRequest = await prisma.mediaRequest.findUnique({ where: { id: requestId } });

    if (!mediaRequest) return reply.status(404).send({ error: 'Demande introuvable' });
    if (user.role !== 'admin' && mediaRequest.userId !== user.id) {
      return reply.status(403).send({ error: 'Non autorisé' });
    }

    await prisma.mediaRequest.delete({ where: { id: requestId } });
    return reply.send({ ok: true });
  });
}

async function sendToService(
  media: { tmdbId: number; tvdbId: number | null; title: string },
  mediaType: string,
  username: string,
  seasons?: number[],
  rootFolderOverride?: string
) {
  try {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const defaultProfileId = settings?.defaultQualityProfile ?? null;
    const defaultRootFolder = rootFolderOverride || settings?.defaultRootFolder;

    if (mediaType === 'movie') {
      const tagId = await radarr.getOrCreateTag(username);
      const existing = await radarr.getMovieByTmdbId(media.tmdbId);
      if (!existing) {
        const profiles = await radarr.getQualityProfiles();
        const folders = await radarr.getRootFolders();
        await radarr.addMovie({
          title: media.title,
          tmdbId: media.tmdbId,
          qualityProfileId: defaultProfileId ?? profiles[0]?.id ?? 1,
          rootFolderPath: defaultRootFolder ?? folders[0]?.path ?? '/movies',
          tags: [tagId],
          searchForMovie: true,
        });
      }
    } else if (mediaType === 'tv' && media.tvdbId) {
      const tagId = await sonarr.getOrCreateTag(username);
      const existing = await sonarr.getSeriesByTvdbId(media.tvdbId);
      if (!existing) {
        const profiles = await sonarr.getQualityProfiles();
        const folders = await sonarr.getRootFolders();
        await sonarr.addSeries({
          title: media.title,
          tvdbId: media.tvdbId,
          qualityProfileId: defaultProfileId ?? profiles[0]?.id ?? 1,
          rootFolderPath: defaultRootFolder ?? folders[0]?.path ?? '/tv',
          seasons: seasons ?? [],
          tags: [tagId],
          searchForMissingEpisodes: true,
        });
      }
    }
  } catch (err) {
    console.error('Error sending to service:', err);
  }
}
