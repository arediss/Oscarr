import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';

const STORAGE_KEY = 'nsfw-show-all';

interface NsfwData {
  mediaIds: number[];
  keywordIds: number[];
}

interface NsfwFilterContextValue {
  /** Check by TMDB media ID (for media cards, known catalog items) */
  isNsfw: (tmdbId: number) => boolean;
  /** Check by keyword IDs from TMDB details (for media not in catalog) */
  hasNsfwKeyword: (kwIds: number[]) => boolean;
  /** Add NSFW tmdb IDs discovered at runtime (e.g. from recommendations) */
  addNsfwIds: (ids: number[]) => void;
  /** User has opted to always show NSFW content */
  showAll: boolean;
  /** Permanently disable NSFW blur (persisted in localStorage) */
  disableBlur: () => void;
  loaded: boolean;
}

export const NsfwFilterContext = createContext<NsfwFilterContextValue>({
  isNsfw: () => false,
  hasNsfwKeyword: () => false,
  addNsfwIds: () => {},
  showAll: false,
  disableBlur: () => {},
  loaded: false,
});

export function useNsfwFilter() {
  return useContext(NsfwFilterContext);
}

export function useNsfwFilterProvider() {
  const [mediaSet, setMediaSet] = useState<Set<number>>(new Set());
  const [keywordSet, setKeywordSet] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get<NsfwData>('/media/nsfw-ids')
      .then(({ data }) => {
        setMediaSet(new Set(data.mediaIds));
        setKeywordSet(new Set(data.keywordIds));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const disableBlur = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setShowAll(true);
  }, []);

  const addNsfwIds = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    setMediaSet((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  return {
    isNsfw: (tmdbId: number) => !showAll && mediaSet.has(tmdbId),
    hasNsfwKeyword: (kwIds: number[]) => !showAll && kwIds.some((id) => keywordSet.has(id)),
    addNsfwIds,
    showAll,
    disableBlur,
    loaded,
  };
}
