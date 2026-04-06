import { prisma } from '../utils/prisma.js';
import { getRadarrAsync } from './radarr.js';
import { getSonarrAsync } from './sonarr.js';
import { getServiceConfig } from '../utils/services.js';
import { chunk } from '../utils/batch.js';

export async function cleanupOrphanedRequests(): Promise<{ deleted: number }> {
  const result = await prisma.$executeRaw`DELETE FROM MediaRequest WHERE userId NOT IN (SELECT id FROM User) OR mediaId NOT IN (SELECT id FROM Media)`;
  return { deleted: result };
}

interface SyncResult {
  imported: number;
  skipped: number;
  errors: number;
}

function extractUsernameFromTag(label: string): string | null {
  const match = label.match(/^(?:\d+|ndp)\s*-\s*(.+)$/);
  return match ? match[1].trim().toLowerCase() : null;
}

export async function syncRequestsFromTags(): Promise<{ radarr: SyncResult; sonarr: SyncResult }> {
  const users = await prisma.user.findMany({
    select: { id: true, displayName: true, email: true, providers: { select: { providerUsername: true } } },
  });

  const usernameMap = new Map<string, number>();
  for (const u of users) {
    if (u.displayName) usernameMap.set(u.displayName.toLowerCase(), u.id);
    if (u.email) usernameMap.set(u.email.toLowerCase(), u.id);
    for (const p of u.providers) {
      if (p.providerUsername) usernameMap.set(p.providerUsername.toLowerCase(), u.id);
    }
  }

  const radarrResult = await syncRadarrRequests(usernameMap);
  const sonarrResult = await syncSonarrRequests(usernameMap);

  return { radarr: radarrResult, sonarr: sonarrResult };
}

async function syncRadarrRequests(usernameMap: Map<string, number>): Promise<SyncResult> {
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  const radarrConfig = await getServiceConfig('radarr');
  if (!radarrConfig) {
    console.log('[RequestSync] Radarr: no service configured, skipping');
    return { imported: 0, skipped: 0, errors: 0 };
  }

  try {
    const radarr = await getRadarrAsync();
    const [tags, movies] = await Promise.all([
      radarr.getTags(),
      radarr.getMovies(),
    ]);

    // Build tag ID -> userId map
    const tagToUser = new Map<number, number>();
    for (const tag of tags) {
      const username = extractUsernameFromTag(tag.label);
      if (username && usernameMap.has(username)) {
        tagToUser.set(tag.id, usernameMap.get(username)!);
      }
    }

    // Filter to movies with relevant tags
    const taggedMovies = movies.filter(m => m.tags?.some(t => tagToUser.has(t)));
    if (taggedMovies.length === 0) return { imported: 0, skipped: 0, errors: 0 };

    // Bulk fetch media records (chunked for SQLite param limit)
    const tmdbIds = taggedMovies.map(m => m.tmdbId);
    const allMedia: { id: number; tmdbId: number }[] = [];
    for (const batch of chunk(tmdbIds)) {
      const results = await prisma.media.findMany({
        where: { tmdbId: { in: batch }, mediaType: 'movie' },
        select: { id: true, tmdbId: true },
      });
      allMedia.push(...results);
    }
    const mediaByTmdbId = new Map(allMedia.map(m => [m.tmdbId, m]));

    // Bulk fetch existing requests
    const mediaIds = allMedia.map(m => m.id);
    const allRequests: { mediaId: number; userId: number }[] = [];
    for (const batch of chunk(mediaIds)) {
      const results = await prisma.mediaRequest.findMany({
        where: { mediaId: { in: batch } },
        select: { mediaId: true, userId: true },
      });
      allRequests.push(...results);
    }
    const requestSet = new Set(allRequests.map(r => `${r.mediaId}:${r.userId}`));

    // Build batch of new requests
    const toCreate: { mediaId: number; userId: number; mediaType: string; status: string; createdAt?: Date }[] = [];
    for (const movie of taggedMovies) {
      const media = mediaByTmdbId.get(movie.tmdbId);
      if (!media) { skipped++; continue; }

      for (const tagId of movie.tags) {
        const userId = tagToUser.get(tagId);
        if (!userId) continue;

        const key = `${media.id}:${userId}`;
        if (requestSet.has(key)) { skipped++; continue; }

        toCreate.push({
          mediaId: media.id,
          userId,
          mediaType: 'movie',
          status: movie.hasFile ? 'available' : 'approved',
          ...(movie.added ? { createdAt: new Date(movie.added) } : {}),
        });
        requestSet.add(key); // prevent duplicates within this batch
      }
    }

    if (toCreate.length > 0) {
      await prisma.mediaRequest.createMany({ data: toCreate });
      imported = toCreate.length;
    }
  } catch (err) {
    console.error('[RequestSync] Radarr sync failed:', err);
    errors++;
  }

  return { imported, skipped, errors };
}

