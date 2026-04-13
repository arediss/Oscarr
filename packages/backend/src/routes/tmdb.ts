import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getCached, setCache } from '../utils/cache.js';
import {
  getTrending,
  getPopularMovies,
  getPopularTv,
  getUpcomingMovies,
  getTrendingAnime,
  searchMulti,
  getMovieDetails,
  getTvDetails,
  getPersonDetails,
  getMovieRecommendations,
  getTvRecommendations,
  discoverByGenre,
  discoverMixed,
  getCollection,
  getGenreBackdrops,
  isMatureRating,
  getTmdbApi,
} from '../services/tmdb.js';
import { trackKeywordsFromDetails } from '../services/sync/keywordSync.js';
import { prisma } from '../utils/prisma.js';
import { parseId, parsePage } from '../utils/params.js';

/**
 * Check NSFW status: DB first (fast), TMDB fallback for unknown items (background).
 * Returns NSFW IDs from DB immediately. Items not in DB are checked via TMDB
 * in the background — their NSFW status will be available on the next request.
 */
async function flagNsfwFromDb(
  results: { id: number; media_type?: string; title?: string; name?: string }[],
  defaultMediaType: 'movie' | 'tv',
  lang?: string,
): Promise<number[]> {
  const items = results.slice(0, 20)
    .filter(r => {
      const mt = r.media_type || (r.name ? 'tv' : r.title ? 'movie' : defaultMediaType);
      return mt === 'movie' || mt === 'tv';
    })
    .map(r => ({
      tmdbId: r.id,
      mediaType: (r.media_type === 'movie' || r.media_type === 'tv')
        ? r.media_type
        : (r.name ? 'tv' as const : 'movie' as const),
    }));
  if (items.length === 0) return [];

  // Load NSFW keyword IDs
  const nsfwKeywords = await prisma.keyword.findMany({ where: { tag: 'nsfw' }, select: { tmdbId: true } });
  const nsfwKwSet = new Set(nsfwKeywords.map(k => k.tmdbId));

  // Batch DB lookup
  const METADATA_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
  const mediaRows = await prisma.media.findMany({
    where: { OR: items.map(i => ({ tmdbId: i.tmdbId, mediaType: i.mediaType })) },
    select: { tmdbId: true, mediaType: true, keywordIds: true, contentRating: true, updatedAt: true },
  });

  const nsfwIds: number[] = [];
  const foundTmdbIds = new Set(mediaRows.map(r => `${r.mediaType}:${r.tmdbId}`));
  const now = Date.now();
  const stale: typeof items = [];

  for (const row of mediaRows) {
    if (isMatureRating(row.contentRating)) {
      nsfwIds.push(row.tmdbId);
    } else if (row.keywordIds && nsfwKwSet.size > 0) {
      try {
        const kwIds: number[] = JSON.parse(row.keywordIds);
        if (kwIds.some(id => nsfwKwSet.has(id))) {
          nsfwIds.push(row.tmdbId);
        }
      } catch { /* skip */ }
    }
    // Mark stale or incomplete metadata for background refresh
    if (now - new Date(row.updatedAt).getTime() > METADATA_TTL || row.keywordIds === null) {
      stale.push({ tmdbId: row.tmdbId, mediaType: row.mediaType as 'movie' | 'tv' });
    }
  }

  // Background: fetch TMDB details for items not in DB + stale metadata
  const missing = [
    ...items.filter(i => !foundTmdbIds.has(`${i.mediaType}:${i.tmdbId}`)),
    ...stale,
  ];
  if (missing.length > 0 && lang) {
    void Promise.allSettled(
      missing.map(async (item) => {
        const details = item.mediaType === 'movie'
          ? await getMovieDetails(item.tmdbId, lang)
          : await getTvDetails(item.tmdbId, lang);
        await trackKeywordsFromDetails(item.tmdbId, item.mediaType, details).catch(() => {});
      }),
    );
  }

  return nsfwIds;
}

function getLang(request: FastifyRequest): string {
  return (request.headers['accept-language'] || '').split(',')[0]?.split('-')[0] || 'en';
}

