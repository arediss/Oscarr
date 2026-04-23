import { prisma } from '../../utils/prisma.js';
import { getArrClient } from '../../providers/index.js';
import type { ArrClient, ArrMediaItem } from '../../providers/types.js';
import { getServiceConfig } from '../../utils/services.js';
import { logEvent } from '../../utils/logEvent.js';
import type { SyncResult } from './helpers.js';
import { sendAvailabilityNotifications } from './helpers.js';
import { COMPLETABLE_REQUEST_STATUSES } from '@oscarr/shared';

export async function syncArrService(serviceType: string, since?: Date | null): Promise<SyncResult> {
  const start = Date.now();
  let added = 0, updated = 0, errors = 0;

  const config = await getServiceConfig(serviceType);
  if (!config) {
    logEvent('debug', 'Sync', `${serviceType}: no service configured, skipping`);
    return { added: 0, updated: 0, errors: 0, duration: 0 };
  }

  try {
    const client = await getArrClient(serviceType);
    const allMedia = await client.getAllMedia();

    let filtered = allMedia;
    if (since) {
      const newlyAdded = allMedia.filter(m => m.addedDate && new Date(m.addedDate) > since);
      // Items with file that aren't marked available in DB
      const availableItems = allMedia.filter(m => m.status === 'available');
      const availableExternalIds = new Set(availableItems.map(m => m.externalId));

      const notAvailableInDb = await prisma.media.findMany({
        where: { mediaType: client.mediaType, status: { in: ['unknown', 'pending', 'searching', 'processing', 'upcoming'] } },
        select: { tmdbId: true, tvdbId: true },
      });

      const needsUpdateIds = new Set<number>();
      for (const row of notAvailableInDb) {
        const id = client.mediaType === 'movie' ? row.tmdbId : (row.tvdbId ?? row.tmdbId);
        if (availableExternalIds.has(id)) needsUpdateIds.add(id);
      }

      const toUpdate = availableItems.filter(m => needsUpdateIds.has(m.externalId));
      const combined = new Map<number, ArrMediaItem>();
      for (const m of [...newlyAdded, ...toUpdate]) combined.set(m.externalId, m);
      filtered = [...combined.values()];

      if (needsUpdateIds.size > 0) {
        logEvent('debug', 'Sync', `${serviceType} incremental: ${newlyAdded.length} newly added, ${toUpdate.length} need status update`);
      }
    }

    logEvent('debug', 'Sync', `${serviceType}: ${filtered.length} items to process (${since ? 'incremental' : 'full scan'})`);

    for (const item of filtered) {
      try {
        const result = await processSingleMedia(item, client);
        if (result === 'added') added++;
        else if (result === 'updated') updated++;
      } catch (err) {
        errors++;
        logEvent('debug', 'Sync', `Error processing ${item.title}: ${err}`);
      }
    }

    // Update last sync timestamp
    const syncField = client.mediaType === 'movie' ? 'lastRadarrSync' : 'lastSonarrSync';
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { [syncField]: new Date() },
      create: { id: 1, [syncField]: new Date(), updatedAt: new Date() },
    });
  } catch (err) {
    logEvent('error', 'Sync', `${serviceType} sync failed: ${err}`);
    errors++;
  }

  const duration = Date.now() - start;
  if (added > 0 || updated > 0) {
    logEvent('info', 'Sync', `${serviceType}: +${added} added, ~${updated} updated (${duration}ms)`);
  }
  return { added, updated, errors, duration };
}

