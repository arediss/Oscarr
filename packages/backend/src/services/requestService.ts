import { prisma } from '../utils/prisma.js';
import { getArrClient, getArrClientForService, getServiceTypeForMedia } from '../providers/index.js';
import { getMovieDetails, getTvDetails } from './tmdb.js';
import { matchFolderRule } from './folderRules.js';
import { logEvent } from '../utils/logEvent.js';
import { getServiceById, getAllServices } from '../utils/services.js';
import { VALID_MEDIA_TYPES } from '../utils/params.js';
import { ACTIVE_REQUEST_STATUSES, COMPLETABLE_REQUEST_STATUSES } from '../utils/requestStatus.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateRequestBody(body: { tmdbId: unknown; mediaType: unknown; seasons?: unknown }): {
  valid: true; tmdbId: number; mediaType: 'movie' | 'tv'; seasons: number[] | undefined;
} | { valid: false; error: string } {
  const { tmdbId, mediaType, seasons } = body;
  if (typeof tmdbId !== 'number' || !Number.isFinite(tmdbId) || tmdbId < 1) {
    return { valid: false, error: 'Invalid tmdbId' };
  }
  if (!VALID_MEDIA_TYPES.includes(mediaType as string)) {
    return { valid: false, error: 'mediaType must be "movie" or "tv"' };
  }
  const validSeasons = Array.isArray(seasons) && seasons.every((s) => typeof s === 'number' && Number.isFinite(s))
    ? (seasons as number[])
    : undefined;
  return { valid: true, tmdbId, mediaType: mediaType as 'movie' | 'tv', seasons: validSeasons };
}

// ---------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------

export async function findOrCreateMedia(tmdbId: number, mediaType: 'movie' | 'tv') {
  const existing = await prisma.media.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType } },
  });
  if (existing) return existing;

  const tmdbData = mediaType === 'movie'
    ? await getMovieDetails(tmdbId)
    : await getTvDetails(tmdbId);

  const title = 'title' in tmdbData ? tmdbData.title : tmdbData.name;
  const releaseDate = 'release_date' in tmdbData ? tmdbData.release_date : tmdbData.first_air_date;

  const media = await prisma.$transaction(async (tx) => {
    const created = await tx.media.create({
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
      await tx.season.createMany({
        data: tmdbData.seasons
          .filter(s => s.season_number > 0)
          .map(s => ({
            mediaId: created.id,
            seasonNumber: s.season_number,
            episodeCount: s.episode_count,
          })),
      });
    }

    return created;
  });

  return media;
}

export async function isBlacklisted(tmdbId: number, mediaType: string): Promise<{ blacklisted: boolean; reason: string | null }> {
  const entry = await prisma.blacklistedMedia.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType } },
  });
  return { blacklisted: !!entry, reason: entry?.reason || null };
}

export async function getUserTagName(userId: number): Promise<string> {
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, email: true } });
  return dbUser?.displayName || dbUser?.email || `user-${userId}`;
}

// ---------------------------------------------------------------------------
// Service dispatch
// ---------------------------------------------------------------------------

interface ServiceContext {
  targetService: { id: number; config: Record<string, string> } | null;
  targetProfileId: number | null;
  defaultProfileId: number | null;
  defaultFolder: string | null | undefined;
  ruleMatch: Awaited<ReturnType<typeof matchFolderRule>>;
}

export async function resolveServiceContext(
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

  const ruleMatch = await matchFolderRule(mediaType, tmdbData, userId, qualityOptionId);
  const defaultFolder = mediaType === 'movie' ? settings?.defaultMovieFolder : settings?.defaultTvFolder;

  let targetServiceId: number | null = ruleMatch?.serviceId ?? null;
  let targetProfileId: number | null = null;

  if (qualityOptionId) {
    const serviceType = getServiceTypeForMedia(mediaType);
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
    const services = await getAllServices(getServiceTypeForMedia(mediaType));
    if (services.length > 0) targetService = services[0];
  }

  return { targetService, targetProfileId, defaultProfileId, defaultFolder, ruleMatch };
}

