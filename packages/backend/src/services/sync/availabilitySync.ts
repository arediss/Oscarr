import { prisma } from '../../utils/prisma.js';
import { getRadarrAsync } from '../radarr.js';
import { getSonarrAsync } from '../sonarr.js';
import { getServiceConfig } from '../../utils/services.js';

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

export async function updateMediaAvailability(
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

export async function syncRadarrAvailability(since?: Date | null): Promise<number> {
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

export async function syncSonarrAvailability(since?: Date | null): Promise<number> {
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
