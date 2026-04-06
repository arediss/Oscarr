import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { getRadarrAsync, getRadarrForService } from '../services/radarr.js';
import { getSonarrAsync, getSonarrForService } from '../services/sonarr.js';
import { getMovieDetails, getTvDetails, getCollection } from '../services/tmdb.js';
import { matchFolderRule } from '../services/folderRules.js';
import { notificationRegistry } from '../notifications/index.js';
import { logEvent } from '../utils/logEvent.js';
import { sendUserNotification } from '../services/userNotifications.js';
import { getServiceById, getAllServices } from '../utils/services.js';
import { parseId, parsePage, VALID_MEDIA_TYPES } from '../utils/params.js';
import { pluginEngine } from '../plugins/engine.js';
import { REQUEST_STATUSES, ACTIVE_REQUEST_STATUSES, COMPLETABLE_REQUEST_STATUSES } from '../utils/requestStatus.js';

const VALID_STATUSES: string[] = [...REQUEST_STATUSES];

function validateRequestBody(body: { tmdbId: unknown; mediaType: unknown; seasons?: unknown }): {
  valid: true; tmdbId: number; mediaType: 'movie' | 'tv'; seasons: number[] | undefined;
} | { valid: false; error: string } {
  const { tmdbId, mediaType, seasons } = body;
  if (typeof tmdbId !== 'number' || !Number.isFinite(tmdbId) || tmdbId < 1) {
    return { valid: false, error: 'tmdbId invalide' };
  }
  if (!VALID_MEDIA_TYPES.includes(mediaType as string)) {
    return { valid: false, error: 'mediaType doit être "movie" ou "tv"' };
  }
  const validSeasons = Array.isArray(seasons) && seasons.every((s) => typeof s === 'number' && Number.isFinite(s))
    ? (seasons as number[])
    : undefined;
  return { valid: true, tmdbId, mediaType: mediaType as 'movie' | 'tv', seasons: validSeasons };
}

async function findOrCreateMedia(tmdbId: number, mediaType: 'movie' | 'tv') {
  const existing = await prisma.media.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType } },
  });
  if (existing) return existing;

  const tmdbData = mediaType === 'movie'
    ? await getMovieDetails(tmdbId)
    : await getTvDetails(tmdbId);

  const title = 'title' in tmdbData ? tmdbData.title : tmdbData.name;
  const releaseDate = 'release_date' in tmdbData ? tmdbData.release_date : tmdbData.first_air_date;

  const media = await prisma.media.create({
    data: {
      tmdbId,
      tvdbId: tmdbData.external_ids?.tvdb_id ?? null,
      mediaType,
      title,
      overview: tmdbData.overview || null,
      posterPath: tmdbData.poster_path,
      backdropPath: tmdbData.backdrop_path,
      releaseDate: releaseDate || null,
      voteAverage: tmdbData.vote_average,
      genres: tmdbData.genres ? JSON.stringify(tmdbData.genres.map(g => g.name)) : null,
    },
  });

  if (mediaType === 'tv' && 'seasons' in tmdbData && tmdbData.seasons) {
    await prisma.season.createMany({
      data: tmdbData.seasons
        .filter(s => s.season_number > 0)
        .map(s => ({
          mediaId: media.id,
          seasonNumber: s.season_number,
          episodeCount: s.episode_count,
        })),
    });
  }

  return media;
}

async function getUserTagName(userId: number): Promise<string> {
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, email: true } });
  return dbUser?.displayName || dbUser?.email || `user-${userId}`;
}

async function runPluginGuard(userId: number): Promise<{ blocked: boolean; statusCode?: number; error?: string } | null> {
  return pluginEngine.runGuards('request.create', userId);
}

