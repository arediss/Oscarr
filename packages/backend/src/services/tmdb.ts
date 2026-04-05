import axios from 'axios';
import { getCached, setCache } from '../utils/cache.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_DEFAULT_KEY = 'db55323b8d3e4154498498a75642b381';
const TMDB_API_KEY = process.env.TMDB_API_KEY || TMDB_DEFAULT_KEY;

import { prisma } from '../utils/prisma.js';

const DEFAULT_LANG = 'en';

/** Get instance languages from AppSettings, cached for 5 min */
let _cachedLangs: string[] | null = null;
let _cachedAt = 0;
export async function getInstanceLanguages(): Promise<string[]> {
  if (_cachedLangs && Date.now() - _cachedAt < 300_000) return _cachedLangs;
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { instanceLanguages: true } });
  const parsed: string[] = settings?.instanceLanguages ? JSON.parse(settings.instanceLanguages) : ['en'];
  _cachedLangs = parsed.includes('en') ? parsed : [...parsed, 'en'];
  _cachedAt = Date.now();
  return _cachedLangs!;
}

function normalizeLang(lang?: string): string {
  const supported = _cachedLangs || ['en'];
  if (!lang) return supported[0] || DEFAULT_LANG;
  const short = lang.split('-')[0].toLowerCase();
  return supported.includes(short) ? short : supported[0] || DEFAULT_LANG;
}

const LANG_TO_LOCALE: Record<string, string> = {
  en: 'en-US', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', it: 'it-IT',
  pt: 'pt-BR', ru: 'ru-RU', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN',
  nl: 'nl-NL', sv: 'sv-SE', da: 'da-DK', no: 'nb-NO', fi: 'fi-FI',
  pl: 'pl-PL', tr: 'tr-TR', ar: 'ar-SA', hi: 'hi-IN', th: 'th-TH',
};

const LANG_TO_COUNTRY: Record<string, string> = {
  en: 'US', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', pt: 'BR',
  ru: 'RU', ja: 'JP', ko: 'KR', zh: 'CN', nl: 'NL', sv: 'SE',
  da: 'DK', no: 'NO', fi: 'FI', pl: 'PL', tr: 'TR', ar: 'SA',
  hi: 'IN', th: 'TH',
};

function toTmdbLocale(lang: string): string {
  return LANG_TO_LOCALE[lang] || 'en-US';
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
  keywords?: { keywords: { id: number; name: string }[] };
  release_dates?: { results: { iso_3166_1: string; release_dates: { certification: string; type: number }[] }[] };
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
  keywords?: { results: { id: number; name: string }[] };
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] };
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

/** Extract keywords array from movie or TV details (different TMDB response shapes) */
export function extractKeywords(details: TmdbMovie | TmdbTv): { id: number; name: string }[] {
  const movie = details as TmdbMovie;
  const tv = details as TmdbTv;
  return movie.keywords?.keywords ?? tv.keywords?.results ?? [];
}

/** Ratings considered mature/NSFW */
const MATURE_RATINGS = new Set([
  'NC-17', 'TV-MA', 'X',       // US
  '18', '18+', 'VM18',         // FR, DE, BR, RU, IT
]);

/** Non-informative ratings to skip when extracting */
const SKIP_RATINGS = new Set(['NR', 'Not Rated', '']);

/** Build country priority list: instance languages first, then fallback */
function getRatingCountries(): string[] {
  const langs = _cachedLangs || ['en'];
  const instanceCountries = langs.map(l => LANG_TO_COUNTRY[l]).filter(Boolean);
  const fallback = ['US', 'FR', 'DE', 'BR', 'RU', 'IT'];
  // Instance countries first, then remaining fallbacks (deduplicated)
  return [...new Set([...instanceCountries, ...fallback])];
}

/** Extract the most relevant content rating from movie or TV details */
export function extractContentRating(details: TmdbMovie | TmdbTv): string | null {
  const movie = details as TmdbMovie;
  const tv = details as TmdbTv;

  // TV: content_ratings
  const ratingCountries = getRatingCountries();
  if (tv.content_ratings?.results?.length) {
    for (const country of ratingCountries) {
      const match = tv.content_ratings.results.find((r) => r.iso_3166_1 === country);
      if (match?.rating && !SKIP_RATINGS.has(match.rating)) return match.rating;
    }
    // Fallback to first non-skipped rating
    const fallback = tv.content_ratings.results.find((r) => r.rating && !SKIP_RATINGS.has(r.rating));
    return fallback?.rating ?? null;
  }

  // Movie: release_dates (certifications)
  if (movie.release_dates?.results?.length) {
    for (const country of ratingCountries) {
      const countryData = movie.release_dates.results.find((r) => r.iso_3166_1 === country);
      if (countryData) {
        const cert = countryData.release_dates.find((rd) => rd.certification && !SKIP_RATINGS.has(rd.certification))?.certification;
        if (cert) return cert;
      }
    }
  }

  return null;
}

/** Check if a content rating is considered mature/NSFW */
export function isMatureRating(rating: string | null): boolean {
  if (!rating) return false;
  return MATURE_RATINGS.has(rating);
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

const ANIME_KEYWORD_ID = 210024; // TMDB keyword "anime"

export async function getTrendingAnime(page = 1, lang?: string) {
  const l = normalizeLang(lang);
  return cachedRequest(`trending:anime:${page}:${l}`, async () => {
    const { data } = await getTmdbApi(l).get('/discover/tv', {
      params: {
        with_keywords: ANIME_KEYWORD_ID,
        sort_by: 'popularity.desc',
        page,
      },
    });
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
      params: { append_to_response: 'credits,external_ids,videos,keywords,release_dates' },
    });
    return data;
  }, 24);
}

export async function getTvDetails(tvId: number, lang?: string): Promise<TmdbTv> {
  const l = normalizeLang(lang);
  return cachedRequest(`tv:${tvId}:${l}`, async () => {
    const { data } = await getTmdbApi(l).get(`/tv/${tvId}`, {
      params: { append_to_response: 'credits,external_ids,videos,keywords,content_ratings' },
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

const GENRE_IDS = [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 53, 10752, 37];

export async function getGenreBackdrops(): Promise<Record<number, string | null>> {
  return cachedRequest('genre-backdrops', async () => {
    const map: Record<number, string | null> = {};
    const used = new Set<string>();
    for (const id of GENRE_IDS) {
      try {
        const { data } = await getTmdbApi().get('/discover/movie', {
          params: { with_genres: id, sort_by: 'popularity.desc', page: 1 },
        });
        const hit = data.results?.find((m: { backdrop_path: string | null }) => m.backdrop_path && !used.has(m.backdrop_path));
        map[id] = hit?.backdrop_path ?? null;
        if (hit?.backdrop_path) used.add(hit.backdrop_path);
      } catch {
        map[id] = null;
      }
    }
    return map;
  }, 24);
}
