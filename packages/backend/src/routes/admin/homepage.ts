import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { getTmdbApi } from '../../services/tmdb.js';

// ── In-memory cache for public layout endpoint ─────────────────────────────
let homepageLayoutCache: { data: unknown; at: number } | null = null;
const LAYOUT_CACHE_TTL = 60_000; // 1 minute

export function invalidateHomepageLayoutCache(): void {
  homepageLayoutCache = null;
}

export function getDefaultLayout() {
  return [
    { id: 'hero', type: 'builtin', enabled: true, title: 'Hero', builtinKey: 'hero' },
    { id: 'recently_added', type: 'builtin', enabled: true, title: 'home.recently_added', builtinKey: 'recently_added' },
    { id: 'trending', type: 'builtin', enabled: true, title: 'home.trending_week', builtinKey: 'trending', size: 'large' },
    { id: 'popular_movies', type: 'builtin', enabled: true, title: 'home.popular_movies', builtinKey: 'popular_movies' },
    { id: 'popular_tv', type: 'builtin', enabled: true, title: 'home.popular_series', builtinKey: 'popular_tv' },
    { id: 'trending_anime', type: 'builtin', enabled: true, title: 'home.trending_anime', builtinKey: 'trending_anime' },
    { id: 'genres', type: 'builtin', enabled: true, title: 'home.genres', builtinKey: 'genres' },
    { id: 'upcoming', type: 'builtin', enabled: true, title: 'home.coming_soon', builtinKey: 'upcoming' },
  ];
}

export async function getHomepageLayout(): Promise<unknown> {
  const now = Date.now();
  if (homepageLayoutCache && now - homepageLayoutCache.at < LAYOUT_CACHE_TTL) {
    return homepageLayoutCache.data;
  }
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { homepageLayout: true } });
  const layout = settings?.homepageLayout ? JSON.parse(settings.homepageLayout) : getDefaultLayout();
  homepageLayoutCache = { data: layout, at: now };
  return layout;
}

export async function homepageRoutes(app: FastifyInstance) {
  // GET /homepage — Returns the current layout or default
  app.get('/homepage', async () => {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { homepageLayout: true } });
    if (settings?.homepageLayout) {
      return JSON.parse(settings.homepageLayout);
    }
    return getDefaultLayout();
  });

  // PUT /homepage — Save layout (receives JSON array or { sections, reset })
  app.put('/homepage', async (request, reply) => {
    const body = request.body as { sections?: any[]; reset?: boolean } | any[];
    const sections = Array.isArray(body) ? body : body.sections;

    // Handle reset
    if (!Array.isArray(body) && (body as any).reset) {
      await prisma.appSettings.upsert({
        where: { id: 1 },
        update: { homepageLayout: null },
        create: { id: 1, homepageLayout: null, updatedAt: new Date() },
      });
      homepageLayoutCache = null;
      return { ok: true, sections: getDefaultLayout() };
    }

    if (!Array.isArray(sections)) {
      return reply.status(400).send({ error: 'Layout must be an array or { sections: [...] }' });
    }

    // Basic validation: each item must have id, type, enabled, title
    for (const s of sections) {
      if (!s.id || !s.type || typeof s.enabled !== 'boolean' || !s.title) {
        throw new Error('Each section must have id, type, enabled, and title');
      }
    }
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { homepageLayout: JSON.stringify(sections) },
      create: { id: 1, homepageLayout: JSON.stringify(sections), updatedAt: new Date() },
    });
    // Invalidate the public layout cache
    invalidateHomepageLayoutCache();
    return { ok: true };
  });

  // POST /homepage/preview — Preview a TMDB discover query (returns results)
  app.post('/homepage/preview', async (request) => {
    const query = request.body as {
      mediaType: 'movie' | 'tv';
      genres?: number[];
      yearGte?: number;
      yearLte?: number;
      voteAverageGte?: number;
      sortBy?: string;
      language?: string;
      keywords?: string;
      region?: string;
    };

    // Build TMDB discover URL params
    const params = new URLSearchParams();
    params.set('page', '1');
    if (query.genres?.length) params.set('with_genres', query.genres.join(','));
    if (query.yearGte) {
      const dateField = query.mediaType === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
      params.set(dateField, `${query.yearGte}-01-01`);
    }
    if (query.yearLte) {
      const dateField = query.mediaType === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
      params.set(dateField, `${query.yearLte}-12-31`);
    }
    if (query.voteAverageGte) params.set('vote_average.gte', String(query.voteAverageGte));
    if (query.sortBy) params.set('sort_by', query.sortBy);
    if (query.language) params.set('with_original_language', query.language);
    if (query.keywords) params.set('with_keywords', query.keywords);
    if (query.region) params.set('region', query.region);

    const api = getTmdbApi();
    const { data } = await api.get(`/discover/${query.mediaType}`, { params: Object.fromEntries(params) });
    return data;
  });
}