/** Returns true if a request was created, false if skipped. */
async function requestCollectionMovie(
  movieTmdbId: number,
  user: { id: number; role: string },
): Promise<boolean> {
  const existingRequest = await prisma.mediaRequest.findFirst({
    where: {
      media: { tmdbId: movieTmdbId, mediaType: 'movie' },
      status: { in: [...ACTIVE_REQUEST_STATUSES, 'available'] },
    },
  });
  if (existingRequest) return false;

  const dbMedia = await prisma.media.findUnique({
    where: { tmdbId_mediaType: { tmdbId: movieTmdbId, mediaType: 'movie' } },
  });
  if (dbMedia?.status === 'available') return false;

  const media = dbMedia ?? await createMovieMedia(movieTmdbId);

  const req = await prisma.mediaRequest.create({
    data: {
      mediaId: media.id,
      userId: user.id,
      mediaType: 'movie',
      status: user.role === 'admin' ? 'approved' : 'pending',
      approvedById: user.role === 'admin' ? user.id : null,
    },
  });

  if (user.role === 'admin') {
    const tagName = await getUserTagName(user.id);
    const sent = await sendToService(media, 'movie', tagName, user.id);
    if (!sent) {
      await prisma.mediaRequest.update({ where: { id: req.id }, data: { status: 'failed' } });
    }
  }

  return true;
}

async function createMovieMedia(tmdbId: number) {
  const details = await getMovieDetails(tmdbId);
  return prisma.media.create({
    data: {
      tmdbId,
      mediaType: 'movie',
      title: details.title,
      overview: details.overview || null,
      posterPath: details.poster_path,
      backdropPath: details.backdrop_path,
      releaseDate: details.release_date || null,
      voteAverage: details.vote_average,
      genres: details.genres ? JSON.stringify(details.genres.map((g) => g.name)) : null,
    },
  });
}

