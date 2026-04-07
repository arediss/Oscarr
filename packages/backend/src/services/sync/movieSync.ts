import { prisma } from '../../utils/prisma.js';
import { getArrClient } from '../../providers/index.js';
import { type RadarrClient, type RadarrMovie } from '../../providers/radarr/index.js';
import { logEvent } from '../../utils/logEvent.js';
import { getServiceConfig } from '../../utils/services.js';
import { COMPLETABLE_REQUEST_STATUSES } from '../../utils/requestStatus.js';
import {
  type SyncResult,
  extractImagePaths,
  extractTmdbPath,
  getMovieStatus,
  sendAvailabilityNotifications,
} from './helpers.js';

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
    const radarr = await getArrClient('radarr') as RadarrClient;
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
