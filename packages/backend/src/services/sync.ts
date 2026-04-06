import { prisma } from '../utils/prisma.js';
import { getRadarrAsync, type RadarrMovie } from './radarr.js';
import { getSonarrAsync, type SonarrSeries, type SonarrSeason } from './sonarr.js';
import { notificationRegistry } from '../notifications/index.js';
import { logEvent } from '../utils/logEvent.js';
import { sendUserNotification } from './userNotifications.js';
import { getServiceConfig } from '../utils/services.js';
import { COMPLETABLE_REQUEST_STATUSES } from '../utils/requestStatus.js';

export interface SyncResult {
  added: number;
  updated: number;
  errors: number;
  duration: number;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function extractTmdbPath(url: string): string | null {
  // Extract /path.jpg from https://image.tmdb.org/t/p/original/path.jpg
  const match = url.match(/\/t\/p\/\w+(\/.+?)(?:\?|$)/);
  return match ? match[1] : null;
}

function extractImagePath(url: string): string | null {
  // Try TMDB format first
  const tmdb = extractTmdbPath(url);
  if (tmdb) return tmdb;
  // For TVDB/other URLs, store the full URL as-is
  if (url.startsWith('http')) return url;
  return null;
}

interface ImagePaths {
  posterPath: string | null;
  backdropPath: string | null;
}

function extractImagePaths(
  images: { coverType: string; remoteUrl: string }[] | undefined,
  extractor: (url: string) => string | null,
): ImagePaths {
  const poster = images?.find((i) => i.coverType === 'poster')?.remoteUrl;
  const fanart = images?.find((i) => i.coverType === 'fanart')?.remoteUrl;
  return {
    posterPath: poster ? extractor(poster) : null,
    backdropPath: fanart ? extractor(fanart) : null,
  };
}

async function notifyRequesters(mediaId: number, title: string, mediaType: string, tmdbId: number): Promise<void> {
  const requests = await prisma.mediaRequest.findMany({
    where: { mediaId, status: { in: [...COMPLETABLE_REQUEST_STATUSES] } },
    select: { userId: true },
  });
  for (const req of requests) {
    await sendUserNotification(req.userId, {
      type: 'media_available',
      title,
      message: `"${title}" est maintenant disponible.`,
      metadata: { mediaId, tmdbId, mediaType },
    });
  }
}

function sendAvailabilityNotifications(
  title: string,
  mediaType: 'movie' | 'tv',
  posterPath: string | null,
  mediaId: number,
  tmdbId: number,
): void {
  notificationRegistry.send('media_available', {
    title,
    mediaType,
    posterPath,
  }).catch(err => console.error('[Notification] Failed:', err));

  notifyRequesters(mediaId, title, mediaType, tmdbId)
    .catch(err => console.error('[UserNotification] Failed:', err));
}

// ---------------------------------------------------------------------------
// Movie status
// ---------------------------------------------------------------------------

function getMovieStatus(movie: RadarrMovie): string {
  if (movie.hasFile) return 'available';
  if (!movie.monitored) return 'unknown';

  const now = new Date();
  const digitalRelease = movie.digitalRelease ? new Date(movie.digitalRelease) : null;
  const physicalRelease = movie.physicalRelease ? new Date(movie.physicalRelease) : null;
  const inCinemas = movie.inCinemas ? new Date(movie.inCinemas) : null;
  const releaseDate = movie.releaseDate ? new Date(movie.releaseDate) : null;

  const effectiveRelease = digitalRelease || physicalRelease || releaseDate || inCinemas;
  if (effectiveRelease && effectiveRelease > now) {
    return 'upcoming';
  }
  return 'searching';
}

// ---------------------------------------------------------------------------
// Series / season status
// ---------------------------------------------------------------------------

function getSeriesStatus(show: SonarrSeries): string {
  const stats = show.statistics;
  if (!stats) return 'unknown';
  if (stats.percentOfEpisodes >= 100) return 'available';
  if (stats.episodeFileCount > 0) return 'processing';
  if (show.monitored) return 'pending';
  return 'unknown';
}

function getSeasonStatus(season: { monitored: boolean; statistics?: { percentOfEpisodes: number; episodeFileCount: number } }): string {
  if (!season.statistics) return 'unknown';
  if (season.statistics.percentOfEpisodes >= 100) return 'available';
  if (season.statistics.episodeFileCount > 0) return 'processing';
  if (season.monitored) return 'pending';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Radarr sync
// ---------------------------------------------------------------------------

async function processSingleMovie(movie: RadarrMovie): Promise<'added' | 'updated'> {
  const existing = await prisma.media.findUnique({
    where: { tmdbId_mediaType: { tmdbId: movie.tmdbId, mediaType: 'movie' } },
  });

  const status = getMovieStatus(movie);
  const { posterPath, backdropPath } = extractImagePaths(movie.images, extractTmdbPath);

  if (!existing) {
    await prisma.media.create({
      data: {
        tmdbId: movie.tmdbId,
        mediaType: 'movie',
        title: movie.title,
        posterPath,
        backdropPath,
        status,
        radarrId: movie.id,
        qualityProfileId: movie.qualityProfileId,
        ...(status === 'available' ? { availableAt: new Date() } : {}),
      },
    });
    return 'added';
  }

  const becameAvailable = status === 'available' && existing.status !== 'available';
  if (becameAvailable) {
    console.log(`[Sync] Movie "${movie.title}" (tmdb:${movie.tmdbId}) status: ${existing.status} → ${status}`);

    sendAvailabilityNotifications(
      existing.title || movie.title,
      'movie',
      posterPath || existing.posterPath,
      existing.id,
      existing.tmdbId,
    );
  }

  await prisma.media.update({
    where: { id: existing.id },
    data: {
      radarrId: movie.id,
      status,
      qualityProfileId: movie.qualityProfileId,
      title: existing.title || movie.title,
      ...(posterPath && !existing.posterPath ? { posterPath } : {}),
      ...(backdropPath && !existing.backdropPath ? { backdropPath } : {}),
      ...(becameAvailable && !existing.availableAt ? { availableAt: new Date() } : {}),
    },
  });

  // Sync request statuses when media becomes available
  if (becameAvailable) {
    await prisma.mediaRequest.updateMany({
      where: { mediaId: existing.id, status: { in: [...COMPLETABLE_REQUEST_STATUSES] } },
      data: { status: 'available' },
    });
  }

  return 'updated';
}

export async function syncRadarr(since?: Date | null): Promise<SyncResult> {
  const start = Date.now();
  let added = 0;
  let updated = 0;
  let errors = 0;

  const radarrConfig = await getServiceConfig('radarr');
  if (!radarrConfig) {
    console.log('[Sync] Radarr: no service configured, skipping');
    return { added: 0, updated: 0, errors: 0, duration: 0 };
  }

  try {
    const radarr = await getRadarrAsync();
    const movies = await radarr.getMovies();

    // Incremental: process newly added movies + movies that have a file but aren't marked available in DB
    let filtered = movies;
    if (since) {
      const newlyAdded = movies.filter((m) => new Date(m.added) > since);
      const withFile = movies.filter((m) => m.hasFile);
      const withFileTmdbIds = new Set(withFile.map((m) => m.tmdbId));
      // Query non-available movies from DB first, then intersect with Radarr (avoids SQLite param limit with negation filter)
      const notAvailableInDb = await prisma.media.findMany({
        where: { mediaType: 'movie', status: { in: ['unknown', 'pending', 'searching', 'processing', 'upcoming'] } },
        select: { tmdbId: true, status: true },
      });
      const needsUpdate = new Set(notAvailableInDb.filter((m) => withFileTmdbIds.has(m.tmdbId)).map((m) => m.tmdbId));
      const toUpdate = withFile.filter((m) => needsUpdate.has(m.tmdbId));
      const combined = new Map<number, typeof movies[0]>();
      for (const m of [...newlyAdded, ...toUpdate]) combined.set(m.tmdbId, m);
      filtered = [...combined.values()];
      if (needsUpdate.size > 0) {
        const details = notAvailableInDb.filter((m) => needsUpdate.has(m.tmdbId));
        console.log(`[Sync] Radarr incremental: ${newlyAdded.length} newly added, ${toUpdate.length} need status update (${details.map((m) => `tmdb:${m.tmdbId}[${m.status}]`).join(', ')})`);
      }
    }

    console.log(`[Sync] Radarr: ${filtered.length} movies to process (${since ? 'incremental since ' + since.toISOString() : 'full scan'})`);

    for (const movie of filtered) {
      try {
        const result = await processSingleMovie(movie);
        if (result === 'added') added++;
        else updated++;
      } catch (err) {
        errors++;
        console.error(`[Sync] Error processing movie ${movie.title}:`, err);
      }
    }

    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { lastRadarrSync: new Date() },
      create: { id: 1, lastRadarrSync: new Date(), updatedAt: new Date() },
    });
  } catch (err) {
    console.error('[Sync] Radarr sync failed:', err);
    logEvent('error', 'Sync', `Radarr sync échoué : ${err}`);
    errors++;
  }

