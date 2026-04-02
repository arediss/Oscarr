import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  getTrending,
  getPopularMovies,
  getPopularTv,
  getUpcomingMovies,
  getTrendingAnime,
  searchMulti,
  getMovieDetails,
  getTvDetails,
  getMovieRecommendations,
  getTvRecommendations,
  discoverByGenre,
  getCollection,
  getGenreBackdrops,
  extractContentRating,
  isMatureRating,
} from '../services/tmdb.js';
import { trackKeywordsFromDetails } from '../services/keywordSync.js';
import { parseId, parsePage } from '../utils/params.js';

/** For a list of TMDB results, fetch details in parallel (cached), track data, return mature IDs */
async function trackAndFlagMature(
  results: { id: number; media_type?: string; title?: string; name?: string }[],
  defaultMediaType: 'movie' | 'tv',
  lang: string,
): Promise<number[]> {
  const nsfwIds: number[] = [];
  await Promise.allSettled(
    results.slice(0, 20).map(async (item) => {
      const mt = item.name ? 'tv' : item.title ? 'movie' : defaultMediaType;
      const details = mt === 'movie'
        ? await getMovieDetails(item.id, lang)
        : await getTvDetails(item.id, lang);
      await trackKeywordsFromDetails(item.id, mt, details).catch(() => {});
      const rating = extractContentRating(details);
      if (isMatureRating(rating)) nsfwIds.push(item.id);
    }),
  );
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
    return getTrending(parsePage(page), getLang(request));
  });

  app.get('/movies/popular', {
    schema: { querystring: pageQuerySchema },

  }, async (request) => {
    const { page } = request.query as { page?: string };
    return getPopularMovies(parsePage(page), getLang(request));
  });

  app.get('/tv/popular', {
    schema: { querystring: pageQuerySchema },

  }, async (request) => {
    const { page } = request.query as { page?: string };
    return getPopularTv(parsePage(page), getLang(request));
  });

  app.get('/tv/trending-anime', {
    schema: { querystring: pageQuerySchema },

  }, async (request) => {
    const { page } = request.query as { page?: string };
    return getTrendingAnime(parsePage(page), getLang(request));
  });

  app.get('/movies/upcoming', {
    schema: { querystring: pageQuerySchema },

  }, async (request) => {
    const { page } = request.query as { page?: string };
    return getUpcomingMovies(parsePage(page), getLang(request));
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
    return searchMulti(q.trim(), parsePage(page), getLang(request));
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

  app.get('/movie/:id/recommendations', {
    schema: { params: idParamSchema },

  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const movieId = parseId(id);
    if (!movieId) return reply.status(400).send({ error: 'Invalid ID' });
    const lang = getLang(request);
    const data = await getMovieRecommendations(movieId, lang);
    const nsfwTmdbIds = await trackAndFlagMature(data.results || [], 'movie', lang);
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
    const nsfwTmdbIds = await trackAndFlagMature(data.results || [], 'tv', lang);
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
          mediaType: { type: 'string', enum: ['movie', 'tv'], description: 'Type of media to discover' },
          genreId: { type: 'string', description: 'TMDB genre ID' },
        },
      },
      querystring: pageQuerySchema,
    },

  }, async (request, reply) => {
    const { mediaType, genreId } = request.params as { mediaType: string; genreId: string };
    const { page } = request.query as { page?: string };
    if (mediaType !== 'movie' && mediaType !== 'tv') {
      return reply.status(400).send({ error: 'Invalid mediaType' });
    }
    const gid = parseId(genreId);
    if (!gid) return reply.status(400).send({ error: 'Invalid genreId' });
    return discoverByGenre(mediaType, gid, parsePage(page), getLang(request));
  });

  app.get('/genre-backdrops', async () => {
    return getGenreBackdrops();
  });
}
