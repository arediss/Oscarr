import type { FastifyInstance } from 'fastify';
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

function parsePage(value?: string): number {
  const page = parseInt(value || '1', 10);
  return Number.isNaN(page) || page < 1 ? 1 : page;
}

function parseId(value: string): number | null {
  const id = parseInt(value, 10);
  return Number.isNaN(id) || id < 1 ? null : id;
}

export async function tmdbRoutes(app: FastifyInstance) {
  app.get('/trending', { preHandler: [app.authenticate] }, async (request) => {
    const { page } = request.query as { page?: string };
    return getTrending(parsePage(page));
  });

  app.get('/movies/popular', { preHandler: [app.authenticate] }, async (request) => {
    const { page } = request.query as { page?: string };
    return getPopularMovies(parsePage(page));
  });

  app.get('/tv/popular', { preHandler: [app.authenticate] }, async (request) => {
    const { page } = request.query as { page?: string };
    return getPopularTv(parsePage(page));
  });

  app.get('/movies/upcoming', { preHandler: [app.authenticate] }, async (request) => {
    const { page } = request.query as { page?: string };
    return getUpcomingMovies(parsePage(page));
  });

  app.get('/search', { preHandler: [app.authenticate] }, async (request) => {
    const { q, page } = request.query as { q: string; page?: string };
    if (!q || q.trim().length === 0) {
      return { results: [], total_pages: 0, total_results: 0 };
    }
    return searchMulti(q.trim(), parsePage(page));
  });

  app.get('/movie/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const movieId = parseId(id);
    if (!movieId) return reply.status(400).send({ error: 'ID invalide' });
    return getMovieDetails(movieId);
  });

  app.get('/tv/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tvId = parseId(id);
    if (!tvId) return reply.status(400).send({ error: 'ID invalide' });
    return getTvDetails(tvId);
  });

  app.get('/movie/:id/recommendations', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const movieId = parseId(id);
    if (!movieId) return reply.status(400).send({ error: 'ID invalide' });
    return getMovieRecommendations(movieId);
  });

  app.get('/tv/:id/recommendations', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tvId = parseId(id);
    if (!tvId) return reply.status(400).send({ error: 'ID invalide' });
    return getTvRecommendations(tvId);
  });

  // Collection
  app.get('/collection/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const collectionId = parseId(id);
    if (!collectionId) return reply.status(400).send({ error: 'ID invalide' });
    return getCollection(collectionId);
  });

  // Discover by genre
  app.get('/discover/:mediaType/genre/:genreId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { mediaType, genreId } = request.params as { mediaType: string; genreId: string };
    const { page } = request.query as { page?: string };
    if (mediaType !== 'movie' && mediaType !== 'tv') {
      return reply.status(400).send({ error: 'mediaType invalide' });
    }
    const gid = parseId(genreId);
    if (!gid) return reply.status(400).send({ error: 'genreId invalide' });
    return discoverByGenre(mediaType, gid, parsePage(page));
  });
}