async function processSingleMedia(item: ArrMediaItem, client: ArrClient): Promise<'added' | 'updated' | 'skipped'> {
  // Skip items with no valid external ID (e.g. TV shows not yet in TVDB)
  if (client.mediaType === 'tv' && !item.externalId) return 'skipped';

  // Lookup existing media in DB
  let existing;
  if (client.mediaType === 'movie') {
    existing = await prisma.media.findUnique({
      where: { tmdbId_mediaType: { tmdbId: item.externalId, mediaType: 'movie' } },
    });
  } else {
    // TV: search by tvdbId first, then fallback to negative tmdbId placeholder (legacy rows)
    existing = await prisma.media.findFirst({
      where: { mediaType: 'tv', tvdbId: item.externalId },
    });
    if (!existing) {
      existing = await prisma.media.findFirst({
        where: { mediaType: 'tv', tmdbId: -(item.externalId) },
      });
    }
  }

  if (!existing) {
    // Create new media
    if (client.mediaType === 'movie') {
      await prisma.media.create({
        data: {
          tmdbId: item.externalId,
          mediaType: 'movie',
          title: item.title,
          posterPath: item.posterPath,
          backdropPath: item.backdropPath,
          status: item.status,
          radarrId: item.serviceMediaId,
          qualityProfileId: item.qualityProfileId,
          ...(item.status === 'available' ? { availableAt: new Date() } : {}),
        },
      });
    } else {
      const created = await prisma.media.create({
        data: {
          tmdbId: -(item.externalId), // Negative placeholder until real tmdbId is resolved
          tvdbId: item.externalId,
          mediaType: 'tv',
          title: item.title,
          posterPath: item.posterPath,
          backdropPath: item.backdropPath,
          status: item.status,
          sonarrId: item.serviceMediaId,
          qualityProfileId: item.qualityProfileId,
          ...(item.status === 'available' ? { availableAt: new Date() } : {}),
        },
      });
      if (item.seasons?.length) {
        await prisma.season.createMany({
          data: item.seasons
            .filter(s => s.seasonNumber > 0)
            .map(s => ({
              mediaId: created.id,
              seasonNumber: s.seasonNumber,
              episodeCount: s.totalEpisodeCount,
              status: s.status,
            })),
        });
      }
    }
    return 'added';
  }

  const becameAvailable = item.status === 'available' && existing.status !== 'available';
  if (becameAvailable) {
    logEvent('debug', 'Sync', `"${item.title}" (${client.serviceType}:${item.externalId}) status: ${existing.status} -> ${item.status}`);
    sendAvailabilityNotifications(
      existing.title || item.title,
      client.mediaType,
      item.posterPath || existing.posterPath,
      existing.id,
      existing.tmdbId,
    );
  }

  // Build update data — always write back tvdbId and serviceId
  const updateData: Record<string, unknown> = {
    [client.dbIdField]: item.serviceMediaId,
    status: item.status,
    qualityProfileId: item.qualityProfileId,
    title: existing.title || item.title,
    ...(item.posterPath && !existing.posterPath ? { posterPath: item.posterPath } : {}),
    ...(item.backdropPath && !existing.backdropPath ? { backdropPath: item.backdropPath } : {}),
    ...(becameAvailable && !existing.availableAt ? { availableAt: new Date() } : {}),
  };
  // TV: always write tvdbId, fix negative tmdbId placeholder when possible
  if (client.mediaType === 'tv') {
    updateData.tvdbId = item.externalId;
    if (existing.tmdbId < 0) updateData.tmdbId = -(item.externalId); // Keep consistent placeholder
  }

  await prisma.$transaction(async (tx) => {
    await tx.media.update({ where: { id: existing.id }, data: updateData });

    if (becameAvailable) {
      await tx.mediaRequest.updateMany({
        where: { mediaId: existing.id, status: { in: [...COMPLETABLE_REQUEST_STATUSES] } },
        data: { status: 'available' },
      });
    }

    if (client.mediaType === 'tv' && item.seasons?.length) {
      for (const season of item.seasons.filter(s => s.seasonNumber > 0)) {
        await tx.season.upsert({
          where: { mediaId_seasonNumber: { mediaId: existing.id, seasonNumber: season.seasonNumber } },
          update: { episodeCount: season.totalEpisodeCount, status: season.status },
          create: { mediaId: existing.id, seasonNumber: season.seasonNumber, episodeCount: season.totalEpisodeCount, status: season.status },
        });
      }
    }
  });

  return 'updated';
}