  const duration = Date.now() - start;
  if (added > 0 || updated > 0) {
    logEvent('info', 'Sync', `Radarr : +${added} ajoutés, ~${updated} mis à jour (${duration}ms)`);
  }
  return { added, updated, errors, duration };
}

// ---------------------------------------------------------------------------
// Sonarr sync
// ---------------------------------------------------------------------------

function buildSonarrOrClauses(tmdbId: number | null, tvdbId: number): Record<string, number>[] {
  const clauses: Record<string, number>[] = [];
  if (tmdbId) clauses.push({ tmdbId });
  if (tvdbId) {
    clauses.push({ tvdbId });
    clauses.push({ tmdbId: -(tvdbId) }); // old negative placeholder
  }
  return clauses;
}

function buildNonSpecialSeasons(seasons: SonarrSeason[]): SonarrSeason[] {
  return seasons.filter((s) => s.seasonNumber !== 0);
}

async function upsertSeasons(mediaId: number, seasons: SonarrSeason[]): Promise<void> {
  const nonSpecial = buildNonSpecialSeasons(seasons);
  await prisma.$transaction(
    nonSpecial.map((season) => {
      const seasonStatus = getSeasonStatus(season);
      return prisma.season.upsert({
        where: {
          mediaId_seasonNumber: {
            mediaId,
            seasonNumber: season.seasonNumber,
          },
        },
        update: {
          episodeCount: season.statistics?.totalEpisodeCount ?? 0,
          status: seasonStatus,
        },
        create: {
          mediaId,
          seasonNumber: season.seasonNumber,
          episodeCount: season.statistics?.totalEpisodeCount ?? 0,
          status: seasonStatus,
        },
      });
    }),
  );
}

