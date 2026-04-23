/** TMDB discover query → proxy URL. Mirrored in backend/src/utils/tmdbDiscoverQuery.ts
 *  (keep both in sync — goes away with packages/shared, #139). */

export interface DiscoverQuery {
  mediaType: 'movie' | 'tv';
  genres?: number[];
  releasedWithin?: 'last_30d' | 'last_90d' | 'last_6m' | 'last_1y' | string;
  yearGte?: number;
  yearLte?: number;
  voteAverageGte?: number;
  voteCountGte?: number;
  sortBy?: string;
  language?: string;
  keywords?: string;
  region?: string;
}

export function dateFieldsFor(mediaType: 'movie' | 'tv'): [string, string] {
  return mediaType === 'movie'
    ? ['primary_release_date.gte', 'primary_release_date.lte']
    : ['first_air_date.gte', 'first_air_date.lte'];
}

export function resolveReleaseWindow(value: string, now: Date = new Date()): { gte: string; lte: string } {
  const lte = now.toISOString().split('T')[0];
  let gte: string;
  switch (value) {
    case 'last_30d': gte = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0]; break;
    case 'last_90d': gte = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0]; break;
    case 'last_6m':  gte = new Date(now.getTime() - 180 * 86400000).toISOString().split('T')[0]; break;
    case 'last_1y':  gte = new Date(now.getTime() - 365 * 86400000).toISOString().split('T')[0]; break;
    default: gte = lte;
  }
  return { gte, lte };
}

export function buildDiscoverParams(query: DiscoverQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.genres?.length) params.set('with_genres', query.genres.join(','));

  const [gteField, lteField] = dateFieldsFor(query.mediaType);

  if (query.releasedWithin) {
    const { gte, lte } = resolveReleaseWindow(query.releasedWithin);
    params.set(gteField, gte);
    params.set(lteField, lte);
  } else {
    if (query.yearGte) params.set(gteField, `${query.yearGte}-01-01`);
    if (query.yearLte) params.set(lteField, `${query.yearLte}-12-31`);
  }

  if (query.voteAverageGte) params.set('vote_average.gte', String(query.voteAverageGte));
  if (query.voteCountGte) params.set('vote_count.gte', String(query.voteCountGte));
  if (query.sortBy) params.set('sort_by', query.sortBy);
  if (query.language) params.set('with_original_language', query.language);
  if (query.keywords) params.set('with_keywords', query.keywords);
  if (query.region) params.set('region', query.region);

  return params;
}

/** Full discover URL (routed through the backend TMDB proxy). */
export function buildDiscoverUrl(query: DiscoverQuery): string {
  const params = buildDiscoverParams(query);
  const qs = params.toString();
  return `/tmdb/discover/${query.mediaType}${qs ? `?${qs}` : ''}`;
}
