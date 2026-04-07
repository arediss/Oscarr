import { prisma } from '../../utils/prisma.js';
import { getArrClient } from '../../providers/index.js';
import { type SonarrClient, type SonarrSeries, type SonarrSeason } from '../../providers/sonarr/index.js';
import { logEvent } from '../../utils/logEvent.js';
import { getServiceConfig } from '../../utils/services.js';
import { COMPLETABLE_REQUEST_STATUSES } from '../../utils/requestStatus.js';
import {
  type SyncResult,
  type ImagePaths,
  extractImagePaths,
  extractImagePath,
  getSeriesStatus,
  getSeasonStatus,
  sendAvailabilityNotifications,
} from './helpers.js';

export function buildSonarrOrClauses(tmdbId: number | null, tvdbId: number): Record<string, number>[] {
  const clauses: Record<string, number>[] = [];
  if (tmdbId) clauses.push({ tmdbId });
  if (tvdbId) {
    clauses.push({ tvdbId });
    clauses.push({ tmdbId: -(tvdbId) }); // old negative placeholder
  }
  return clauses;
}

export function buildNonSpecialSeasons(seasons: SonarrSeason[]): SonarrSeason[] {
  return seasons.filter((s) => s.seasonNumber !== 0);
}

export async function upsertSeasons(mediaId: number, seasons: SonarrSeason[]): Promise<void> {
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

export async function createSeasons(mediaId: number, seasons: SonarrSeason[]): Promise<void> {
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

export async function updateExistingShow(
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

export async function createNewShow(
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

export async function processSingleShow(show: SonarrSeries): Promise<'added' | 'updated' | 'skipped'> {
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
    const sonarr = await getArrClient('sonarr') as SonarrClient;
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
