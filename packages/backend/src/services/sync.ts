import { prisma } from '../utils/prisma.js';
import { getRadarrAsync, type RadarrMovie } from './radarr.js';
import { getSonarrAsync, type SonarrSeries } from './sonarr.js';
import { sendNotification, logEvent } from './notifications.js';
import { sendUserNotification } from './userNotifications.js';
import { getServiceConfig } from '../utils/services.js';

export interface SyncResult {
  added: number;
  updated: number;
  errors: number;
  duration: number;
}

export async function syncRadarr(since?: Date | null): Promise<SyncResult> {
  const start = Date.now();
  let added = 0;
  let updated = 0;
  let errors = 0;

  // Guard: skip if no Radarr service configured
  const radarrConfig = await getServiceConfig('radarr');
  if (!radarrConfig) {
    console.log('[Sync] Radarr: no service configured, skipping');
    return { added: 0, updated: 0, errors: 0, duration: 0 };
  }

  try {
    const radarr = await getRadarrAsync();
    const movies = await radarr.getMovies();

    // Filter by "added" date if incremental
    const filtered = since
      ? movies.filter((m) => new Date(m.added) > since)
      : movies;

    console.log(`[Sync] Radarr: ${filtered.length} movies to process (${since ? 'incremental since ' + since.toISOString() : 'full scan'})`);

    for (const movie of filtered) {
      try {
        const existing = await prisma.media.findUnique({
          where: { tmdbId_mediaType: { tmdbId: movie.tmdbId, mediaType: 'movie' } },
        });

        const status = getMovieStatus(movie);

        const poster = movie.images?.find((i) => i.coverType === 'poster')?.remoteUrl;
        const fanart = movie.images?.find((i) => i.coverType === 'fanart')?.remoteUrl;
        const posterPath = poster ? extractTmdbPath(poster) : null;
        const backdropPath = fanart ? extractTmdbPath(fanart) : null;

        if (existing) {
          const becameAvailable = status === 'available' && existing.status !== 'available';
          if (becameAvailable) {
            sendNotification('media_available', {
              title: existing.title || movie.title,
              mediaType: 'movie',
              posterPath: posterPath || existing.posterPath,
            }).catch(err => console.error('[Notification] Failed:', err));
            notifyRequesters(existing.id, existing.title || movie.title, 'movie', existing.tmdbId).catch(err => console.error('[UserNotification] Failed:', err));
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
            },
          });
          updated++;
        } else {
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
            },
          });
          added++;
        }
      } catch (err) {
        errors++;
        console.error(`[Sync] Error processing movie ${movie.title}:`, err);
      }
    }

    // Update last sync timestamp
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

