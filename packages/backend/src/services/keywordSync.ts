import { prisma } from '../utils/prisma.js';
import { getMovieDetails, getTvDetails, extractKeywords, extractContentRating, type TmdbMovie, type TmdbTv } from './tmdb.js';
import { logEvent } from '../utils/logEvent.js';

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 1000;

/** Upsert keywords into the Keyword table and store IDs + content rating on the media row */
async function upsertKeywordsAndRating(
  mediaId: number,
  keywords: { id: number; name: string }[],
  contentRating: string | null,
): Promise<void> {
  for (const kw of keywords) {
    await prisma.keyword.upsert({
      where: { tmdbId: kw.id },
      update: { name: kw.name },
      create: { tmdbId: kw.id, name: kw.name },
    });
  }

  await prisma.media.update({
    where: { id: mediaId },
    data: {
      keywordIds: JSON.stringify(keywords.map((k) => k.id)),
      contentRating,
    },
  });
}

/** Sync keywords + content ratings for all media that don't have them yet */
export async function syncMissingKeywords(): Promise<{ synced: number; errors: number }> {
  let synced = 0;
  let errors = 0;

  const mediasWithoutKeywords = await prisma.media.findMany({
    where: { keywordIds: null },
    select: { id: true, tmdbId: true, mediaType: true, title: true },
    take: BATCH_SIZE * 5,
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
        const contentRating = await extractContentRating(details);
        await upsertKeywordsAndRating(media.id, keywords, contentRating);
        synced++;
      } catch (err) {
        await prisma.media.update({
          where: { id: media.id },
          data: { keywordIds: '[]' },
        }).catch(() => {});
        errors++;
        console.error(`[KeywordSync] Failed for "${media.title}" (tmdb:${media.tmdbId}):`, err);
      }
    }

    if (i + BATCH_SIZE < mediasWithoutKeywords.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  logEvent('info', 'KeywordSync', `Synced keywords: ${synced} ok, ${errors} errors`);
  return { synced, errors };
}

/**
 * Track keywords + content rating when a TMDB detail page is viewed.
 * Upserts keywords and ensures the Media row has data set.
 */
export async function trackKeywordsFromDetails(
  tmdbId: number,
  mediaType: string,
  details: TmdbMovie | TmdbTv,
): Promise<void> {
  const keywords = extractKeywords(details);
  const contentRating = await extractContentRating(details);

  for (const kw of keywords) {
    await prisma.keyword.upsert({
      where: { tmdbId: kw.id },
      update: { name: kw.name },
      create: { tmdbId: kw.id, name: kw.name },
    });
  }

  const keywordIds = JSON.stringify(keywords.map((k) => k.id));
  const title = (details as TmdbMovie).title || (details as TmdbTv).name || '';

  await prisma.media.upsert({
    where: { tmdbId_mediaType: { tmdbId, mediaType } },
    update: { keywordIds, contentRating },
    create: {
      tmdbId,
      mediaType,
      title,
      posterPath: details.poster_path,
      backdropPath: details.backdrop_path,
      keywordIds,
      contentRating,
    },
  });
}