export async function requestRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by request status (pending, approved, declined, processing, available, failed)' },
          page: { type: 'string', description: 'Page number for pagination' },
          userId: { type: 'string', description: 'Filter by user ID (admin only)' },
        },
      },
    },

  }, async (request) => {
    const user = request.user as { id: number; role: string };
    const { status, page, userId } = request.query as { status?: string; page?: string; userId?: string };
    const pageNum = parsePage(page);
    const take = 20;
    const skip = (pageNum - 1) * take;

    const where: Record<string, unknown> = {};
    if (request.ownerScoped) {
      where.userId = user.id;
    } else if (userId) {
      const uid = parseId(userId);
      if (uid) where.userId = uid;
    }
    if (status && VALID_STATUSES.includes(status)) where.status = status;

    // Quick sync: update stale request statuses where media is already available
    await prisma.mediaRequest.updateMany({
      where: {
        status: { in: [...COMPLETABLE_REQUEST_STATUSES] },
        media: { status: 'available' },
      },
      data: { status: 'available' },
    });

    const [requests, total] = await Promise.all([
      prisma.mediaRequest.findMany({
        where,
        include: {
          media: true,
          user: { select: { id: true, displayName: true, avatar: true } },
          approvedBy: { select: { id: true, displayName: true } },
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
  app.get('/stats', async (request) => {
    const user = request.user as { id: number; role: string };
    const userFilter = request.ownerScoped ? { userId: user.id } : {};

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
  app.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['tmdbId', 'mediaType'],
        properties: {
          tmdbId: { type: 'number', description: 'TMDB ID of the media to request' },
          mediaType: { type: 'string', enum: ['movie', 'tv'], description: 'Type of media' },
          seasons: { type: 'array', items: { type: 'number' }, description: 'Season numbers to request (TV only)' },
          rootFolder: { type: 'string', description: 'Root folder path override' },
          qualityOptionId: { type: 'number', description: 'Quality option ID for quality profile mapping' },
        },
      },
    },

  }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { tmdbId, mediaType, seasons, rootFolder, qualityOptionId } = request.body as {
      tmdbId: unknown;
      mediaType: unknown;
      seasons?: unknown;
      rootFolder?: string;
      qualityOptionId?: number;
    };

    const validation = validateRequestBody({ tmdbId, mediaType, seasons });
    if (!validation.valid) {
      return reply.status(400).send({ error: validation.error });
    }
    const { tmdbId: validTmdbId, mediaType: validMediaType, seasons: validSeasons } = validation;

    // Run plugin guards (e.g. subscription check)
    if (user.role !== 'admin') {
      const guardResult = await runPluginGuard(user.id);
      if (guardResult?.blocked) {
        return reply.status(guardResult.statusCode || 403).send({ error: guardResult.error });
      }
    }

    const media = await findOrCreateMedia(validTmdbId, validMediaType);

    // Check for existing pending/approved request
    const existing = await prisma.mediaRequest.findFirst({
      where: {
        mediaId: media.id,
        userId: user.id,
        status: { in: [...ACTIVE_REQUEST_STATUSES] },
      },
    });
    if (existing) {
      return reply.status(409).send({ error: 'Vous avez déjà une demande en cours pour ce média' });
    }

    // Check if auto-approve is enabled
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const shouldAutoApprove = user.role === 'admin' || (settings?.autoApproveRequests ?? false);

    const mediaRequest = await prisma.mediaRequest.create({
      data: {
        mediaId: media.id,
        userId: user.id,
        mediaType: validMediaType,
        seasons: validSeasons ? JSON.stringify(validSeasons) : null,
        rootFolder: typeof rootFolder === 'string' ? rootFolder : null,
        qualityOptionId: qualityOptionId ?? null,
        status: shouldAutoApprove ? 'approved' : 'pending',
        approvedById: shouldAutoApprove ? user.id : null,
      },
      include: {
        media: true,
        user: { select: { id: true, displayName: true, avatar: true } },
      },
    });

    let sendFailed = false;
    if (shouldAutoApprove) {
      const tagName = await getUserTagName(user.id);
      const sent = await sendToService(media, validMediaType, tagName, user.id, validSeasons, qualityOptionId);
      if (!sent) {
        await prisma.mediaRequest.update({ where: { id: mediaRequest.id }, data: { status: 'failed' } });
        sendFailed = true;
      }
    }

    // Notify
    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { displayName: true } });
    const username = dbUser?.displayName || 'Utilisateur';
    notificationRegistry.send('request_new', { title: media.title, mediaType: validMediaType, username, posterPath: media.posterPath, tmdbId: media.tmdbId }).catch(err => console.error('[Notification] Failed:', err));
    if (shouldAutoApprove && !sendFailed) {
      sendUserNotification(user.id, { type: 'request_approved', title: media.title, message: `Votre demande pour "${media.title}" a été approuvée automatiquement.`, metadata: { mediaId: media.id, tmdbId: media.tmdbId, mediaType: validMediaType } }).catch(err => console.error('[UserNotification] Failed:', err));
    }
    logEvent('info', 'Request', `${username} a demandé "${media.title}"`);

    if (sendFailed) {
      return reply.status(202).send({ ...mediaRequest, status: 'failed', sendError: true });
    }
    return reply.status(201).send(mediaRequest);
  });

  app.post('/:id/approve', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Request ID to approve' },
        },
      },
    },

  }, async (request, reply) => {
    const user = request.user as { id: number; role: string };

    const { id } = request.params as { id: string };
    const requestId = parseId(id);
    if (!requestId) return reply.status(400).send({ error: 'ID invalide' });

    const mediaRequest = await prisma.mediaRequest.findUnique({
      where: { id: requestId },
      include: { media: true, user: { select: { displayName: true, email: true, id: true } } },
    });

    if (!mediaRequest) return reply.status(404).send({ error: 'Demande introuvable' });
    if (mediaRequest.status !== 'pending') {
      return reply.status(400).send({ error: 'Cette demande ne peut pas être approuvée' });
    }

    const seasons = mediaRequest.seasons ? JSON.parse(mediaRequest.seasons) : undefined;
    const tagName = mediaRequest.user.displayName || mediaRequest.user.email || `user-${mediaRequest.user.id}`;
    const sent = await sendToService(mediaRequest.media, mediaRequest.mediaType, tagName, mediaRequest.userId, seasons, mediaRequest.qualityOptionId ?? undefined);

    const updated = await prisma.mediaRequest.update({
      where: { id: requestId },
      data: { status: sent ? 'approved' : 'failed', approvedById: user.id },
      include: {
        media: true,
        user: { select: { id: true, displayName: true, avatar: true } },
      },
    });

    notificationRegistry.send('request_approved', { title: updated.media.title, mediaType: updated.mediaType as 'movie' | 'tv', username: updated.user?.displayName || 'Utilisateur', posterPath: updated.media.posterPath }).catch(err => console.error('[Notification] Failed:', err));
    sendUserNotification(updated.user.id, { type: 'request_approved', title: updated.media.title, message: `Votre demande pour "${updated.media.title}" a été approuvée.`, metadata: { mediaId: updated.mediaId, tmdbId: updated.media.tmdbId, mediaType: updated.mediaType } }).catch(err => console.error('[UserNotification] Failed:', err));
    logEvent('info', 'Request', `Demande "${updated.media.title}" approuvée`);

    return reply.send(updated);
  });

  app.post('/:id/decline', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Request ID to decline' },
        },
      },
    },

  }, async (request, reply) => {
    const user = request.user as { id: number; role: string };

    const { id } = request.params as { id: string };
    const requestId = parseId(id);
    if (!requestId) return reply.status(400).send({ error: 'ID invalide' });

    const updated = await prisma.mediaRequest.update({
      where: { id: requestId },
      data: { status: 'declined', approvedById: user.id },
      include: {
        media: true,
        user: { select: { id: true, displayName: true, avatar: true } },
      },
    });

    notificationRegistry.send('request_declined', { title: updated.media.title, mediaType: updated.mediaType as 'movie' | 'tv', username: updated.user?.displayName || 'Utilisateur', posterPath: updated.media.posterPath }).catch(err => console.error('[Notification] Failed:', err));
    sendUserNotification(updated.user.id, { type: 'request_declined', title: updated.media.title, message: `Votre demande pour "${updated.media.title}" a été refusée.`, metadata: { mediaId: updated.mediaId, tmdbId: updated.media.tmdbId, mediaType: updated.mediaType } }).catch(err => console.error('[UserNotification] Failed:', err));
    logEvent('info', 'Request', `Demande "${updated.media.title}" refusée`);

    return reply.send(updated);
  });

  // Trigger search for missing episodes/movie on existing media
  app.post('/search-missing', {
    schema: {
      body: {
        type: 'object' as const,
        required: ['tmdbId', 'mediaType'],
        properties: {
          tmdbId: { type: 'number', description: 'TMDB ID of the media' },
          mediaType: { type: 'string', enum: ['movie', 'tv'], description: 'Media type' },
        },
      },
    },

  }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { tmdbId, mediaType } = request.body as { tmdbId: number; mediaType: string };

    // Run plugin guards
    if (user.role !== 'admin') {
      const guardResult = await runPluginGuard(user.id);
      if (guardResult?.blocked) {
        return reply.status(guardResult.statusCode || 403).send({ error: guardResult.error });
      }
    }

    const media = await prisma.media.findUnique({
      where: { tmdbId_mediaType: { tmdbId, mediaType } },
    });
    if (!media) return reply.status(404).send({ error: 'Média introuvable' });

    // Check cooldown
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const cooldownMin = settings?.missingSearchCooldownMin ?? 60;
    if (media.lastMissingSearchAt) {
      const elapsed = Date.now() - new Date(media.lastMissingSearchAt).getTime();
      const remaining = Math.ceil((cooldownMin * 60 * 1000 - elapsed) / 60000);
      if (elapsed < cooldownMin * 60 * 1000) {
        return reply.status(429).send({ error: `Recherche déjà lancée récemment. Réessayez dans ${remaining} min.`, cooldownRemaining: remaining });
      }
    }

    try {
      if (mediaType === 'tv' && media.sonarrId) {
        const sonarr = await getSonarrAsync();
        await sonarr.searchMissingEpisodes(media.sonarrId);
      } else if (mediaType === 'movie' && media.radarrId) {
        const radarr = await getRadarrAsync();
        await radarr.searchMovie(media.radarrId);
      } else {
        return reply.status(400).send({ error: 'Ce média n\'est pas encore dans Sonarr/Radarr' });
      }

      await prisma.media.update({
        where: { id: media.id },
        data: { lastMissingSearchAt: new Date() },
      });

      logEvent('info', 'Request', `Recherche des manquants lancée pour "${media.title}"`);
      return reply.send({ ok: true });
    } catch (err) {
      console.error('Search missing failed:', err);
      return reply.status(502).send({ error: 'Erreur lors du lancement de la recherche' });
    }
  });

  app.delete('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Request ID to delete' },
        },
      },
    },

  }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { id } = request.params as { id: string };
    const requestId = parseId(id);
    if (!requestId) return reply.status(400).send({ error: 'ID invalide' });

    const mediaRequest = await prisma.mediaRequest.findUnique({ where: { id: requestId } });

    if (!mediaRequest) return reply.status(404).send({ error: 'Demande introuvable' });
    if (request.ownerScoped && mediaRequest.userId !== user.id) {
      return reply.status(403).send({ error: 'Non autorisé' });
    }

    await prisma.mediaRequest.delete({ where: { id: requestId } });
    return reply.send({ ok: true });
  });

  // Request an entire collection
  app.post('/collection', {
    schema: {
      body: {
        type: 'object',
        required: ['collectionId'],
        properties: {
          collectionId: { type: 'number', description: 'TMDB collection ID to request all movies from' },
        },
      },
    },

  }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { collectionId } = request.body as { collectionId: unknown };

    if (typeof collectionId !== 'number' || !Number.isFinite(collectionId) || collectionId < 1) {
      return reply.status(400).send({ error: 'collectionId invalide' });
    }

    // Run plugin guards
    if (user.role !== 'admin') {
      const guardResult = await runPluginGuard(user.id);
      if (guardResult?.blocked) {
        return reply.status(guardResult.statusCode || 403).send({ error: guardResult.error });
      }
    }

    const collection = await getCollection(collectionId);
    if (!collection?.parts?.length) {
      return reply.status(404).send({ error: 'Collection introuvable' });
    }

    let requested = 0;
    let skipped = 0;

    for (const movie of collection.parts) {
      const wasRequested = await requestCollectionMovie(movie.id, user);
      if (wasRequested) { requested++; } else { skipped++; }
    }

    return reply.status(201).send({
      collection: collection.name,
      total: collection.parts.length,
      requested,
      skipped,
    });
  });
}

