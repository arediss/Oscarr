import { prisma } from '../utils/prisma.js';
import { getRadarrAsync } from './radarr.js';
import { getSonarrAsync } from './sonarr.js';
import { getServiceConfig } from '../utils/services.js';

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
  // Matches both old Overseerr format "ID - username" and new NDP format "ndp - username"
  const match = label.match(/^(?:\d+|ndp)\s*-\s*(.+)$/);
  return match ? match[1].trim().toLowerCase() : null;
}

export async function syncRequestsFromTags(): Promise<{ radarr: SyncResult; sonarr: SyncResult }> {
  const users = await prisma.user.findMany({
    select: { id: true, displayName: true, email: true, providers: { select: { providerUsername: true } } },
  });

  // Build a map of lowercase username -> userId (search by displayName, provider usernames, and email)
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

  // Guard: skip if no Radarr service configured
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

    for (const movie of movies) {
      if (!movie.tags || movie.tags.length === 0) continue;

      // Find which user requested this movie via tags
      for (const tagId of movie.tags) {
        const userId = tagToUser.get(tagId);
        if (!userId) continue;

        try {
          // Find or create media in our DB
          let media = await prisma.media.findUnique({
            where: { tmdbId_mediaType: { tmdbId: movie.tmdbId, mediaType: 'movie' } },
          });

          if (!media) {
            skipped++;
            continue;
          }

          // Check if request already exists
          const existing = await prisma.mediaRequest.findFirst({
            where: { mediaId: media.id, userId },
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Create the request with original added date from Radarr
          await prisma.mediaRequest.create({
            data: {
              mediaId: media.id,
              userId,
              mediaType: 'movie',
              status: movie.hasFile ? 'available' : 'approved',
              createdAt: movie.added ? new Date(movie.added) : undefined,
            },
          });
          imported++;
        } catch (err) {
          errors++;
        }
      }
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

  // Guard: skip if no Sonarr service configured
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

    for (const show of series) {
      if (!show.tags || show.tags.length === 0) continue;

      for (const tagId of show.tags) {
        const userId = tagToUser.get(tagId);
        if (!userId) continue;

        try {
          // Find media by tvdbId
          let media = await prisma.media.findFirst({
            where: {
              mediaType: 'tv',
              OR: [
                { tvdbId: show.tvdbId },
                { tmdbId: show.tvdbId },
              ],
            },
          });

          if (!media) {
            skipped++;
            continue;
          }

          const existing = await prisma.mediaRequest.findFirst({
            where: { mediaId: media.id, userId },
          });

          if (existing) {
            skipped++;
            continue;
          }

          const stats = show.statistics;
          const status = stats && stats.percentOfEpisodes >= 100 ? 'available'
            : stats && stats.episodeFileCount > 0 ? 'processing'
            : 'approved';

          const addedDate = (show as unknown as { added?: string }).added;
          await prisma.mediaRequest.create({
            data: {
              mediaId: media.id,
              userId,
              mediaType: 'tv',
              status,
              createdAt: addedDate ? new Date(addedDate) : undefined,
            },
          });
          imported++;
        } catch (err) {
          errors++;
        }
      }
    }
  } catch (err) {
    console.error('[RequestSync] Sonarr sync failed:', err);
    errors++;
  }

  return { imported, skipped, errors };
}