const pageQuerySchema = {
  type: 'object' as const,
  properties: {
    page: { type: 'string', description: 'Page number for pagination (defaults to 1)' },
  },
};

const idParamSchema = {
  type: 'object' as const,
  required: ['id'],
  properties: {
    id: { type: 'string', description: 'TMDB resource ID' },
  },
};

export async function tmdbRoutes(app: FastifyInstance) {
  app.get('/trending', {
    schema: { querystring: pageQuerySchema },

  }, async (request) => {
    const { page } = request.query as { page?: string };
    const lang = getLang(request);
    const data = await getTrending(parsePage(page), lang);
    const nsfwTmdbIds = await flagNsfwFromDb(data.results || [], 'movie', lang).catch(() => []);
    return { ...data, nsfwTmdbIds };
  });

  app.get('/movies/popular', {
    schema: { querystring: pageQuerySchema },

  }, async (request) => {
    const { page } = request.query as { page?: string };
    const lang = getLang(request);
    const data = await getPopularMovies(parsePage(page), lang);
    const nsfwTmdbIds = await flagNsfwFromDb(data.results || [], 'movie', lang).catch(() => []);
    return { ...data, nsfwTmdbIds };
  });

  app.get('/tv/popular', {
    schema: { querystring: pageQuerySchema },

  }, async (request) => {
    const { page } = request.query as { page?: string };
    const lang = getLang(request);
    const data = await getPopularTv(parsePage(page), lang);
    const nsfwTmdbIds = await flagNsfwFromDb(data.results || [], 'tv', lang).catch(() => []);
    return { ...data, nsfwTmdbIds };
  });

  app.get('/tv/trending-anime', {
    schema: { querystring: pageQuerySchema },

  }, async (request) => {
    const { page } = request.query as { page?: string };
    const lang = getLang(request);
    const data = await getTrendingAnime(parsePage(page), lang);
    const nsfwTmdbIds = await flagNsfwFromDb(data.results || [], 'tv', lang).catch(() => []);
    return { ...data, nsfwTmdbIds };
  });

  app.get('/movies/upcoming', {
    schema: { querystring: pageQuerySchema },

  }, async (request) => {
    const { page } = request.query as { page?: string };
    const lang = getLang(request);
    const data = await getUpcomingMovies(parsePage(page), lang);
    const nsfwTmdbIds = await flagNsfwFromDb(data.results || [], 'movie', lang).catch(() => []);
    return { ...data, nsfwTmdbIds };
  });

  app.get('/movies/now_playing', {
    schema: { querystring: pageQuerySchema },
  }, async (request) => {
    const { page } = request.query as { page?: string };
    const lang = getLang(request);
    const tmdb = getTmdbApi();
    const { data } = await tmdb.get(`/movie/now_playing`, { params: { page: parsePage(page), language: lang, region: lang.split('-')[0]?.toUpperCase() || 'US' } });
    const nsfwTmdbIds = await flagNsfwFromDb(data.results || [], 'movie', lang).catch(() => []);
    return { ...data, nsfwTmdbIds };
  });

  app.get('/movies/top_rated', {
    schema: { querystring: pageQuerySchema },
  }, async (request) => {
    const { page } = request.query as { page?: string };
    const lang = getLang(request);
    const tmdb = getTmdbApi();
    const { data } = await tmdb.get(`/movie/top_rated`, { params: { page: parsePage(page), language: lang } });
    const nsfwTmdbIds = await flagNsfwFromDb(data.results || [], 'movie', lang).catch(() => []);
    return { ...data, nsfwTmdbIds };
  });

  app.get('/tv/top_rated', {
    schema: { querystring: pageQuerySchema },
  }, async (request) => {
    const { page } = request.query as { page?: string };
    const lang = getLang(request);
    const tmdb = getTmdbApi();
    const { data } = await tmdb.get(`/tv/top_rated`, { params: { page: parsePage(page), language: lang } });
    const nsfwTmdbIds = await flagNsfwFromDb(data.results || [], 'tv', lang).catch(() => []);
    return { ...data, nsfwTmdbIds };
  });

  app.get('/tv/airing_today', {
    schema: { querystring: pageQuerySchema },
  }, async (request) => {
    const { page } = request.query as { page?: string };
    const lang = getLang(request);
    const tmdb = getTmdbApi();
    const { data } = await tmdb.get(`/tv/airing_today`, { params: { page: parsePage(page), language: lang } });
    const nsfwTmdbIds = await flagNsfwFromDb(data.results || [], 'tv', lang).catch(() => []);
    return { ...data, nsfwTmdbIds };
  });

  app.get('/tv/on_the_air', {
    schema: { querystring: pageQuerySchema },
  }, async (request) => {
    const { page } = request.query as { page?: string };
    const lang = getLang(request);
    const tmdb = getTmdbApi();
    const { data } = await tmdb.get(`/tv/on_the_air`, { params: { page: parsePage(page), language: lang } });
    const nsfwTmdbIds = await flagNsfwFromDb(data.results || [], 'tv', lang).catch(() => []);
    return { ...data, nsfwTmdbIds };
  });

  app.get('/search', {
    schema: {
      querystring: {
        type: 'object' as const,
        required: ['q'],
        properties: {
          q: { type: 'string', description: 'Search query string' },
          page: { type: 'string', description: 'Page number for pagination (defaults to 1)' },
        },
      },
    },

  }, async (request) => {
    const { q, page } = request.query as { q: string; page?: string };
    if (!q || q.trim().length === 0) {
      return { results: [], total_pages: 0, total_results: 0 };
    }
    const lang = getLang(request);
    const data = await searchMulti(q.trim(), parsePage(page), lang);
    const nsfwTmdbIds = await flagNsfwFromDb(data.results || [], 'movie', lang).catch(() => []);
    return { ...data, nsfwTmdbIds };
  });

  app.get('/movie/:id', {
    schema: { params: idParamSchema },

  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const movieId = parseId(id);
    if (!movieId) return reply.status(400).send({ error: 'Invalid ID' });
    const details = await getMovieDetails(movieId, getLang(request));
    trackKeywordsFromDetails(movieId, 'movie', details).catch(() => {});
    return details;
  });

  app.get('/tv/:id', {
    schema: { params: idParamSchema },

  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tvId = parseId(id);
    if (!tvId) return reply.status(400).send({ error: 'Invalid ID' });
    const details = await getTvDetails(tvId, getLang(request));
    trackKeywordsFromDetails(tvId, 'tv', details).catch(() => {});
    return details;
  });

  app.get('/person/:id', {
    schema: { params: idParamSchema },

  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const personId = parseId(id);
    if (!personId) return reply.status(400).send({ error: 'Invalid ID' });
    return getPersonDetails(personId, getLang(request));
  });

  app.get('/movie/:id/recommendations', {
    schema: { params: idParamSchema },

  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const movieId = parseId(id);
    if (!movieId) return reply.status(400).send({ error: 'Invalid ID' });
    const lang = getLang(request);
    const data = await getMovieRecommendations(movieId, lang);
    const nsfwTmdbIds = await flagNsfwFromDb(data.results || [], 'movie', lang).catch(() => []);
    return { ...data, nsfwTmdbIds };
  });

  app.get('/tv/:id/recommendations', {
    schema: { params: idParamSchema },

  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tvId = parseId(id);
    if (!tvId) return reply.status(400).send({ error: 'Invalid ID' });
    const lang = getLang(request);
    const data = await getTvRecommendations(tvId, lang);
    const nsfwTmdbIds = await flagNsfwFromDb(data.results || [], 'tv', lang).catch(() => []);
    return { ...data, nsfwTmdbIds };
  });

  app.get('/collection/:id', {
    schema: { params: idParamSchema },

  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const collectionId = parseId(id);
    if (!collectionId) return reply.status(400).send({ error: 'Invalid ID' });
    return getCollection(collectionId, getLang(request));
  });

  app.get('/discover/:mediaType/genre/:genreId', {
    schema: {
      params: {
        type: 'object' as const,
        required: ['mediaType', 'genreId'],
        properties: {
          mediaType: { type: 'string', enum: ['movie', 'tv', 'all'], description: 'Type of media to discover' },
          genreId: { type: 'string', description: 'TMDB genre ID' },
        },
      },
      querystring: {
        type: 'object' as const,
        properties: {
          page: { type: 'string' },
          sortBy: { type: 'string' },
          voteAverageGte: { type: 'string' },
          releaseDateGte: { type: 'string' },
          releaseDateLte: { type: 'string' },
          originCountry: { type: 'string' },
          keyword: { type: 'string' },
        },
      },
    },

  }, async (request, reply) => {
    const { mediaType, genreId } = request.params as { mediaType: string; genreId: string };
    const { page, sortBy, voteAverageGte, releaseDateGte, releaseDateLte, originCountry, keyword } = request.query as {
      page?: string; sortBy?: string; voteAverageGte?: string; releaseDateGte?: string; releaseDateLte?: string; originCountry?: string; keyword?: string;
    };
    if (mediaType !== 'movie' && mediaType !== 'tv' && mediaType !== 'all') {
      return reply.status(400).send({ error: 'Invalid mediaType' });
    }
    const gid = parseInt(genreId, 10);
    if (isNaN(gid) || gid < 0) return reply.status(400).send({ error: 'Invalid genreId' });
    const lang = getLang(request);
    const filters = {
      sortBy,
      voteAverageGte: voteAverageGte ? parseFloat(voteAverageGte) : undefined,
      releaseDateGte,
      releaseDateLte,
      originCountry,
      keyword: keyword ? parseInt(keyword) : undefined,
    };
    const data = mediaType === 'all'
      ? await discoverMixed(parsePage(page), lang, filters)
      : await discoverByGenre(mediaType, gid, parsePage(page), lang, filters);
    const nsfwTmdbIds = await flagNsfwFromDb(data.results || [], 'movie', lang).catch(() => []);
    return { ...data, nsfwTmdbIds };
  });

  app.get('/genre-backdrops', async () => {
    return getGenreBackdrops();
  });

  // GET /discover/:mediaType — flat discover (for homepage custom sections)
  app.get('/discover/:mediaType', {
    schema: {
      params: {
        type: 'object' as const,
        required: ['mediaType'],
        properties: {
          mediaType: { type: 'string', enum: ['movie', 'tv'], description: 'movie or tv' },
        },
      },
    },
  }, async (request, reply) => {
    const { mediaType } = request.params as { mediaType: string };
    if (mediaType !== 'movie' && mediaType !== 'tv') {
      return reply.status(400).send({ error: 'Invalid mediaType' });
    }
    const query = request.query as Record<string, string>;
    const params: Record<string, string> = {};
    // Pass all query params through to TMDB discover
    for (const [key, value] of Object.entries(query)) {
      if (value) params[key] = value;
    }
    if (!params.page) params.page = '1';

    const tmdbApi = getTmdbApi();
    const { data } = await tmdbApi.get(`/discover/${mediaType}`, { params });
    const lang = getLang(request);
    const nsfwTmdbIds = await flagNsfwFromDb(data.results || [], mediaType, lang).catch(() => []);
    return { ...data, nsfwTmdbIds };
  });

  // Genre list for movie or tv (used by the homepage query builder)
  app.get('/genres/:mediaType', {
    schema: {
      params: {
        type: 'object' as const,
        required: ['mediaType'],
        properties: {
          mediaType: { type: 'string', enum: ['movie', 'tv'], description: 'movie or tv' },
        },
      },
    },
  }, async (request, reply) => {
    const { mediaType } = request.params as { mediaType: string };
    if (mediaType !== 'movie' && mediaType !== 'tv') {
      return reply.status(400).send({ error: 'Invalid mediaType' });
    }
    const lang = getLang(request);
    const cacheKey = `genres:${mediaType}:${lang}`;
    const cached = await getCached<{ genres: { id: number; name: string }[] }>(cacheKey);
    if (cached) return cached;
    const tmdb = getTmdbApi(lang);
    const { data } = await tmdb.get(`/genre/${mediaType}/list`);
    await setCache(cacheKey, data, 24);
    return data;
  });
}
