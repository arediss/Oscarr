import type { FastifyInstance } from 'fastify';
import {
  getTrending,
  getPopularMovies,
  getPopularTv,
  getUpcomingMovies,
  getTrendingAnime,
  getMovieRecommendations,
  getTvRecommendations,
  getTmdbApi,
} from '../../services/tmdb.js';
import { parseId } from '../../utils/params.js';
import { fetchList, pageQuerySchema, idParamSchema } from './helpers.js';

/**
 * Paginated "list" endpoints — always return `{ results, total_pages, total_results }` plus
 * an NSFW ids array flagged from the DB. One-liner per endpoint via `fetchList`.
 */
export async function listRoutes(app: FastifyInstance) {
  const schema = { querystring: pageQuerySchema };

  app.get('/trending', { schema }, (req) =>
    fetchList(req, ({ page, lang }) => getTrending(page, lang), 'movie'),
  );

  app.get('/movies/popular', { schema }, (req) =>
    fetchList(req, ({ page, lang }) => getPopularMovies(page, lang), 'movie'),
  );

  app.get('/tv/popular', { schema }, (req) =>
    fetchList(req, ({ page, lang }) => getPopularTv(page, lang), 'tv'),
  );

  app.get('/tv/trending-anime', { schema }, (req) =>
    fetchList(req, ({ page, lang }) => getTrendingAnime(page, lang), 'tv'),
  );

  app.get('/movies/upcoming', { schema }, (req) =>
    fetchList(req, ({ page, lang }) => getUpcomingMovies(page, lang), 'movie'),
  );

  app.get('/movies/now_playing', { schema }, (req) =>
    fetchList(req, async ({ page, lang }) => {
      const tmdb = getTmdbApi();
      const { data } = await tmdb.get('/movie/now_playing', {
        params: { page, language: lang, region: lang.split('-')[0]?.toUpperCase() || 'US' },
      });
      return data;
    }, 'movie'),
  );

  app.get('/movies/top_rated', { schema }, (req) =>
    fetchList(req, async ({ page, lang }) => {
      const tmdb = getTmdbApi();
      const { data } = await tmdb.get('/movie/top_rated', { params: { page, language: lang } });
      return data;
    }, 'movie'),
  );

  app.get('/tv/top_rated', { schema }, (req) =>
    fetchList(req, async ({ page, lang }) => {
      const tmdb = getTmdbApi();
      const { data } = await tmdb.get('/tv/top_rated', { params: { page, language: lang } });
      return data;
    }, 'tv'),
  );

  app.get('/tv/airing_today', { schema }, (req) =>
    fetchList(req, async ({ page, lang }) => {
      const tmdb = getTmdbApi();
      const { data } = await tmdb.get('/tv/airing_today', { params: { page, language: lang } });
      return data;
    }, 'tv'),
  );

  app.get('/tv/on_the_air', { schema }, (req) =>
    fetchList(req, async ({ page, lang }) => {
      const tmdb = getTmdbApi();
      const { data } = await tmdb.get('/tv/on_the_air', { params: { page, language: lang } });
      return data;
    }, 'tv'),
  );

  app.get('/movie/:id/recommendations', { schema: { params: idParamSchema } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const movieId = parseId(id);
    if (!movieId) return reply.status(400).send({ error: 'Invalid ID' });
    return fetchList(request, ({ lang }) => getMovieRecommendations(movieId, lang), 'movie');
  });

  app.get('/tv/:id/recommendations', { schema: { params: idParamSchema } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tvId = parseId(id);
    if (!tvId) return reply.status(400).send({ error: 'Invalid ID' });
    return fetchList(request, ({ lang }) => getTvRecommendations(tvId, lang), 'tv');
  });
}
