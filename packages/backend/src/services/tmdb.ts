import axios from 'axios';
import { getCached, setCache } from '../utils/cache.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

const tmdbApi = axios.create({
  baseURL: TMDB_BASE,
  headers: {
    Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
  },
  params: {
    language: 'fr-FR',
  },
});

export interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  media_type?: string;
  runtime?: number;
  status?: string;
  tagline?: string;
  credits?: { cast: TmdbCast[]; crew: TmdbCrew[] };
  external_ids?: { imdb_id: string; tvdb_id: number };
  videos?: { results: TmdbVideo[] };
}

export interface TmdbTv {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  media_type?: string;
  number_of_seasons: number;
  number_of_episodes: number;
  status?: string;
  seasons?: TmdbSeason[];
  credits?: { cast: TmdbCast[]; crew: TmdbCrew[] };
  external_ids?: { imdb_id: string; tvdb_id: number };
  videos?: { results: TmdbVideo[] };
}

export interface TmdbSeason {
  id: number;
  season_number: number;
  episode_count: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string;
}

export interface TmdbCast {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface TmdbCrew {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TmdbVideo {
  key: string;
  site: string;
  type: string;
  name: string;
}

export type TmdbMediaResult = (TmdbMovie | TmdbTv) & { media_type: string };

export function getImageUrl(path: string | null, size = 'w500'): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

async function cachedRequest<T>(cacheKey: string, fetcher: () => Promise<T>, ttlHours = 24): Promise<T> {
  const cached = await getCached<T>(cacheKey);
  if (cached) return cached;
  const data = await fetcher();
  await setCache(cacheKey, data, ttlHours);
  return data;
}

export async function getTrending(page = 1): Promise<{ results: TmdbMediaResult[]; total_pages: number; total_results: number }> {
  return cachedRequest(`trending:all:week:${page}`, async () => {
    const { data } = await tmdbApi.get('/trending/all/week', { params: { page } });
    return data;
  }, 6);
}

export async function getPopularMovies(page = 1) {
  return cachedRequest(`popular:movies:${page}`, async () => {
    const { data } = await tmdbApi.get('/movie/popular', { params: { page } });
    return data;
  }, 6);
}

export async function getPopularTv(page = 1) {
  return cachedRequest(`popular:tv:${page}`, async () => {
    const { data } = await tmdbApi.get('/tv/popular', { params: { page } });
    return data;
  }, 6);
}

export async function getUpcomingMovies(page = 1) {
  return cachedRequest(`upcoming:movies:${page}`, async () => {
    const { data } = await tmdbApi.get('/movie/upcoming', { params: { page } });
    return data;
  }, 6);
}

export async function searchMulti(query: string, page = 1) {
  return cachedRequest(`search:${query}:${page}`, async () => {
    const { data } = await tmdbApi.get('/search/multi', { params: { query, page } });
    return data;
  }, 1);
}

export async function getMovieDetails(movieId: number): Promise<TmdbMovie> {
  return cachedRequest(`movie:${movieId}`, async () => {
    const { data } = await tmdbApi.get(`/movie/${movieId}`, {
      params: { append_to_response: 'credits,external_ids,videos' },
    });
    return data;
  }, 24);
}

export async function getTvDetails(tvId: number): Promise<TmdbTv> {
  return cachedRequest(`tv:${tvId}`, async () => {
    const { data } = await tmdbApi.get(`/tv/${tvId}`, {
      params: { append_to_response: 'credits,external_ids,videos' },
    });
    return data;
  }, 24);
}

export async function getMovieRecommendations(movieId: number) {
  return cachedRequest(`movie:${movieId}:reco`, async () => {
    const { data } = await tmdbApi.get(`/movie/${movieId}/recommendations`);
    return data;
  }, 24);
}

export async function getTvRecommendations(tvId: number) {
  return cachedRequest(`tv:${tvId}:reco`, async () => {
    const { data } = await tmdbApi.get(`/tv/${tvId}/recommendations`);
    return data;
  }, 24);
}

export async function discoverByGenre(mediaType: 'movie' | 'tv', genreId: number, page = 1) {
  return cachedRequest(`discover:${mediaType}:genre:${genreId}:${page}`, async () => {
    const { data } = await tmdbApi.get(`/discover/${mediaType}`, {
      params: {
        with_genres: genreId,
        sort_by: 'popularity.desc',
        page,
      },
    });
    return data;
  }, 12);
}
