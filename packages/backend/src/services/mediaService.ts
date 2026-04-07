import { prisma } from '../utils/prisma.js';
import { getArrClient, getServiceTypeForMedia } from '../providers/index.js';
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
    const serviceType = getServiceTypeForMedia(mediaType);
    const client = await getArrClient(serviceType);

    let externalId: number | null = mediaType === 'movie' ? tmdbId : tvdbId;
    if (!externalId && mediaType === 'tv') {
      const { getTvDetails } = await import('./tmdb.js');
      const tmdbData = await getTvDetails(tmdbId);
      externalId = tmdbData.external_ids?.tvdb_id ?? null;
    }
    if (!externalId) return result;

    const availability = await client.checkAvailability(externalId);
    result.liveAvailable = availability.available;
    if (!hasCachedAudio) {
      result.audioLanguages = availability.audioLanguages;
      result.subtitleLanguages = availability.subtitleLanguages;
    }
    if (availability.seasonStats) {
      result.sonarrSeasonStats = availability.seasonStats;
    }
  } catch { /* Service unreachable, use DB state */ }
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
