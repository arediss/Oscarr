import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  getTrending,
  getPopularMovies,
  getPopularTv,
  getUpcomingMovies,
  searchMulti,
  getMovieDetails,
  getTvDetails,
  getMovieRecommendations,
  getTvRecommendations,
  discoverByGenre,
  getCollection,
} from '../services/tmdb.js';
import { parseId, parsePage } from '../utils/params.js';

function getLang(request: FastifyRequest): string {
  return (request.headers['accept-language'] || '').split(',')[0]?.split('-')[0] || 'en';
}

export async function tmdbRoutes(app: FastifyInstance) {
  app.get('/trending', { preHandler: [app.authenticate] }, async (request) => {
    const { page } = request.query as { page?: string };
    return getTrending(parsePage(page), getLang(request));
  });

  app.get('/movies/popular', { preHandler: [app.authenticate] }, async (request) => {
    const { page } = request.query as { page?: string };
    return getPopularMovies(parsePage(page), getLang(request));
  });

  app.get('/tv/popular', { preHandler: [app.authenticate] }, async (request) => {
    const { page } = request.query as { page?: string };
    return getPopularTv(parsePage(page), getLang(request));
  });

  app.get('/movies/upcoming', { preHandler: [app.authenticate] }, async (request) => {
    const { page } = request.query as { page?: string };
    return getUpcomingMovies(parsePage(page), getLang(request));
  });

  app.get('/search', { preHandler: [app.authenticate] }, async (request) => {
    const { q, page } = request.query as { q: string; page?: string };
    if (!q || q.trim().length === 0) {
      return { results: [], total_pages: 0, total_results: 0 };
    }
    return searchMulti(q.trim(), parsePage(page), getLang(request));
  });

  app.get('/movie/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const movieId = parseId(id);
    if (!movieId) return reply.status(400).send({ error: 'Invalid ID' });
    return getMovieDetails(movieId, getLang(request));
  });

  app.get('/tv/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tvId = parseId(id);
    if (!tvId) return reply.status(400).send({ error: 'Invalid ID' });
    return getTvDetails(tvId, getLang(request));
  });

  app.get('/movie/:id/recommendations', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const movieId = parseId(id);
    if (!movieId) return reply.status(400).send({ error: 'Invalid ID' });
    return getMovieRecommendations(movieId, getLang(request));
  });

  app.get('/tv/:id/recommendations', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tvId = parseId(id);
    if (!tvId) return reply.status(400).send({ error: 'Invalid ID' });
    return getTvRecommendations(tvId, getLang(request));
  });

  app.get('/collection/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const collectionId = parseId(id);
    if (!collectionId) return reply.status(400).send({ error: 'Invalid ID' });
    return getCollection(collectionId, getLang(request));
  });

  app.get('/discover/:mediaType/genre/:genreId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { mediaType, genreId } = request.params as { mediaType: string; genreId: string };
    const { page } = request.query as { page?: string };
    if (mediaType !== 'movie' && mediaType !== 'tv') {
      return reply.status(400).send({ error: 'Invalid mediaType' });
    }
    const gid = parseId(genreId);
    if (!gid) return reply.status(400).send({ error: 'Invalid genreId' });
    return discoverByGenre(mediaType, gid, parsePage(page), getLang(request));
  });
}