async function createSeasons(mediaId: number, seasons: SonarrSeason[]): Promise<void> {
  const nonSpecial = buildNonSpecialSeasons(seasons);
  await prisma.$transaction(
    nonSpecial.map((season) =>
      prisma.season.create({
        data: {
          mediaId,
          seasonNumber: season.seasonNumber,
          episodeCount: season.statistics?.totalEpisodeCount ?? 0,
          status: getSeasonStatus(season),
        },
      }),
    ),
  );
}

async function updateExistingShow(
  show: SonarrSeries,
  existing: { id: number; title: string; status: string; tmdbId: number; posterPath: string | null; backdropPath: string | null; availableAt: Date | null },
  tmdbId: number | null,
  imagePaths: ImagePaths,
): Promise<void> {
  const status = getSeriesStatus(show);
  const { posterPath, backdropPath } = imagePaths;

  if (status === 'available' && existing.status !== 'available') {
    sendAvailabilityNotifications(
      existing.title || show.title,
      'tv',
      posterPath || existing.posterPath,
      existing.id,
      existing.tmdbId,
    );
  }

  const becameAvailable = status === 'available' && existing.status !== 'available';
  await prisma.media.update({
    where: { id: existing.id },
    data: {
      sonarrId: show.id,
      tvdbId: show.tvdbId,
      qualityProfileId: show.qualityProfileId,
      ...(tmdbId && existing.tmdbId < 0 ? { tmdbId } : {}),
      status,
      title: existing.title || show.title,
      ...(posterPath && !existing.posterPath ? { posterPath } : {}),
      ...(backdropPath && !existing.backdropPath ? { backdropPath } : {}),
      ...(becameAvailable && !existing.availableAt ? { availableAt: new Date() } : {}),
    },
  });

  // Sync request statuses when media becomes available
  if (becameAvailable) {
    await prisma.mediaRequest.updateMany({
      where: { mediaId: existing.id, status: { in: [...COMPLETABLE_REQUEST_STATUSES] } },
      data: { status: 'available' },
    });
  }

  await upsertSeasons(existing.id, show.seasons);
}

async function createNewShow(
  show: SonarrSeries,
  tmdbId: number | null,
  imagePaths: ImagePaths,
): Promise<void> {
  const status = getSeriesStatus(show);
  const finalTmdbId = tmdbId || (show.tvdbId ? -(show.tvdbId) : 0);
  const { posterPath, backdropPath } = imagePaths;

  const media = await prisma.media.create({
    data: {
      tmdbId: finalTmdbId,
      tvdbId: show.tvdbId,
      mediaType: 'tv',
      title: show.title,
      posterPath,
      backdropPath,
      status,
      sonarrId: show.id,
      qualityProfileId: show.qualityProfileId,
      ...(status === 'available' ? { availableAt: new Date() } : {}),
    },
  });

  await createSeasons(media.id, show.seasons);
}

