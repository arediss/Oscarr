import { useState, useEffect } from 'react';
import api from '@/lib/api';

export interface EpisodeInfo {
  episodeNumber: number;
  title: string;
  airDateUtc: string | null;
  hasFile: boolean;
  monitored: boolean;
  quality: string | null;
  size: number | null;
}

export function useEpisodeModal(mediaId: number | undefined) {
  const [episodeModalOpen, setEpisodeModalOpen] = useState(false);
  const [episodeCache, setEpisodeCache] = useState<Record<number, EpisodeInfo[]>>({});
  const [loadingSeason, setLoadingSeason] = useState<number | null>(null);
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);

  const openEpisodeModal = () => {
    setEpisodeModalOpen(true);
    setExpandedSeason(null);
    setEpisodeCache({});
  };

  const closeEpisodeModal = () => {
    setEpisodeModalOpen(false);
  };

  const toggleSeason = async (seasonNumber: number) => {
    if (expandedSeason === seasonNumber) {
      setExpandedSeason(null);
      return;
    }
    setExpandedSeason(seasonNumber);
    if (episodeCache[seasonNumber]) return; // Already loaded
    if (!mediaId) return;
    setLoadingSeason(seasonNumber);
    try {
      const { data } = await api.get(`/media/episodes?tmdbId=${mediaId}&seasonNumber=${seasonNumber}`);
      setEpisodeCache(prev => ({ ...prev, [seasonNumber]: data }));
    } catch {
      setEpisodeCache(prev => ({ ...prev, [seasonNumber]: [] }));
    } finally {
      setLoadingSeason(null);
    }
  };

  useEffect(() => {
    if (episodeModalOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [episodeModalOpen]);

  return {
    episodeModalOpen,
    openEpisodeModal,
    closeEpisodeModal,
    episodeCache,
    expandedSeason,
    loadingSeason,
    toggleSeason,
  };
}