async function syncSonarrRequests(usernameMap: Map<string, number>): Promise<SyncResult> {
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  const sonarrConfig = await getServiceConfig('sonarr');
  if (!sonarrConfig) {
    console.log('[RequestSync] Sonarr: no service configured, skipping');
    return { imported: 0, skipped: 0, errors: 0 };
  }

  try {
    const sonarr = await getSonarrAsync();
    const [tags, series] = await Promise.all([
      sonarr.getTags(),
      sonarr.getSeries(),
    ]);

    const tagToUser = new Map<number, number>();
    for (const tag of tags) {
      const username = extractUsernameFromTag(tag.label);
      if (username && usernameMap.has(username)) {
        tagToUser.set(tag.id, usernameMap.get(username)!);
      }
    }

    // Filter to series with relevant tags
    const taggedSeries = series.filter(s => s.tags?.some(t => tagToUser.has(t)));
    if (taggedSeries.length === 0) return { imported: 0, skipped: 0, errors: 0 };

    // Bulk fetch media records by tvdbId (chunked)
    const tvdbIds = taggedSeries.map(s => s.tvdbId).filter(Boolean);
    const allMedia: { id: number; tvdbId: number | null; tmdbId: number }[] = [];
    for (const batch of chunk(tvdbIds)) {
      const results = await prisma.media.findMany({
        where: { mediaType: 'tv', OR: [{ tvdbId: { in: batch } }, { tmdbId: { in: batch } }] },
        select: { id: true, tvdbId: true, tmdbId: true },
      });
      allMedia.push(...results);
    }
    const mediaByTvdbId = new Map<number, typeof allMedia[0]>();
    for (const m of allMedia) {
      if (m.tvdbId) mediaByTvdbId.set(m.tvdbId, m);
      if (m.tmdbId) mediaByTvdbId.set(m.tmdbId, m); // fallback tmdbId == tvdbId
    }

    // Bulk fetch existing requests
    const mediaIds = allMedia.map(m => m.id);
    const allRequests: { mediaId: number; userId: number }[] = [];
    for (const batch of chunk(mediaIds)) {
      const results = await prisma.mediaRequest.findMany({
        where: { mediaId: { in: batch } },
        select: { mediaId: true, userId: true },
      });
      allRequests.push(...results);
    }
    const requestSet = new Set(allRequests.map(r => `${r.mediaId}:${r.userId}`));

    // Build batch of new requests
    const toCreate: { mediaId: number; userId: number; mediaType: string; status: string; createdAt?: Date }[] = [];
    for (const show of taggedSeries) {
      const media = mediaByTvdbId.get(show.tvdbId);
      if (!media) { skipped++; continue; }

      for (const tagId of show.tags) {
        const userId = tagToUser.get(tagId);
        if (!userId) continue;

        const key = `${media.id}:${userId}`;
        if (requestSet.has(key)) { skipped++; continue; }

        const stats = show.statistics;
        const status = stats && stats.percentOfEpisodes >= 100 ? 'available'
          : stats && stats.episodeFileCount > 0 ? 'processing'
          : 'approved';

        const addedDate = show.added;
        toCreate.push({
          mediaId: media.id,
          userId,
          mediaType: 'tv',
          status,
          ...(addedDate ? { createdAt: new Date(addedDate) } : {}),
        });
        requestSet.add(key);
      }
    }

    if (toCreate.length > 0) {
      await prisma.mediaRequest.createMany({ data: toCreate });
      imported = toCreate.length;
    }
  } catch (err) {
    console.error('[RequestSync] Sonarr sync failed:', err);
    errors++;
  }

  return { imported, skipped, errors };
}
