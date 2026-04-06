import { prisma } from '../../utils/prisma.js';
import { safeNotify, safeUserNotify } from '../../utils/safeNotify.js';
import { COMPLETABLE_REQUEST_STATUSES } from '../../utils/requestStatus.js';
import type { RadarrMovie } from '../radarr.js';
import type { SonarrSeries } from '../sonarr.js';

export interface SyncResult {
  added: number;
  updated: number;
  errors: number;
  duration: number;
}

export interface ImagePaths {
  posterPath: string | null;
  backdropPath: string | null;
}

export function extractTmdbPath(url: string): string | null {
  // Extract /path.jpg from https://image.tmdb.org/t/p/original/path.jpg
  const match = url.match(/\/t\/p\/\w+(\/.+?)(?:\?|$)/);
  return match ? match[1] : null;
}

export function extractImagePath(url: string): string | null {
  // Try TMDB format first
  const tmdb = extractTmdbPath(url);
  if (tmdb) return tmdb;
  // For TVDB/other URLs, store the full URL as-is
  if (url.startsWith('http')) return url;
  return null;
}

export function extractImagePaths(
  images: { coverType: string; remoteUrl: string }[] | undefined,
  extractor: (url: string) => string | null,
): ImagePaths {
  const poster = images?.find((i) => i.coverType === 'poster')?.remoteUrl;
  const fanart = images?.find((i) => i.coverType === 'fanart')?.remoteUrl;
  return {
    posterPath: poster ? extractor(poster) : null,
    backdropPath: fanart ? extractor(fanart) : null,
  };
}

export function sendAvailabilityNotifications(
  title: string,
  mediaType: 'movie' | 'tv',
  posterPath: string | null,
  mediaId: number,
  tmdbId: number,
): void {
  safeNotify('media_available', { title, mediaType, posterPath });

  // Notify each user who has a pending request for this media
  prisma.mediaRequest.findMany({
    where: { mediaId, status: { in: [...COMPLETABLE_REQUEST_STATUSES] } },
    select: { userId: true },
  }).then(requests => {
    for (const req of requests) {
      safeUserNotify(req.userId, {
        type: 'media_available',
        title,
        message: `"${title}" est maintenant disponible.`,
        metadata: { mediaId, tmdbId, mediaType },
      });
    }
  }).catch(() => {});
}

export function getMovieStatus(movie: RadarrMovie): string {
  if (movie.hasFile) return 'available';
  if (!movie.monitored) return 'unknown';

  const now = new Date();
  const digitalRelease = movie.digitalRelease ? new Date(movie.digitalRelease) : null;
  const physicalRelease = movie.physicalRelease ? new Date(movie.physicalRelease) : null;
  const inCinemas = movie.inCinemas ? new Date(movie.inCinemas) : null;
  const releaseDate = movie.releaseDate ? new Date(movie.releaseDate) : null;

  const effectiveRelease = digitalRelease || physicalRelease || releaseDate || inCinemas;
  if (effectiveRelease && effectiveRelease > now) {
    return 'upcoming';
  }
  return 'searching';
}

export function getSeriesStatus(show: SonarrSeries): string {
  const stats = show.statistics;
  if (!stats) return 'unknown';
  if (stats.percentOfEpisodes >= 100) return 'available';
  if (stats.episodeFileCount > 0) return 'processing';
  if (show.monitored) return 'pending';
  return 'unknown';
}

export function getSeasonStatus(season: { monitored: boolean; statistics?: { percentOfEpisodes: number; episodeFileCount: number } }): string {
  if (!season.statistics) return 'unknown';
  if (season.statistics.percentOfEpisodes >= 100) return 'available';
  if (season.statistics.episodeFileCount > 0) return 'processing';
  if (season.monitored) return 'pending';
  return 'unknown';
}
