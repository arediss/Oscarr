import { prisma } from '../../utils/prisma.js';
import { getMovieDetails, getTvDetails, extractKeywords, extractContentRating, type TmdbMovie, type TmdbTv } from '../tmdb.js';
import { logEvent } from '../../utils/logEvent.js';

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 1000;

/** Upsert keywords into the Keyword table and store IDs + content rating on the media row */
/** Keywords auto-tagged as NSFW when first seen */
const AUTO_NSFW_KEYWORDS = new Set([
  'hentai', 'softcore', 'sexploitation',
  'pornography', 'pornographic video', 'adult animation',
]);

async function upsertKeywordsAndRating(
  mediaId: number,
  keywords: { id: number; name: string }[],
  contentRating: string | null,
): Promise<void> {
  for (const kw of keywords) {
    const autoTag = AUTO_NSFW_KEYWORDS.has(kw.name.toLowerCase()) ? 'nsfw' : undefined;
    await prisma.keyword.upsert({
      where: { tmdbId: kw.id },
      update: { name: kw.name },
      create: { tmdbId: kw.id, name: kw.name, ...(autoTag ? { tag: autoTag } : {}) },
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

  logEvent('debug', 'KeywordSync', `${mediasWithoutKeywords.length} media without keywords`);

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
        // Don't poison `keywordIds = '[]'` on transient errors (TMDB 5xx / 429 / network) —
        // that sentinel marks a row as permanently synced-with-no-keywords, blocking retry.
        // Persist the empty sentinel only when TMDB explicitly says "not found" (404 / 422).
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404 || status === 422) {
          await prisma.media.update({
            where: { id: media.id },
            data: { keywordIds: '[]' },
          }).catch((dbErr) => {
            logEvent('warn', 'KeywordSync', `Failed to persist empty-keyword sentinel for "${media.title}": ${String(dbErr)}`);
          });
        }
        errors++;
        logEvent('debug', 'KeywordSync', `Failed for "${media.title}" (tmdb:${media.tmdbId}): ${err}`);
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
    const autoTag = AUTO_NSFW_KEYWORDS.has(kw.name.toLowerCase()) ? 'nsfw' : undefined;
    await prisma.keyword.upsert({
      where: { tmdbId: kw.id },
      update: { name: kw.name },
      create: { tmdbId: kw.id, name: kw.name, ...(autoTag ? { tag: autoTag } : {}) },
    });
  }

  const keywordIds = JSON.stringify(keywords.map((k) => k.id));
  const title = (details as TmdbMovie).title || (details as TmdbTv).name || '';
  const tvdbId = mediaType === 'tv' ? (details.external_ids?.tvdb_id ?? null) : null;

  // For TV: a sync-created placeholder row may exist with `tmdbId = -tvdbId`. Detect it via
  // tvdbId and upgrade in place — doing a plain upsert keyed on positive tmdbId would create a
  // duplicate row, leaving the placeholder orphaned (no sonarrId on the new row, no tmdbId
  // match for batch-status on the old one).
  if (mediaType === 'tv' && tvdbId) {
    const placeholder = await prisma.media.findFirst({
      where: { mediaType: 'tv', tvdbId, tmdbId: { lt: 0 } },
      select: { id: true },
    });
    if (placeholder) {
      // Pre-existing positive-tmdbId row would conflict on the unique (tmdbId, mediaType)
      // index — leave both rows alone in that case (audit step will reconcile).
      const conflict = await prisma.media.findFirst({
        where: { mediaType: 'tv', tmdbId, NOT: { id: placeholder.id } },
        select: { id: true },
      });
      if (!conflict) {
        await prisma.media.update({
          where: { id: placeholder.id },
          data: { tmdbId, keywordIds, contentRating },
        });
        return;
      }
    }
  }

  await prisma.media.upsert({
    where: { tmdbId_mediaType: { tmdbId, mediaType } },
    update: { keywordIds, contentRating, ...(tvdbId ? { tvdbId } : {}) },
    create: {
      tmdbId,
      mediaType,
      title,
      tvdbId,
      posterPath: details.poster_path,
      backdropPath: details.backdrop_path,
      keywordIds,
      contentRating,
    },
  });
}
