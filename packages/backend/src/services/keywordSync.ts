import { prisma } from '../utils/prisma.js';
import { getMovieDetails, getTvDetails, extractKeywords, type TmdbMovie, type TmdbTv } from './tmdb.js';
import { logEvent } from '../utils/logEvent.js';

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 1000;

/** Upsert keywords into the Keyword table and store IDs on the media row */
export async function upsertKeywordsForMedia(
  mediaId: number,
  keywords: { id: number; name: string }[],
): Promise<void> {
  if (keywords.length === 0) return;

  for (const kw of keywords) {
    await prisma.keyword.upsert({
      where: { tmdbId: kw.id },
      update: { name: kw.name },
      create: { tmdbId: kw.id, name: kw.name },
    });
  }

  await prisma.media.update({
    where: { id: mediaId },
    data: { keywordIds: JSON.stringify(keywords.map((k) => k.id)) },
  });
}

/** Sync keywords for all media that don't have them yet */
export async function syncMissingKeywords(): Promise<{ synced: number; errors: number }> {
  let synced = 0;
  let errors = 0;

  const mediasWithoutKeywords = await prisma.media.findMany({
    where: { keywordIds: null },
    select: { id: true, tmdbId: true, mediaType: true, title: true },
    take: BATCH_SIZE * 5, // Process up to 100 per run
  });

  if (mediasWithoutKeywords.length === 0) return { synced: 0, errors: 0 };

  console.log(`[KeywordSync] ${mediasWithoutKeywords.length} media without keywords`);

  for (let i = 0; i < mediasWithoutKeywords.length; i += BATCH_SIZE) {
    const batch = mediasWithoutKeywords.slice(i, i + BATCH_SIZE);

    for (const media of batch) {
      try {
        const details = media.mediaType === 'movie'
          ? await getMovieDetails(media.tmdbId)
          : await getTvDetails(media.tmdbId);

        const keywords = extractKeywords(details);
        await upsertKeywordsForMedia(media.id, keywords);
        synced++;
      } catch (err) {
        // Mark as empty array to avoid retrying failed lookups
        await prisma.media.update({
          where: { id: media.id },
          data: { keywordIds: '[]' },
        }).catch(() => {});
        errors++;
        console.error(`[KeywordSync] Failed for "${media.title}" (tmdb:${media.tmdbId}):`, err);
      }
    }

    // Rate limit between batches
    if (i + BATCH_SIZE < mediasWithoutKeywords.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  logEvent('info', 'KeywordSync', `Synced keywords: ${synced} ok, ${errors} errors`);
  return { synced, errors };
}

/**
 * Track keywords when a TMDB detail page is viewed.
 * Upserts keywords into the Keyword table and ensures the Media row
 * has keywordIds set (creates a minimal Media entry if needed).
 */
export async function trackKeywordsFromDetails(
  tmdbId: number,
  mediaType: string,
  details: TmdbMovie | TmdbTv,
): Promise<void> {
  const keywords = extractKeywords(details);
  if (keywords.length === 0) return;

  // Upsert keywords into Keyword table
  for (const kw of keywords) {
    await prisma.keyword.upsert({
      where: { tmdbId: kw.id },
      update: { name: kw.name },
      create: { tmdbId: kw.id, name: kw.name },
    });
  }

  const keywordIds = JSON.stringify(keywords.map((k) => k.id));
  const title = (details as TmdbMovie).title || (details as TmdbTv).name || '';

  // Upsert minimal Media record so nsfw-ids endpoint can find it
  await prisma.media.upsert({
    where: { tmdbId_mediaType: { tmdbId, mediaType } },
    update: { keywordIds },
    create: {
      tmdbId,
      mediaType,
      title,
      posterPath: details.poster_path,
      backdropPath: details.backdrop_path,
      keywordIds,
    },
  });
}
