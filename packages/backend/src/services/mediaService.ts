import { prisma } from '../utils/prisma.js';
import { getArrClient } from '../providers/index.js';
import type { RadarrClient } from '../providers/radarr/index.js';
import type { SonarrClient } from '../providers/sonarr/index.js';
import { normalizeLanguages } from '../utils/languages.js';
import { COMPLETABLE_REQUEST_STATUSES } from '../utils/requestStatus.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveCheckResult {
  liveAvailable: boolean;
  sonarrSeasonStats: { seasonNumber: number; episodeFileCount: number; episodeCount: number; totalEpisodeCount: number }[] | null;
  audioLanguages: string[] | null;
  subtitleLanguages: string[] | null;
  timedOut?: boolean;
}

const LIVE_CHECK_TIMEOUT = 4000;

// ---------------------------------------------------------------------------
// Live check against Radarr/Sonarr
// ---------------------------------------------------------------------------

export async function performLiveCheck(
  mediaType: string,
  tmdbId: number,
  tvdbId: number | null,
  hasCachedAudio: boolean,
): Promise<LiveCheckResult> {
  const result: LiveCheckResult = { liveAvailable: false, sonarrSeasonStats: null, audioLanguages: null, subtitleLanguages: null };
  try {
    if (mediaType === 'movie') {
      const radarr = await getArrClient('radarr') as RadarrClient;
      const radarrMovie = await radarr.getMovieByTmdbId(tmdbId);
      if (radarrMovie?.hasFile) {
        result.liveAvailable = true;
        if (!hasCachedAudio) {
          const mi = radarrMovie.movieFile?.mediaInfo;
          if (mi?.audioLanguages) {
            result.audioLanguages = mi.audioLanguages.split('/').map((s) => s.trim()).filter(Boolean);
          } else if (radarrMovie.movieFile?.languages?.length) {
            result.audioLanguages = radarrMovie.movieFile.languages.map((l) => l.name);
          }
          if (mi?.subtitles) {
            result.subtitleLanguages = mi.subtitles.split('/').map((s) => s.trim()).filter(Boolean);
          }
        }
      }
    } else if (mediaType === 'tv') {
      let resolvedTvdbId = tvdbId;
      if (!resolvedTvdbId) {
        const { getTvDetails } = await import('./tmdb.js');
        const tmdbData = await getTvDetails(tmdbId);
        resolvedTvdbId = tmdbData.external_ids?.tvdb_id ?? null;
      }
      if (resolvedTvdbId) {
        const sonarr = await getArrClient('sonarr') as SonarrClient;
        const sonarrSeries = await sonarr.getSeriesByTvdbId(resolvedTvdbId);
        if (sonarrSeries) {
          const stats = sonarrSeries.statistics;
          if (stats?.percentOfEpisodes >= 100) {
            result.liveAvailable = true;
          }
          result.sonarrSeasonStats = sonarrSeries.seasons
            .filter((s) => s.seasonNumber > 0)
            .map((s) => ({
              seasonNumber: s.seasonNumber,
              episodeFileCount: s.statistics?.episodeFileCount ?? 0,
              episodeCount: s.statistics?.episodeCount ?? 0,
              totalEpisodeCount: s.statistics?.totalEpisodeCount ?? 0,
            }));

          if (stats?.episodeFileCount && stats.episodeFileCount > 0 && !hasCachedAudio) {
            try {
              const files = await sonarr.getEpisodeFiles(sonarrSeries.id);
              const audioCounts = new Map<string, number>();
              const subCounts = new Map<string, number>();
              for (const f of files) {
                if (f.mediaInfo?.audioLanguages) {
                  const seen = new Set<string>();
                  for (const l of f.mediaInfo.audioLanguages.split('/')) {
                    const t = l.trim();
                    if (t && !seen.has(t)) { seen.add(t); audioCounts.set(t, (audioCounts.get(t) || 0) + 1); }
                  }
                }
                if (f.mediaInfo?.subtitles) {
                  const seen = new Set<string>();
                  for (const l of f.mediaInfo.subtitles.split('/')) {
                    const t = l.trim();
                    if (t && !seen.has(t)) { seen.add(t); subCounts.set(t, (subCounts.get(t) || 0) + 1); }
                  }
                }
              }
              const threshold = Math.max(1, Math.floor(files.length * 0.5));
              const filteredAudio = [...audioCounts.entries()].filter(([, c]) => c >= threshold).map(([l]) => l);
              const filteredSubs = [...subCounts.entries()].filter(([, c]) => c >= threshold).map(([l]) => l);
              if (filteredAudio.length > 0) result.audioLanguages = filteredAudio;
              if (filteredSubs.length > 0) result.subtitleLanguages = filteredSubs;
            } catch (err) {
              const status = (err as { response?: { status?: number } })?.response?.status;
              console.warn(`[Media] Failed to fetch episode files for series ${sonarrSeries.id} (HTTP ${status || 'unknown'}), skipping language data`);
            }
          }
        }
      }
    }
  } catch { /* Radarr/Sonarr unreachable, use DB state */ }
  return result;
}

/** Run live check with a timeout — returns DB-only result if service is slow */
export async function performLiveCheckWithTimeout(
  mediaType: string,
  tmdbId: number,
  tvdbId: number | null,
  hasCachedAudio: boolean,
): Promise<LiveCheckResult> {
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timedOutResult: LiveCheckResult = { liveAvailable: false, sonarrSeasonStats: null, audioLanguages: null, subtitleLanguages: null, timedOut: true };
  return Promise.race([
    performLiveCheck(mediaType, tmdbId, tvdbId, hasCachedAudio).finally(() => clearTimeout(timeoutHandle)),
    new Promise<LiveCheckResult>((resolve) => {
      timeoutHandle = setTimeout(() => resolve(timedOutResult), LIVE_CHECK_TIMEOUT);
    }),
  ]);
}

// ---------------------------------------------------------------------------
// DB side-effects after live check
// ---------------------------------------------------------------------------

export async function cacheLanguageData(
  mediaId: number,
  audio: string[] | null,
  subs: string[] | null,
): Promise<void> {
  const normalizedAudio = audio ? normalizeLanguages(audio) : null;
  const normalizedSubs = subs ? normalizeLanguages(subs) : null;
  if (!normalizedAudio && !normalizedSubs) return;

  const langUpdate: Record<string, string> = {};
  if (normalizedAudio) langUpdate.audioLanguages = JSON.stringify(normalizedAudio);
  if (normalizedSubs) langUpdate.subtitleLanguages = JSON.stringify(normalizedSubs);
  await prisma.media.update({ where: { id: mediaId }, data: langUpdate });
}

export async function promoteMediaToAvailable(
  mediaId: number,
  hasAvailableAt: boolean,
): Promise<void> {
  await prisma.media.update({
    where: { id: mediaId },
    data: { status: 'available', ...(!hasAvailableAt ? { availableAt: new Date() } : {}) },
  });
  await prisma.mediaRequest.updateMany({
    where: { mediaId, status: { in: [...COMPLETABLE_REQUEST_STATUSES] } },
    data: { status: 'available' },
  });
}
