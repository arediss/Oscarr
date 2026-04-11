import { prisma } from '../utils/prisma.js';
import { getArrClient } from '../providers/index.js';
import type { ArrMediaItem } from '../providers/types.js';
import { getServiceConfig } from '../utils/services.js';
import { chunk } from '../utils/batch.js';
import { logEvent } from '../utils/logEvent.js';

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

  const radarrResult = await syncServiceRequests('radarr', usernameMap);
  const sonarrResult = await syncServiceRequests('sonarr', usernameMap);

  return { radarr: radarrResult, sonarr: sonarrResult };
}

async function syncServiceRequests(serviceType: string, usernameMap: Map<string, number>): Promise<SyncResult> {
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  const config = await getServiceConfig(serviceType);
  if (!config) {
    logEvent('debug', 'RequestSync', `${serviceType}: no service configured, skipping`);
    return { imported: 0, skipped: 0, errors: 0 };
  }

  try {
    const client = await getArrClient(serviceType);
    const [tags, allMedia] = await Promise.all([
      client.getTags(),
      client.getAllMedia(),
    ]);

    // Build tag ID -> userId map
    const tagToUser = new Map<number, number>();
    for (const tag of tags) {
      const username = extractUsernameFromTag(tag.label);
      if (username && usernameMap.has(username)) {
        tagToUser.set(tag.id, usernameMap.get(username)!);
      }
    }

    // Filter to media with relevant tags
    const taggedMedia = allMedia.filter(m => m.tags?.some(t => tagToUser.has(t)));
    if (taggedMedia.length === 0) return { imported: 0, skipped: 0, errors: 0 };

    // Bulk fetch DB media records (chunked for SQLite param limit)
    const externalIds = taggedMedia.map(m => m.externalId);
    const idField = client.mediaType === 'movie' ? 'tmdbId' : 'tvdbId';
    const allDbMedia: { id: number; tmdbId: number; tvdbId: number | null }[] = [];
    for (const batch of chunk(externalIds)) {
      const results = await prisma.media.findMany({
        where: { mediaType: client.mediaType, [idField]: { in: batch } },
        select: { id: true, tmdbId: true, tvdbId: true },
      });
      allDbMedia.push(...results);
    }
    const mediaByExternalId = new Map(allDbMedia.map(m => [
      client.mediaType === 'movie' ? m.tmdbId : (m.tvdbId ?? m.tmdbId), m,
    ]));

    // Bulk fetch existing requests
    const mediaIds = allDbMedia.map(m => m.id);
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
    for (const item of taggedMedia) {
      const dbMedia = mediaByExternalId.get(item.externalId);
      if (!dbMedia) { skipped++; continue; }

      for (const tagId of item.tags) {
        const userId = tagToUser.get(tagId);
        if (!userId) continue;

        const key = `${dbMedia.id}:${userId}`;
        if (requestSet.has(key)) { skipped++; continue; }

        const status = item.hasFile ? 'available'
          : item.status === 'processing' ? 'processing'
          : 'approved';

        toCreate.push({
          mediaId: dbMedia.id,
          userId,
          mediaType: client.mediaType,
          status,
          ...(item.addedDate ? { createdAt: new Date(item.addedDate) } : {}),
        });
        requestSet.add(key);
      }
    }

    if (toCreate.length > 0) {
      await prisma.mediaRequest.createMany({ data: toCreate });
      imported = toCreate.length;
    }
  } catch (err) {
    logEvent('debug', 'RequestSync', `${serviceType} sync failed: ${err}`);
    errors++;
  }

  return { imported, skipped, errors };
}