async function processSingleShow(show: SonarrSeries): Promise<'added' | 'updated' | 'skipped'> {
  const tmdbId = show.tmdbId || null;

  if (!tmdbId && !show.tvdbId) {
    console.warn(`[Sync] Skipping series "${show.title}" — no tmdbId or tvdbId`);
    return 'skipped';
  }

  const imagePaths = extractImagePaths(show.images, extractImagePath);
  const orClauses = buildSonarrOrClauses(tmdbId, show.tvdbId);

  const existing = await prisma.media.findFirst({
    where: {
      mediaType: 'tv',
      OR: orClauses,
    },
    include: { seasons: true },
  });

  if (existing) {
    await updateExistingShow(show, existing, tmdbId, imagePaths);
    return 'updated';
  }

  await createNewShow(show, tmdbId, imagePaths);
  return 'added';
}

export async function syncSonarr(since?: Date | null): Promise<SyncResult> {
  const start = Date.now();
  let added = 0;
  let updated = 0;
  let errors = 0;

  const sonarrConfig = await getServiceConfig('sonarr');
  if (!sonarrConfig) {
    console.log('[Sync] Sonarr: no service configured, skipping');
    return { added: 0, updated: 0, errors: 0, duration: 0 };
  }

  try {
    const sonarr = await getSonarrAsync();
    const series = await sonarr.getSeries();

    // Incremental: process newly added series + series that are complete but not marked available in DB
    let filtered = series;
    if (since) {
      const newlyAdded = series.filter((s) => {
        const addedDate = (s as unknown as { added?: string }).added;
        return addedDate ? new Date(addedDate) > since : false;
      });
      const complete = series.filter((s) => s.statistics?.percentOfEpisodes >= 100 || (s.statistics?.episodeFileCount ?? 0) > 0);
      const completeTvdbIds = new Set(complete.map((s) => s.tvdbId).filter(Boolean));
      // Query non-available/non-processing shows from DB first, then intersect (avoids SQLite param limit with negation filter)
      const notAvailableInDb = await prisma.media.findMany({
        where: { mediaType: 'tv', status: { in: ['unknown', 'pending', 'searching'] } },
        select: { tvdbId: true },
      });
      const needsUpdate = new Set(notAvailableInDb.filter((m) => m.tvdbId && completeTvdbIds.has(m.tvdbId)).map((m) => m.tvdbId));
      const toUpdate = complete.filter((s) => needsUpdate.has(s.tvdbId));
      const combined = new Map<number, typeof series[0]>();
      for (const s of [...newlyAdded, ...toUpdate]) combined.set(s.id, s);
      filtered = [...combined.values()];
    }

    console.log(`[Sync] Sonarr: ${filtered.length} series to process (${since ? 'incremental since ' + since.toISOString() : 'full scan'})`);

    for (const show of filtered) {
      try {
        const result = await processSingleShow(show);
        if (result === 'added') added++;
        else if (result === 'updated') updated++;
        else errors++; // skipped due to missing IDs
      } catch (err) {
        errors++;
        console.error(`[Sync] Error processing series ${show.title}:`, err);
      }
    }

    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { lastSonarrSync: new Date() },
      create: { id: 1, lastSonarrSync: new Date(), updatedAt: new Date() },
    });
  } catch (err) {
    console.error('[Sync] Sonarr sync failed:', err);
    logEvent('error', 'Sync', `Sonarr sync échoué : ${err}`);
    errors++;
  }

  const duration = Date.now() - start;
  if (added > 0 || updated > 0) {
    logEvent('info', 'Sync', `Sonarr : +${added} ajoutés, ~${updated} mis à jour (${duration}ms)`);
  }
  return { added, updated, errors, duration };
}

// ---------------------------------------------------------------------------
// Full / incremental sync orchestrators
// ---------------------------------------------------------------------------

export async function runNewMediaSync(): Promise<{ radarr: SyncResult; sonarr: SyncResult }> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  // Sequential to avoid SQLite write lock contention
  const radarrResult = await syncRadarr(settings?.lastRadarrSync);
  const sonarrResult = await syncSonarr(settings?.lastSonarrSync);
  // Sync availability dates from history since last sync
  const earliestSync = [settings?.lastRadarrSync, settings?.lastSonarrSync]
    .filter(Boolean)
    .sort((a, b) => a!.getTime() - b!.getTime())[0] || null;
  const avail = await syncAvailabilityDates(earliestSync);
  radarrResult.updated += avail.radarrUpdated;
  sonarrResult.updated += avail.sonarrUpdated;
  return { radarr: radarrResult, sonarr: sonarrResult };
}

