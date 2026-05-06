import type { FastifyInstance } from 'fastify';
import {
  searchMulti,
  discoverByGenre,
  discoverMixed,
  getTmdbApi,
} from '../../services/tmdb.js';
import { fetchList } from './helpers.js';

/**
 * Search + discover endpoints. Search goes through TMDB's multi-search; discover is either
 * filtered-by-genre (with optional vote/date/country/keyword modifiers) or a flat passthrough
 * for the homepage query builder (strict param whitelist to prevent property injection).
 */
export async function discoverRoutes(app: FastifyInstance) {
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
    const { q } = request.query as { q: string; page?: string };
    if (!q || q.trim().length === 0) {
      return { results: [], total_pages: 0, total_results: 0, nsfwTmdbIds: [] as number[] };
    }
    return fetchList(request, ({ page, lang }) => searchMulti(q.trim(), page, lang), 'movie');
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
    const { sortBy, voteAverageGte, releaseDateGte, releaseDateLte, originCountry, keyword } = request.query as {
      sortBy?: string; voteAverageGte?: string; releaseDateGte?: string; releaseDateLte?: string; originCountry?: string; keyword?: string;
    };
    if (mediaType !== 'movie' && mediaType !== 'tv' && mediaType !== 'all') {
      return reply.status(400).send({ error: 'Invalid mediaType' });
    }
    const gid = Number.parseInt(genreId, 10);
    if (Number.isNaN(gid) || gid < 0) return reply.status(400).send({ error: 'Invalid genreId' });

    const filters = {
      sortBy,
      voteAverageGte: voteAverageGte ? Number.parseFloat(voteAverageGte) : undefined,
      releaseDateGte,
      releaseDateLte,
      originCountry,
      keyword: keyword ? Number.parseInt(keyword) : undefined,
    };
    return fetchList(
      request,
      ({ page, lang }) => mediaType === 'all'
        ? discoverMixed(page, lang, filters)
        : discoverByGenre(mediaType, gid, page, lang, filters),
      'movie',
    );
  });

  // Flat discover passthrough used by the homepage query builder. No querystring schema —
  // TMDB's discover API takes many params (sort_by, with_genres, vote_average.gte…) and the
  // real gate is the ALLOWED_PARAMS whitelist below; declaring only `page` would mislead
  // readers into thinking other keys are rejected.
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
    // Whitelist allowed TMDB discover params to prevent property injection.
    const ALLOWED_PARAMS = new Set([
      'page', 'sort_by', 'with_genres', 'with_keywords', 'with_original_language',
      'primary_release_date.gte', 'primary_release_date.lte',
      'first_air_date.gte', 'first_air_date.lte',
      'vote_average.gte', 'vote_count.gte', 'region', 'language',
      'include_adult', 'include_video', 'year', 'first_air_date_year',
    ]);
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (value && ALLOWED_PARAMS.has(key)) params[key] = value;
    }
    if (!params.page) params.page = '1';

    // Static path — mediaType already validated, ternary satisfies CodeQL taint analysis.
    const discoverPath = mediaType === 'movie' ? '/discover/movie' : '/discover/tv';

    return fetchList(request, async () => {
      const tmdb = getTmdbApi();
      const { data } = await tmdb.get(discoverPath, { params });
      return data;
    }, mediaType);
  });
}
