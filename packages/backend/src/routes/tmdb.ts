import type { FastifyInstance } from 'fastify';
import { listRoutes } from './tmdb/list.js';
import { detailsRoutes } from './tmdb/details.js';
import { discoverRoutes } from './tmdb/discover.js';
import { genreRoutes } from './tmdb/genres.js';

/**
 * /api/tmdb — public read-only TMDB proxy. Split into per-concern submodules so each group of
 * endpoints lives next to the helpers that power it. `list` + `discover` share a `fetchList`
 * abstraction that handles pagination, language, and NSFW flagging once instead of 12× times.
 */
export async function tmdbRoutes(app: FastifyInstance) {
  await app.register(listRoutes);
  await app.register(detailsRoutes);
  await app.register(discoverRoutes);
  await app.register(genreRoutes);
}