export async function runFullSync(): Promise<{ radarr: SyncResult; sonarr: SyncResult }> {
  // Sequential to avoid SQLite write lock contention
  const radarrResult = await syncRadarr(null);
  const sonarrResult = await syncSonarr(null);
  // After full sync, also sync availability dates from history
  const avail = await syncAvailabilityDates(null);
  radarrResult.updated += avail.radarrUpdated;
  sonarrResult.updated += avail.sonarrUpdated;
  return { radarr: radarrResult, sonarr: sonarrResult };
}

// ---------------------------------------------------------------------------
// Availability date sync
// ---------------------------------------------------------------------------

interface HistoryDateMap {
  dates: Map<number, Date>;
}

interface SonarrHistoryEntry {
  id: number;
  date: Date;
  episode?: { season: number; episode: number; title: string };
}

interface SonarrHistoryDateMap {
  entries: Map<number, SonarrHistoryEntry>;
}

function buildRadarrDateMap(
  history: { date: string; movieId: number }[],
): HistoryDateMap {
  const dates = new Map<number, Date>();
  for (const record of history) {
    const date = new Date(record.date);
    const existing = dates.get(record.movieId);
    if (!existing || date > existing) {
      dates.set(record.movieId, date);
    }
  }
  return { dates };
}

function buildSonarrDateMap(
  history: { date: string; seriesId: number; episode?: { seasonNumber: number; episodeNumber: number; title: string } }[],
): SonarrHistoryDateMap {
  const entries = new Map<number, SonarrHistoryEntry>();
  for (const record of history) {
    const date = new Date(record.date);
    const existing = entries.get(record.seriesId);
    if (!existing || date > existing.date) {
      entries.set(record.seriesId, {
        id: record.seriesId,
        date,
        episode: record.episode ? {
          season: record.episode.seasonNumber,
          episode: record.episode.episodeNumber,
          title: record.episode.title,
        } : undefined,
      });
    }
  }
  return { entries };
}

async function updateMediaAvailability(
  idField: 'radarrId' | 'sonarrId',
  entityId: number,
  date: Date,
  extraData?: Record<string, unknown>,
): Promise<number> {
  const result = await prisma.media.updateMany({
    where: {
      [idField]: entityId,
      OR: [
        { availableAt: null },
        { availableAt: { lt: date } },
      ],
    },
    data: {
      availableAt: date,
      ...extraData,
    },
  });
  return result.count;
}

async function syncRadarrAvailability(since?: Date | null): Promise<number> {
  const radarrCfg = await getServiceConfig('radarr');
  if (!radarrCfg) throw new Error('No Radarr service');

  const radarr = await getRadarrAsync();
  const radarrHistory = await radarr.getHistory(since);
  const { dates } = buildRadarrDateMap(radarrHistory);

  let updated = 0;
  for (const [radarrId, date] of dates) {
    updated += await updateMediaAvailability('radarrId', radarrId, date);
  }

  console.log(`[Sync] Radarr availability: ${dates.size} history events → ${updated} media updated`);
  return updated;
}

async function syncSonarrAvailability(since?: Date | null): Promise<number> {
  const sonarrCfg = await getServiceConfig('sonarr');
  if (!sonarrCfg) throw new Error('No Sonarr service');

  const sonarr = await getSonarrAsync();
  const sonarrHistory = await sonarr.getHistory(since);
  const { entries } = buildSonarrDateMap(sonarrHistory);

  let updated = 0;
  for (const [sonarrId, { date, episode }] of entries) {
    const extraData = episode ? { lastEpisodeInfo: JSON.stringify(episode) } : {};
    updated += await updateMediaAvailability('sonarrId', sonarrId, date, extraData);
  }

  console.log(`[Sync] Sonarr availability: ${entries.size} history events → ${updated} media updated`);
  return updated;
}

/**
 * Sync availableAt dates from Radarr/Sonarr history.
 * Queries the history API for "imported" events and updates our DB.
 * Only 2 API calls total (1 Radarr + 1 Sonarr), regardless of library size.
 */
export async function syncAvailabilityDates(since?: Date | null): Promise<{ radarrUpdated: number; sonarrUpdated: number }> {
  let radarrUpdated = 0;
  let sonarrUpdated = 0;

  try {
    radarrUpdated = await syncRadarrAvailability(since);
  } catch (err) {
    console.error('[Sync] Radarr availability sync failed:', err);
  }

  try {
    sonarrUpdated = await syncSonarrAvailability(since);
  } catch (err) {
    console.error('[Sync] Sonarr availability sync failed:', err);
  }

  return { radarrUpdated, sonarrUpdated };
}