interface ServiceContext {
  targetService: { id: number; config: Record<string, string> } | null;
  targetProfileId: number | null;
  defaultProfileId: number | null;
  defaultFolder: string | null | undefined;
  ruleMatch: Awaited<ReturnType<typeof matchFolderRule>>;
}

async function resolveServiceContext(
  mediaType: 'movie' | 'tv',
  tmdbId: number,
  userId: number | null,
  qualityOptionId?: number,
): Promise<ServiceContext> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const defaultProfileId = settings?.defaultQualityProfile ?? null;

  const tmdbData = mediaType === 'movie'
    ? await getMovieDetails(tmdbId)
    : await getTvDetails(tmdbId);

  const ruleMatch = await matchFolderRule(mediaType, tmdbData, userId);
  const defaultFolder = mediaType === 'movie' ? settings?.defaultMovieFolder : settings?.defaultTvFolder;

  let targetServiceId: number | null = ruleMatch?.serviceId ?? null;
  let targetProfileId: number | null = null;

  if (qualityOptionId) {
    const serviceType = mediaType === 'movie' ? 'radarr' : 'sonarr';
    const mapping = await prisma.qualityMapping.findFirst({
      where: {
        qualityOptionId,
        service: { type: serviceType, enabled: true },
      },
      include: { service: true },
    });
    if (mapping) {
      targetServiceId = mapping.serviceId;
      targetProfileId = mapping.qualityProfileId;
    }
  }

  let targetService: { id: number; config: Record<string, string> } | null = null;
  if (targetServiceId) {
    targetService = await getServiceById(targetServiceId) as { id: number; config: Record<string, string> } | null;
  }
  if (!targetService) {
    const services = await getAllServices(mediaType === 'movie' ? 'radarr' : 'sonarr');
    if (services.length > 0) targetService = services[0];
  }

  return { targetService, targetProfileId, defaultProfileId, defaultFolder, ruleMatch };
}

