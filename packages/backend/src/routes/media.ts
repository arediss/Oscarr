import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { getRadarrAsync } from '../services/radarr.js';
import { getSonarrAsync } from '../services/sonarr.js';
import { parseId, parsePage, VALID_MEDIA_TYPES } from '../utils/params.js';
import { isMatureRating } from '../services/tmdb.js';
import { normalizeLanguages } from '../utils/languages.js';
import { COMPLETABLE_REQUEST_STATUSES } from '../utils/requestStatus.js';

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

    // ── Phase 1: DB data (fast, local) ────────────────────────────────
    const cachedAudio: string[] | null = media?.audioLanguages ? JSON.parse(media.audioLanguages) : null;
    const cachedSubs: string[] | null = media?.subtitleLanguages ? JSON.parse(media.subtitleLanguages) : null;

    // ── Phase 2: Live check Radarr/Sonarr (with timeout) ────────────
    interface LiveCheckResult {
      liveAvailable: boolean;
      sonarrSeasonStats: { seasonNumber: number; episodeFileCount: number; episodeCount: number; totalEpisodeCount: number }[] | null;
      audioLanguages: string[] | null;
      subtitleLanguages: string[] | null;
      timedOut?: boolean;
    }

    async function performLiveCheck(): Promise<LiveCheckResult> {
      const result: LiveCheckResult = { liveAvailable: false, sonarrSeasonStats: null, audioLanguages: null, subtitleLanguages: null };
      try {
        if (mediaType === 'movie') {
          const radarr = await getRadarrAsync();
          const radarrMovie = await radarr.getMovieByTmdbId(tmdbIdNum!);
          if (radarrMovie?.hasFile) {
            result.liveAvailable = true;
            if (!cachedAudio) {
              const mi = radarrMovie.movieFile?.mediaInfo;
              if (mi?.audioLanguages) {
                result.audioLanguages = mi.audioLanguages.split('/').map((s) => s.trim()).filter(Boolean);
              } else if (radarrMovie.movieFile?.languages?.length) {
                result.audioLanguages = radarrMovie.movieFile.languages.map((l) => l.name);
              }
              if (mi?.subtitles) {
                result.subtitleLanguages = mi.subtitles.split('/').map((s) => s.trim()).filter(Boolean);
              }
            }
          }
        } else if (mediaType === 'tv') {
          let tvdbId: number | null = media?.tvdbId ?? null;
          if (!tvdbId) {
            const { getTvDetails } = await import('../services/tmdb.js');
            const tmdbData = await getTvDetails(tmdbIdNum!);
            tvdbId = tmdbData.external_ids?.tvdb_id ?? null;
          }
          if (tvdbId) {
            const sonarr = await getSonarrAsync();
            const sonarrSeries = await sonarr.getSeriesByTvdbId(tvdbId);
            if (sonarrSeries) {
              const stats = sonarrSeries.statistics;
              if (stats?.percentOfEpisodes >= 100) {
                result.liveAvailable = true;
              }
              result.sonarrSeasonStats = sonarrSeries.seasons
                .filter((s) => s.seasonNumber > 0)
                .map((s) => ({
                  seasonNumber: s.seasonNumber,
                  episodeFileCount: s.statistics?.episodeFileCount ?? 0,
                  episodeCount: s.statistics?.episodeCount ?? 0,
                  totalEpisodeCount: s.statistics?.totalEpisodeCount ?? 0,
                }));

              if (stats?.episodeFileCount && stats.episodeFileCount > 0 && !cachedAudio) {
                try {
                  const files = await sonarr.getEpisodeFiles(sonarrSeries.id);
                  const audioCounts = new Map<string, number>();
                  const subCounts = new Map<string, number>();
                  for (const f of files) {
                    if (f.mediaInfo?.audioLanguages) {
                      const seen = new Set<string>();
                      for (const l of f.mediaInfo.audioLanguages.split('/')) {
                        const t = l.trim();
                        if (t && !seen.has(t)) { seen.add(t); audioCounts.set(t, (audioCounts.get(t) || 0) + 1); }
                      }
                    }
                    if (f.mediaInfo?.subtitles) {
                      const seen = new Set<string>();
                      for (const l of f.mediaInfo.subtitles.split('/')) {
                        const t = l.trim();
                        if (t && !seen.has(t)) { seen.add(t); subCounts.set(t, (subCounts.get(t) || 0) + 1); }
                      }
                    }
                  }
                  const threshold = Math.max(1, Math.floor(files.length * 0.5));
                  const filteredAudio = [...audioCounts.entries()].filter(([, c]) => c >= threshold).map(([l]) => l);
                  const filteredSubs = [...subCounts.entries()].filter(([, c]) => c >= threshold).map(([l]) => l);
                  if (filteredAudio.length > 0) result.audioLanguages = filteredAudio;
                  if (filteredSubs.length > 0) result.subtitleLanguages = filteredSubs;
                } catch (err) {
                  const status = (err as { response?: { status?: number } })?.response?.status;
                  console.warn(`[Media] Failed to fetch episode files for series ${sonarrSeries.id} (HTTP ${status || 'unknown'}), skipping language data`);
                }
              }
            }
          }
        }
      } catch { /* Radarr/Sonarr unreachable, use DB state */ }
      return result;
    }

    const LIVE_CHECK_TIMEOUT = 4000;
    const liveCheck = await Promise.race([
      performLiveCheck(),
      new Promise<LiveCheckResult>((resolve) =>
        setTimeout(() => resolve({ liveAvailable: false, sonarrSeasonStats: null, audioLanguages: null, subtitleLanguages: null, timedOut: true }), LIVE_CHECK_TIMEOUT)
      ),
    ]);

    const { liveAvailable, sonarrSeasonStats, audioLanguages, subtitleLanguages } = liveCheck;

    // ── Phase 3: Assemble response ──────────────────────────────────
    if (!media) {
      const result: Record<string, unknown> = { exists: false };
      if (liveAvailable) result.status = 'available';
      if (sonarrSeasonStats) result.sonarrSeasons = sonarrSeasonStats;
      if (liveAvailable) result.inLibrary = true;
      if (audioLanguages) result.audioLanguages = normalizeLanguages(audioLanguages);
      if (subtitleLanguages) result.subtitleLanguages = normalizeLanguages(subtitleLanguages);
      return result;
    }

    // Only apply live check side-effects (caching, promotion) when we got a real response
    let finalAudio = cachedAudio;
    let finalSubs = cachedSubs;
    if (!liveCheck.timedOut) {
      const normalizedAudio = audioLanguages ? normalizeLanguages(audioLanguages) : null;
      const normalizedSubs = subtitleLanguages ? normalizeLanguages(subtitleLanguages) : null;

      if ((normalizedAudio || normalizedSubs) && !cachedAudio) {
        const langUpdate: Record<string, string> = {};
        if (normalizedAudio) langUpdate.audioLanguages = JSON.stringify(normalizedAudio);
        if (normalizedSubs) langUpdate.subtitleLanguages = JSON.stringify(normalizedSubs);
        await prisma.media.update({ where: { id: media.id }, data: langUpdate });
      }
      finalAudio = normalizedAudio || cachedAudio;
      finalSubs = normalizedSubs || cachedSubs;

      if (liveAvailable && media.status !== 'available') {
        await prisma.media.update({ where: { id: media.id }, data: { status: 'available', ...(!media.availableAt ? { availableAt: new Date() } : {}) } });
        await prisma.mediaRequest.updateMany({
          where: { mediaId: media.id, status: { in: [...COMPLETABLE_REQUEST_STATUSES] } },
          data: { status: 'available' },
        });
        media.status = 'available';
        media.requests = media.requests.map((r) =>
          (COMPLETABLE_REQUEST_STATUSES as readonly string[]).includes(r.status) ? { ...r, status: 'available' } : r
        );
      }
    }

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
    if (finalAudio) result.audioLanguages = finalAudio;
    if (finalSubs) result.subtitleLanguages = finalSubs;
    if (media.contentRating && isMatureRating(media.contentRating)) result.nsfw = true;
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
        lastEpisodeInfo: true,
      },
    });

    return media.map((m) => ({
      ...m,
      lastEpisodeInfo: m.lastEpisodeInfo ? JSON.parse(m.lastEpisodeInfo) : null,
    }));
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

  // Get episodes for a season from Sonarr
  app.get('/episodes', {
    schema: {
      querystring: {
        type: 'object',
        required: ['tmdbId', 'seasonNumber'],
        properties: {
          tmdbId: { type: 'string', description: 'TMDB ID of the TV series' },
          seasonNumber: { type: 'string', description: 'Season number' },
        },
      },
    },

  }, async (request, reply) => {
    const { tmdbId, seasonNumber } = request.query as { tmdbId: string; seasonNumber: string };
    const tmdbIdNum = parseId(tmdbId);
    const seasonNum = parseInt(seasonNumber, 10);
    if (!tmdbIdNum || isNaN(seasonNum)) return reply.status(400).send({ error: 'Paramètres invalides' });

    // Find the media in our DB to get sonarrId
    const media = await prisma.media.findUnique({
      where: { tmdbId_mediaType: { tmdbId: tmdbIdNum, mediaType: 'tv' } },
    });

    if (!media?.sonarrId) {
      return reply.status(404).send({ error: 'Série non trouvée dans Sonarr' });
    }

    try {
      const sonarr = await getSonarrAsync();
      const episodes = await sonarr.getEpisodes(media.sonarrId, seasonNum);
      return episodes.map((ep) => ({
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        airDateUtc: ep.airDateUtc,
        hasFile: ep.hasFile,
        monitored: ep.monitored,
        quality: ep.episodeFile?.quality?.quality?.name || null,
        size: ep.episodeFile?.size || null,
      }));
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Sonarr' });
    }
  });

  // Get TMDB IDs of all NSFW media (mature rating OR keyword tagged nsfw)
  app.get('/nsfw-ids', async () => {
    const nsfwIds = new Set<number>();

    // 1. Media with mature content ratings
    const ratedMedia = await prisma.media.findMany({
      where: { contentRating: { not: null } },
      select: { tmdbId: true, contentRating: true },
    });
    for (const m of ratedMedia) {
      if (isMatureRating(m.contentRating)) nsfwIds.add(m.tmdbId);
    }

    // 2. Media with keywords tagged "nsfw" by admin
    const nsfwKeywords = await prisma.keyword.findMany({
      where: { tag: 'nsfw' },
      select: { tmdbId: true },
    });
    if (nsfwKeywords.length > 0) {
      const nsfwKwSet = new Set(nsfwKeywords.map((k) => k.tmdbId));
      const mediaWithKeywords = await prisma.media.findMany({
        where: { keywordIds: { not: null } },
        select: { tmdbId: true, keywordIds: true },
      });
      for (const m of mediaWithKeywords) {
        const ids: number[] = JSON.parse(m.keywordIds!);
        if (ids.some((id) => nsfwKwSet.has(id))) nsfwIds.add(m.tmdbId);
      }
    }

    return [...nsfwIds];
  });
}