export async function syncSonarr(since?: Date | null): Promise<SyncResult> {
  const start = Date.now();
  let added = 0;
  let updated = 0;
  let errors = 0;

  // Guard: skip if no Sonarr service configured
  const sonarrConfig = await getServiceConfig('sonarr');
  if (!sonarrConfig) {
    console.log('[Sync] Sonarr: no service configured, skipping');
    return { added: 0, updated: 0, errors: 0, duration: 0 };
  }

  try {
    const sonarr = await getSonarrAsync();
    const series = await sonarr.getSeries();

    // Sonarr doesn't have an "added" field in the same way, but we can use it
    const filtered = since
      ? series.filter((s) => {
          // Sonarr series don't always have "added" - filter by checking if it's present
          const addedDate = (s as unknown as { added?: string }).added;
          return addedDate ? new Date(addedDate) > since : false;
        })
      : series;

    console.log(`[Sync] Sonarr: ${filtered.length} series to process (${since ? 'incremental since ' + since.toISOString() : 'full scan'})`);

    for (const show of filtered) {
      try {
        // Sonarr gives us tmdbId directly — no need for external API calls
        const tmdbId = show.tmdbId || null;

        // Skip series with neither tmdbId nor tvdbId — can't identify them
        if (!tmdbId && !show.tvdbId) {
          console.warn(`[Sync] Skipping series "${show.title}" — no tmdbId or tvdbId`);
          errors++;
          continue;
        }

        const status = getSeriesStatus(show);
        const poster = show.images?.find((i) => i.coverType === 'poster')?.remoteUrl;
        const fanart = show.images?.find((i) => i.coverType === 'fanart')?.remoteUrl;
        const posterPath = poster ? extractImagePath(poster) : null;
        const backdropPath = fanart ? extractImagePath(fanart) : null;

        // Try to find existing entry: by tmdbId (preferred), tvdbId, or negative placeholder
        const orClauses: Record<string, number>[] = [];
        if (tmdbId) orClauses.push({ tmdbId });
        if (show.tvdbId) {
          orClauses.push({ tvdbId: show.tvdbId });
          orClauses.push({ tmdbId: -(show.tvdbId) }); // old negative placeholder
        }

        const existing = await prisma.media.findFirst({
          where: {
            mediaType: 'tv',
            OR: orClauses,
          },
          include: { seasons: true },
        });

        if (existing) {
          if (status === 'available' && existing.status !== 'available') {
            sendNotification('media_available', {
              title: existing.title || show.title,
              mediaType: 'tv',
              posterPath: posterPath || existing.posterPath,
            }).catch(err => console.error('[Notification] Failed:', err));
            notifyRequesters(existing.id, existing.title || show.title, 'tv', existing.tmdbId).catch(err => console.error('[UserNotification] Failed:', err));
          }
          await prisma.media.update({
            where: { id: existing.id },
            data: {
              sonarrId: show.id,
              tvdbId: show.tvdbId,
              qualityProfileId: show.qualityProfileId,
              // Fix negative placeholder tmdbId with real one from Sonarr
              ...(tmdbId && existing.tmdbId < 0 ? { tmdbId } : {}),
              status,
              title: existing.title || show.title,
              ...(posterPath && !existing.posterPath ? { posterPath } : {}),
              ...(backdropPath && !existing.backdropPath ? { backdropPath } : {}),
            },
          });

          // Sync seasons
          await prisma.$transaction(
            show.seasons
              .filter((s) => s.seasonNumber !== 0)
              .map((season) => {
                const seasonStatus = getSeasonStatus(season);
                return prisma.season.upsert({
                  where: {
                    mediaId_seasonNumber: {
                      mediaId: existing.id,
                      seasonNumber: season.seasonNumber,
                    },
                  },
                  update: {
                    episodeCount: season.statistics?.totalEpisodeCount ?? 0,
                    status: seasonStatus,
                  },
                  create: {
                    mediaId: existing.id,
                    seasonNumber: season.seasonNumber,
                    episodeCount: season.statistics?.totalEpisodeCount ?? 0,
                    status: seasonStatus,
                  },
                });
              })
          );
          updated++;
        } else {
          // New series — use tmdbId from Sonarr, fallback to negative tvdbId placeholder
          const finalTmdbId = tmdbId || (show.tvdbId ? -(show.tvdbId) : 0);

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
            },
          });

          // Create seasons
          await prisma.$transaction(
            show.seasons
              .filter((s) => s.seasonNumber !== 0)
              .map((season) =>
                prisma.season.create({
                  data: {
                    mediaId: media.id,
                    seasonNumber: season.seasonNumber,
                    episodeCount: season.statistics?.totalEpisodeCount ?? 0,
                    status: getSeasonStatus(season),
                  },
                })
              )
          );
          added++;
        }
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

export async function runNewMediaSync(): Promise<{ radarr: SyncResult; sonarr: SyncResult }> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  // Sequential to avoid SQLite write lock contention
  const radarrResult = await syncRadarr(settings?.lastRadarrSync);
  const sonarrResult = await syncSonarr(settings?.lastSonarrSync);
  // Sync availability dates from history since last sync
  const earliestSync = [settings?.lastRadarrSync, settings?.lastSonarrSync]
    .filter(Boolean)
    .sort((a, b) => a!.getTime() - b!.getTime())[0] || null;
  await syncAvailabilityDates(earliestSync);
  return { radarr: radarrResult, sonarr: sonarrResult };
}

export async function runFullSync(): Promise<{ radarr: SyncResult; sonarr: SyncResult }> {
  // Sequential to avoid SQLite write lock contention
  const radarrResult = await syncRadarr(null);
  const sonarrResult = await syncSonarr(null);
  // After full sync, also sync availability dates from history
  await syncAvailabilityDates(null);
  return { radarr: radarrResult, sonarr: sonarrResult };
}