async function sendToRadarr(
  media: { tmdbId: number; title: string },
  username: string,
  ctx: ServiceContext,
) {
  const radarr = ctx.targetService
    ? getRadarrForService(ctx.targetService.id, ctx.targetService.config)
    : await getRadarrAsync();
  const folderPath = ctx.ruleMatch?.folderPath || ctx.defaultFolder || (await radarr.getRootFolders())[0]?.path || '/movies';
  const tagId = await radarr.getOrCreateTag(username);
  const existing = await radarr.getMovieByTmdbId(media.tmdbId);
  if (existing) {
    await radarr.searchMovie(existing.id);
    return;
  }
  const profileId = ctx.targetProfileId ?? ctx.defaultProfileId ?? (await radarr.getQualityProfiles())[0]?.id ?? 1;
  await radarr.addMovie({
    title: media.title,
    tmdbId: media.tmdbId,
    qualityProfileId: profileId,
    rootFolderPath: folderPath,
    tags: [tagId],
    searchForMovie: true,
  });
}

async function sendToSonarr(
  media: { tmdbId: number; tvdbId: number; title: string },
  username: string,
  ctx: ServiceContext,
  seasons?: number[],
) {
  const sonarr = ctx.targetService
    ? getSonarrForService(ctx.targetService.id, ctx.targetService.config)
    : await getSonarrAsync();
  const folderPath = ctx.ruleMatch?.folderPath || ctx.defaultFolder || (await sonarr.getRootFolders())[0]?.path || '/tv';
  const seriesType = (ctx.ruleMatch?.seriesType as 'anime' | 'standard' | 'daily') || 'standard';
  const tagId = await sonarr.getOrCreateTag(username);
  const existing = await sonarr.getSeriesByTvdbId(media.tvdbId);
  if (existing) {
    await sonarr.searchMissingEpisodes(existing.id);
    return;
  }
  const profileId = ctx.targetProfileId ?? ctx.defaultProfileId ?? (await sonarr.getQualityProfiles())[0]?.id ?? 1;
  await sonarr.addSeries({
    title: media.title,
    tvdbId: media.tvdbId,
    qualityProfileId: profileId,
    rootFolderPath: folderPath,
    seriesType,
    seasons: seasons ?? [],
    tags: [tagId],
    searchForMissingEpisodes: true,
  });
}

