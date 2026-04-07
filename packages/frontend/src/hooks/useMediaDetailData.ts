import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useNsfwFilter } from '@/hooks/useNsfwFilter';
import { useDownloadForMedia, useOnDownloadComplete } from '@/hooks/useDownloads';
import { invalidateMediaStatus, updateMediaStatusCache } from '@/hooks/useMediaStatus';
import type { TmdbMedia, Media } from '@/types';

interface SonarrSeason {
  seasonNumber: number;
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount: number;
}

export function useMediaDetailData(id: string | undefined, type: 'movie' | 'tv') {
  const { addNsfwIds } = useNsfwFilter();
  const [media, setMedia] = useState<TmdbMedia | null>(null);
  const [dbMedia, setDbMedia] = useState<Media | null>(null);
  const [sonarrSeasons, setSonarrSeasons] = useState<SonarrSeason[]>([]);
  const [inLibrary, setInLibrary] = useState(false);
  const [recommendations, setRecommendations] = useState<TmdbMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [qualityOptions, setQualityOptions] = useState<{ id: number; label: string; position: number }[]>([]);
  const [activeQualityOptionIds, setActiveQualityOptionIds] = useState<number[]>([]);
  const [audioLanguages, setAudioLanguages] = useState<string[]>([]);
  const [subtitleLanguages, setSubtitleLanguages] = useState<string[]>([]);

  const applyDbData = useCallback((data: Record<string, unknown>) => {
    if (data.id) setDbMedia(data as unknown as Media);
    if (data.sonarrSeasons) setSonarrSeasons(data.sonarrSeasons as SonarrSeason[]);
    if (data.inLibrary) setInLibrary(true);
    if (data.status === 'available' && !data.id) setInLibrary(true);
    if (data.activeQualityOptionIds) setActiveQualityOptionIds(data.activeQualityOptionIds as number[]);
    if (data.audioLanguages) setAudioLanguages(data.audioLanguages as string[]);
    if (data.subtitleLanguages) setSubtitleLanguages(data.subtitleLanguages as string[]);
    if (data.nsfw && id) addNsfwIds([parseInt(id, 10)]);
    // Update global status cache so list pages reflect the latest state on back navigation
    if (data.status && id) {
      const tmdbId = parseInt(id, 10);
      if (tmdbId) updateMediaStatusCache(tmdbId, type, data.status as string);
    }
  }, [id, type, addNsfwIds]);

  useEffect(() => {
    api.get('/app/quality-options').then(({ data }) => setQualityOptions(data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setMedia(null);
    // Keep dbMedia until fresh data arrives (prevents button flash)
    setSonarrSeasons([]);
    setInLibrary(false);
    setActiveQualityOptionIds([]);
    setAudioLanguages([]);
    setSubtitleLanguages([]);

    async function fetchData() {
      // 1. DB + live check first (fast with timeout) -- resolves button state immediately
      try {
        const { data } = await api.get(`/media/tmdb/${id}/${type}`);
        applyDbData(data);
        if (!data.id) setDbMedia(null);
      } catch {
        setDbMedia(null);
      }

      // 2. TMDB details (may be cached 24h on backend)
      try {
        const { data } = await api.get(`/tmdb/${type}/${id}`);
        setMedia(data);
      } catch (err) {
        console.error('Failed to fetch media details:', err);
      } finally {
        setLoading(false);
      }

      // 3. Recommendations (non-blocking)
      api.get(`/tmdb/${type}/${id}/recommendations`).then(({ data }) => {
        setRecommendations(data.results?.map((r: TmdbMedia) => ({ ...r, media_type: type })) || []);
        if (data.nsfwTmdbIds?.length) addNsfwIds(data.nsfwTmdbIds);
      }).catch(() => {});
    }
    fetchData();
  }, [id, type, applyDbData]);

  const refreshDbData = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get(`/media/tmdb/${id}/${type}`);
      applyDbData(data);
    } catch { /* ignore */ }
  }, [id, type, applyDbData]);

  const download = useDownloadForMedia(media?.id, type);

  // Auto-refresh when download completes (disappears from queue)
  useOnDownloadComplete(media?.id, () => {
    if (!id || !media) return;
    invalidateMediaStatus(media.id, type);
    api.get(`/media/tmdb/${id}/${type}`).then(({ data }) => applyDbData(data)).catch(() => {});
  });

  // Ignore stale dbMedia from a previous page during navigation
  const currentDbMedia = dbMedia && String(dbMedia.tmdbId) === id ? dbMedia : null;

  return {
    media,
    dbMedia: currentDbMedia,
    sonarrSeasons,
    inLibrary,
    recommendations,
    loading,
    qualityOptions,
    activeQualityOptionIds,
    audioLanguages,
    subtitleLanguages,
    download,
    applyDbData,
    refreshDbData,
  };
}
