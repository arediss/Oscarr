import { prisma } from '../utils/prisma.js';
import { radarr, type RadarrMovie } from './radarr.js';
import { sonarr, type SonarrSeries } from './sonarr.js';

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

  try {
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

        if (existing) {
          await prisma.media.update({
            where: { id: existing.id },
            data: {
              radarrId: movie.id,
              status,
              title: existing.title || movie.title,
            },
          });
          updated++;
        } else {
          // We need poster/backdrop from TMDB - use what Radarr provides
          const poster = movie.images?.find((i) => i.coverType === 'poster')?.remoteUrl;
          const fanart = movie.images?.find((i) => i.coverType === 'fanart')?.remoteUrl;
          const posterPath = poster ? extractTmdbPath(poster) : null;
          const backdropPath = fanart ? extractTmdbPath(fanart) : null;

          await prisma.media.create({
            data: {
              tmdbId: movie.tmdbId,
              mediaType: 'movie',
              title: movie.title,
              posterPath,
              backdropPath,
              status,
              radarrId: movie.id,
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
    errors++;
  }

  return { added, updated, errors, duration: Date.now() - start };
}

export async function syncSonarr(since?: Date | null): Promise<SyncResult> {
  const start = Date.now();
  let added = 0;
  let updated = 0;
  let errors = 0;

  try {
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
        // Try to find by tvdbId first, then by tmdbId=tvdbId as fallback
        const existing = await prisma.media.findFirst({
          where: {
            mediaType: 'tv',
            OR: [
              { tvdbId: show.tvdbId },
              { tmdbId: show.tvdbId },
            ],
          },
          include: { seasons: true },
        });

        const status = getSeriesStatus(show);

        if (existing) {
          await prisma.media.update({
            where: { id: existing.id },
            data: {
              sonarrId: show.id,
              tvdbId: show.tvdbId,
              status,
              title: existing.title || show.title,
            },
          });

          // Sync seasons
          for (const season of show.seasons) {
            if (season.seasonNumber === 0) continue;
            const seasonStatus = getSeasonStatus(season);
            await prisma.season.upsert({
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
          }
          updated++;
        } else {
          const poster = show.images?.find((i) => i.coverType === 'poster')?.remoteUrl;
          const fanart = show.images?.find((i) => i.coverType === 'fanart')?.remoteUrl;
          const posterPath = poster ? extractTvdbPosterPath(poster) : null;
          const backdropPath = fanart ? extractTvdbPosterPath(fanart) : null;

          // Use negative tvdbId as tmdbId placeholder to avoid unique constraint conflicts
          // Will be updated with real tmdbId when user views detail page
          const placeholderTmdbId = -(show.tvdbId);

          const media = await prisma.media.create({
            data: {
              tmdbId: placeholderTmdbId,
              tvdbId: show.tvdbId,
              mediaType: 'tv',
              title: show.title,
              posterPath,
              backdropPath,
              status,
              sonarrId: show.id,
            },
          });

          // Create seasons
          for (const season of show.seasons) {
            if (season.seasonNumber === 0) continue;
            await prisma.season.create({
              data: {
                mediaId: media.id,
                seasonNumber: season.seasonNumber,
                episodeCount: season.statistics?.totalEpisodeCount ?? 0,
                status: getSeasonStatus(season),
              },
            });
          }
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
    errors++;
  }

  return { added, updated, errors, duration: Date.now() - start };
}

export async function runFullSync(): Promise<{ radarr: SyncResult; sonarr: SyncResult }> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const [radarrResult, sonarrResult] = await Promise.all([
    syncRadarr(settings?.lastRadarrSync),
    syncSonarr(settings?.lastSonarrSync),
  ]);
  return { radarr: radarrResult, sonarr: sonarrResult };
}

// Auto-sync scheduler
let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startSyncScheduler(intervalHours = 6) {
  if (syncInterval) clearInterval(syncInterval);
  const ms = intervalHours * 60 * 60 * 1000;

  console.log(`[Sync] Scheduler started: syncing every ${intervalHours}h`);

  // Run initial sync after 10 seconds
  setTimeout(() => {
    console.log('[Sync] Running initial sync...');
    runFullSync().then((result) => {
      console.log(`[Sync] Initial sync complete:`, {
        radarr: `+${result.radarr.added} ~${result.radarr.updated} (${result.radarr.duration}ms)`,
        sonarr: `+${result.sonarr.added} ~${result.sonarr.updated} (${result.sonarr.duration}ms)`,
      });
    }).catch((err) => console.error('[Sync] Initial sync failed:', err));
  }, 10_000);

  syncInterval = setInterval(async () => {
    console.log('[Sync] Running scheduled sync...');
    try {
      const result = await runFullSync();
      console.log(`[Sync] Scheduled sync complete:`, {
        radarr: `+${result.radarr.added} ~${result.radarr.updated}`,
        sonarr: `+${result.sonarr.added} ~${result.sonarr.updated}`,
      });
    } catch (err) {
      console.error('[Sync] Scheduled sync failed:', err);
    }
  }, ms);
}

// Helpers

function getMovieStatus(movie: RadarrMovie): string {
  if (movie.hasFile) return 'available';
  if (movie.monitored) return 'processing';
  return 'unknown';
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

function extractTmdbPath(url: string): string | null {
  // Extract /path.jpg from https://image.tmdb.org/t/p/original/path.jpg
  const match = url.match(/\/t\/p\/\w+(\/.+)$/);
  return match ? match[1] : null;
}

function extractTvdbPosterPath(url: string): string | null {
  // For TVDB URLs, we just store the full URL since we can't use TMDB proxy
  // But we'll return null and let the frontend use TMDB lookup instead
  return null;
}