async function sendToArrService(
  media: { tmdbId: number; tvdbId: number | null; title: string },
  mediaType: string,
  username: string,
  ctx: ServiceContext,
  seasons?: number[],
  rootFolderOverride?: string | null,
) {
  const serviceType = getServiceTypeForMedia(mediaType);
  const client = ctx.targetService
    ? getArrClientForService(ctx.targetService.id, serviceType, ctx.targetService.config)
    : await getArrClient(serviceType);

  // Priority: explicit override > rule match > default folder > first root folder
  const folderPath = rootFolderOverride || ctx.ruleMatch?.folderPath || ctx.defaultFolder
    || (await client.getRootFolders())[0]?.path || client.defaultRootFolder;
  const tagId = await client.getOrCreateTag(username);

  const externalId = mediaType === 'movie' ? media.tmdbId : media.tvdbId;
  if (!externalId) throw new Error(`Missing external ID for ${mediaType} "${media.title}"`);

  const existing = await client.findByExternalId(externalId);
  if (existing) {
    await client.searchMedia(existing.id);
    return;
  }

  const profileId = ctx.targetProfileId ?? ctx.defaultProfileId
    ?? (await client.getQualityProfiles())[0]?.id ?? 1;

  await client.addMedia({
    title: media.title,
    externalId,
    qualityProfileId: profileId,
    rootFolderPath: folderPath,
    tags: [tagId],
    seasons,
    seriesType: ctx.ruleMatch?.seriesType as string | undefined,
  });
}

export async function sendToService(
  media: { tmdbId: number; tvdbId: number | null; title: string },
  mediaType: string,
  username: string,
  userId: number | null = null,
  seasons?: number[],
  qualityOptionId?: number,
  rootFolderOverride?: string | null,
): Promise<boolean> {
  try {
    const ctx = await resolveServiceContext(mediaType as 'movie' | 'tv', media.tmdbId, userId, qualityOptionId);

    // Resolve tvdbId from TMDB if missing
    let resolvedMedia = media;
    if (mediaType === 'tv' && !media.tvdbId) {
      try {
        const tmdbData = await getTvDetails(media.tmdbId);
        const resolvedTvdbId = tmdbData.external_ids?.tvdb_id ?? null;
        if (resolvedTvdbId) {
          resolvedMedia = { ...media, tvdbId: resolvedTvdbId };
          await prisma.media.update({
            where: { tmdbId_mediaType: { tmdbId: media.tmdbId, mediaType: 'tv' } },
            data: { tvdbId: resolvedTvdbId },
          });
        } else {
          logEvent('debug', 'Request', `Cannot send TV request — tvdbId not found in TMDB for "${media.title}"`);
          return false;
        }
      } catch {
        logEvent('debug', 'Request', `Cannot send TV request — failed to resolve tvdbId for "${media.title}"`);
        return false;
      }
    }

    await sendToArrService(resolvedMedia, mediaType, username, ctx, seasons, rootFolderOverride);
    return true;
  } catch (err) {
    logEvent('debug', 'Request', `Failed to send ${mediaType} "${media.title}" to service: ${err}`);
    logEvent('error', 'Request', `Failed to send "${media.title}" to ${getServiceTypeForMedia(mediaType)}: ${String(err)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Collection requests
// ---------------------------------------------------------------------------

export async function requestCollectionMovie(
  movieTmdbId: number,
  user: { id: number; role: string },
): Promise<boolean> {
  const bl = await isBlacklisted(movieTmdbId, 'movie');
  if (bl.blacklisted) return false;

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

  const media = dbMedia ?? await findOrCreateMedia(movieTmdbId, 'movie');

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

// ---------------------------------------------------------------------------
// Status promotion (moved from GET /requests handler)
// ---------------------------------------------------------------------------

export async function promoteStaleStatuses(): Promise<void> {
  await prisma.mediaRequest.updateMany({
    where: {
      status: { in: [...COMPLETABLE_REQUEST_STATUSES] },
      media: { status: 'available' },
    },
    data: { status: 'available' },
  });
}

// ---------------------------------------------------------------------------
// Retry failed requests (called by scheduler)
// ---------------------------------------------------------------------------

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
    logEvent('info', 'Request', `${succeeded}/${failed.length} failed requests retried successfully`);
  }

  return { retried: failed.length, succeeded };
}