async function sendToService(
  media: { tmdbId: number; tvdbId: number | null; title: string },
  mediaType: string,
  username: string,
  userId: number | null = null,
  seasons?: number[],
  qualityOptionId?: number,
): Promise<boolean> {
  try {
    const ctx = await resolveServiceContext(mediaType as 'movie' | 'tv', media.tmdbId, userId, qualityOptionId);

    if (mediaType === 'movie') {
      await sendToRadarr(media, username, ctx);
    } else if (mediaType === 'tv' && media.tvdbId) {
      await sendToSonarr({ ...media, tvdbId: media.tvdbId }, username, ctx, seasons);
    }
    return true;
  } catch (err) {
    console.error('Failed to send %s "%s" to service:', mediaType, media.title, err);
    logEvent('error', 'Request', `Échec d'envoi de "${media.title}" vers ${mediaType === 'movie' ? 'Radarr' : 'Sonarr'} : ${String(err)}`);
    return false;
  }
}

/** Retry all failed requests — called by scheduler */
export async function retryFailedRequests(): Promise<{ retried: number; succeeded: number }> {
  const failed = await prisma.mediaRequest.findMany({
    where: { status: 'failed' },
    include: { media: true, user: { select: { id: true, displayName: true, email: true } } },
  });

  if (failed.length === 0) return { retried: 0, succeeded: 0 };

  let succeeded = 0;
  for (const req of failed) {
    const tagName = req.user.displayName || req.user.email || `user-${req.userId}`;
    const seasons = req.seasons ? JSON.parse(req.seasons) : undefined;
    const sent = await sendToService(req.media, req.mediaType, tagName, req.userId, seasons, req.qualityOptionId ?? undefined);
    if (sent) {
      await prisma.mediaRequest.update({ where: { id: req.id }, data: { status: 'approved' } });
      succeeded++;
    }
  }

  if (succeeded > 0) {
    logEvent('info', 'Request', `${succeeded}/${failed.length} demandes échouées réessayées avec succès`);
  }

  return { retried: failed.length, succeeded };
}
