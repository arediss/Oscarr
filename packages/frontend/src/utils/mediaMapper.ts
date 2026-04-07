import type { TmdbMedia } from '@/types';

export function dbMediaToTmdbShape(m: {
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate?: string | null;
  voteAverage?: number | null;
  lastEpisodeInfo?: { season: number; episode: number; title: string } | null;
}): TmdbMedia {
  return {
    id: m.tmdbId > 0 ? m.tmdbId : 0,
    title: m.mediaType === 'movie' ? m.title : undefined,
    name: m.mediaType === 'tv' ? m.title : undefined,
    poster_path: m.posterPath,
    backdrop_path: m.backdropPath,
    release_date: m.mediaType === 'movie' ? (m.releaseDate ?? undefined) : undefined,
    first_air_date: m.mediaType === 'tv' ? (m.releaseDate ?? undefined) : undefined,
    vote_average: m.voteAverage ?? 0,
    vote_count: 0,
    overview: '',
    media_type: m.mediaType,
    lastEpisodeInfo: m.lastEpisodeInfo,
  };
}
