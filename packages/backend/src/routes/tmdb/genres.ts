import type { FastifyInstance } from 'fastify';
import { getCached, setCache } from '../../utils/cache.js';
import { getGenreBackdrops, getTmdbApi } from '../../services/tmdb.js';
import { getLang } from './helpers.js';

/**
 * Genre metadata — hero backdrops for the homepage + the per-mediaType genre list used by the
 * admin's section query builder. Genre list is cached 24h per lang (TMDB genre ids are stable
 * but the localized names aren't).
 */
export async function genreRoutes(app: FastifyInstance) {
  app.get('/genre-backdrops', async () => getGenreBackdrops());

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