/**
 * Sync availableAt dates from Radarr/Sonarr history.
 * Queries the history API for "imported" events and updates our DB.
 * Only 2 API calls total (1 Radarr + 1 Sonarr), regardless of library size.
 */
export async function syncAvailabilityDates(since?: Date | null): Promise<{ updated: number }> {
  let updated = 0;

  try {
    // Guard: skip if no Radarr service configured
    const radarrCfg = await getServiceConfig('radarr');
    if (!radarrCfg) throw new Error('No Radarr service');
    const radarr = await getRadarrAsync();
    const radarrHistory = await radarr.getHistory(since);

    // Build a map of radarrId → most recent import date
    const radarrDates = new Map<number, Date>();
    for (const record of radarrHistory) {
      const date = new Date(record.date);
      const existing = radarrDates.get(record.movieId);
      if (!existing || date > existing) {
        radarrDates.set(record.movieId, date);
      }
    }

    // Update media records that have a radarrId match and no availableAt yet (or a newer date)
    for (const [radarrId, date] of radarrDates) {
      const result = await prisma.media.updateMany({
        where: {
          radarrId,
          OR: [
            { availableAt: null },
            { availableAt: { lt: date } },
          ],
        },
        data: { availableAt: date },
      });
      updated += result.count;
    }

    console.log(`[Sync] Radarr availability: ${radarrDates.size} history events → ${updated} media updated`);
  } catch (err) {
    console.error('[Sync] Radarr availability sync failed:', err);
  }

  const radarrUpdated = updated;

  try {
    // Guard: skip if no Sonarr service configured
    const sonarrCfg = await getServiceConfig('sonarr');
    if (!sonarrCfg) throw new Error('No Sonarr service');
    const sonarr = await getSonarrAsync();
    const sonarrHistory = await sonarr.getHistory(since);

    // Build a map of sonarrId → most recent import date
    const sonarrDates = new Map<number, Date>();
    for (const record of sonarrHistory) {
      const date = new Date(record.date);
      const existing = sonarrDates.get(record.seriesId);
      if (!existing || date > existing) {
        sonarrDates.set(record.seriesId, date);
      }
    }

    for (const [sonarrId, date] of sonarrDates) {
      const result = await prisma.media.updateMany({
        where: {
          sonarrId,
          OR: [
            { availableAt: null },
            { availableAt: { lt: date } },
          ],
        },
        data: { availableAt: date },
      });
      updated += result.count;
    }

    console.log(`[Sync] Sonarr availability: ${sonarrDates.size} history events → ${updated - radarrUpdated} media updated`);
  } catch (err) {
    console.error('[Sync] Sonarr availability sync failed:', err);
  }

  return { updated };
}

// Helpers

function getMovieStatus(movie: RadarrMovie): string {
  if (movie.hasFile) return 'available';
  if (!movie.monitored) return 'unknown';

  // Check if the movie is released yet
  const now = new Date();
  const digitalRelease = movie.digitalRelease ? new Date(movie.digitalRelease) : null;
  const physicalRelease = movie.physicalRelease ? new Date(movie.physicalRelease) : null;
  const inCinemas = movie.inCinemas ? new Date(movie.inCinemas) : null;
  const releaseDate = movie.releaseDate ? new Date(movie.releaseDate) : null;

  // A movie is "released" for download when digital/physical release is past
  const effectiveRelease = digitalRelease || physicalRelease || releaseDate || inCinemas;

  if (effectiveRelease && effectiveRelease > now) {
    return 'upcoming'; // Not released yet
  }

  return 'searching'; // Released but not yet downloaded
}

function getSeriesStatus(show: SonarrSeries): string {
  const stats = show.statistics;
  if (!stats) return 'unknown';
  if (stats.percentOfEpisodes >= 100) return 'available';
  if (stats.episodeFileCount > 0) return 'processing'; // partially available
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

async function notifyRequesters(mediaId: number, title: string, mediaType: string, tmdbId: number): Promise<void> {
  const requests = await prisma.mediaRequest.findMany({
    where: { mediaId, status: { in: ['approved', 'processing'] } },
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
