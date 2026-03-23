import axios from 'axios';
import { getCached, setCache } from '../utils/cache.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = process.env.TMDB_API_KEY;

const SUPPORTED_LANGS = ['en', 'fr'];
const DEFAULT_LANG = 'en';

function normalizeLang(lang?: string): string {
  if (!lang) return DEFAULT_LANG;
  const short = lang.split('-')[0].toLowerCase();
  return SUPPORTED_LANGS.includes(short) ? short : DEFAULT_LANG;
}

function toTmdbLocale(lang: string): string {
  const map: Record<string, string> = { en: 'en-US', fr: 'fr-FR' };
  return map[lang] || 'en-US';
}

function getTmdbApi(lang = DEFAULT_LANG) {
  return axios.create({
    baseURL: TMDB_BASE,
    params: {
      api_key: TMDB_API_KEY,
      language: toTmdbLocale(lang),
    },
  });
}

export interface TmdbCollection {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: TmdbMovie[];
}

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
  belongs_to_collection?: { id: number; name: string; poster_path: string | null; backdrop_path: string | null } | null;
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
  origin_country?: string[];
  original_language?: string;
  seasons?: TmdbSeason[];
  credits?: { cast: TmdbCast[]; crew: TmdbCrew[] };
  external_ids?: { imdb_id: string; tvdb_id: number };
  videos?: { results: TmdbVideo[] };
}

const ANIME_COUNTRIES = ['JP', 'KR', 'CN', 'TW'];
const ANIMATION_GENRE_ID = 16;

export function isAnime(tv: TmdbTv): boolean {
  const isAnimation = tv.genres?.some(g => g.id === ANIMATION_GENRE_ID)
    || tv.genre_ids?.includes(ANIMATION_GENRE_ID)
    || false;

  const isAsianOrigin = tv.origin_country?.some(c => ANIME_COUNTRIES.includes(c))
    || (tv.original_language ? ['ja', 'ko', 'zh'].includes(tv.original_language) : false);

  return isAnimation && isAsianOrigin;
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

async function cachedRequest<T>(cacheKey: string, fetcher: () => Promise<T>, ttlHours = 24): Promise<T> {
  const cached = await getCached<T>(cacheKey);
  if (cached) return cached;
  const data = await fetcher();
  await setCache(cacheKey, data, ttlHours);
  return data;
}

export async function getTrending(page = 1, lang?: string): Promise<{ results: TmdbMediaResult[]; total_pages: number; total_results: number }> {
  const l = normalizeLang(lang);
  return cachedRequest(`trending:all:week:${page}:${l}`, async () => {
    const { data } = await getTmdbApi(l).get('/trending/all/week', { params: { page } });
    return data;
  }, 6);
}

export async function getPopularMovies(page = 1, lang?: string) {
  const l = normalizeLang(lang);
  return cachedRequest(`popular:movies:${page}:${l}`, async () => {
    const { data } = await getTmdbApi(l).get('/movie/popular', { params: { page } });
    return data;
  }, 6);
}

export async function getPopularTv(page = 1, lang?: string) {
  const l = normalizeLang(lang);
  return cachedRequest(`popular:tv:${page}:${l}`, async () => {
    const { data } = await getTmdbApi(l).get('/tv/popular', { params: { page } });
    return data;
  }, 6);
}

export async function getUpcomingMovies(page = 1, lang?: string) {
  const l = normalizeLang(lang);
  return cachedRequest(`upcoming:movies:${page}:${l}`, async () => {
    const { data } = await getTmdbApi(l).get('/movie/upcoming', { params: { page } });
    return data;
  }, 6);
}

export async function searchMulti(query: string, page = 1, lang?: string) {
  const l = normalizeLang(lang);
  return cachedRequest(`search:${query}:${page}:${l}`, async () => {
    const { data } = await getTmdbApi(l).get('/search/multi', { params: { query, page } });
    return data;
  }, 1);
}

export async function getMovieDetails(movieId: number, lang?: string): Promise<TmdbMovie> {
  const l = normalizeLang(lang);
  return cachedRequest(`movie:${movieId}:${l}`, async () => {
    const { data } = await getTmdbApi(l).get(`/movie/${movieId}`, {
      params: { append_to_response: 'credits,external_ids,videos' },
    });
    return data;
  }, 24);
}

export async function getTvDetails(tvId: number, lang?: string): Promise<TmdbTv> {
  const l = normalizeLang(lang);
  return cachedRequest(`tv:${tvId}:${l}`, async () => {
    const { data } = await getTmdbApi(l).get(`/tv/${tvId}`, {
      params: { append_to_response: 'credits,external_ids,videos' },
    });
    return data;
  }, 24);
}

export async function getMovieRecommendations(movieId: number, lang?: string) {
  const l = normalizeLang(lang);
  return cachedRequest(`movie:${movieId}:reco:${l}`, async () => {
    const { data } = await getTmdbApi(l).get(`/movie/${movieId}/recommendations`);
    return data;
  }, 24);
}

export async function getTvRecommendations(tvId: number, lang?: string) {
  const l = normalizeLang(lang);
  return cachedRequest(`tv:${tvId}:reco:${l}`, async () => {
    const { data } = await getTmdbApi(l).get(`/tv/${tvId}/recommendations`);
    return data;
  }, 24);
}

export async function getCollection(collectionId: number, lang?: string): Promise<TmdbCollection> {
  const l = normalizeLang(lang);
  return cachedRequest(`collection:${collectionId}:${l}`, async () => {
    const { data } = await getTmdbApi(l).get(`/collection/${collectionId}`);
    return data;
  }, 48);
}

export async function discoverByGenre(mediaType: 'movie' | 'tv', genreId: number, page = 1, lang?: string) {
  const l = normalizeLang(lang);
  return cachedRequest(`discover:${mediaType}:genre:${genreId}:${page}:${l}`, async () => {
    const { data } = await getTmdbApi(l).get(`/discover/${mediaType}`, {
      params: {
        with_genres: genreId,
        sort_by: 'popularity.desc',
        page,
      },
    });
    return data;
  }, 12);
}
