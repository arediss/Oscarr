export interface DiscoverFilters {
  sortBy: string;
  voteAverageGte: number;
  releaseYear: number | null;
  hideRequested: boolean;
}

/**
 * Builds the URL search params string for TMDB discover endpoints.
 * Returns an empty string when no active filters are present, or a string
 * starting with `&` that can be appended directly to an existing query string.
 */
export function buildDiscoverParams(f: DiscoverFilters): string {
  const params = new URLSearchParams();
  if (f.sortBy && f.sortBy !== 'popularity.desc') params.set('sortBy', f.sortBy);
  if (f.voteAverageGte > 0) params.set('voteAverageGte', String(f.voteAverageGte));
  if (f.releaseYear != null) {
    params.set('releaseDateGte', `${f.releaseYear}-01-01`);
    params.set('releaseDateLte', `${f.releaseYear}-12-31`);
  }
  const str = params.toString();
  return str ? `&${str}` : '';
}
