import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '@/lib/api';
import { registerNsfwHandler } from '@/lib/api';
import { useFeatures } from '@/context/FeaturesContext';

const STORAGE_KEY = 'nsfw-show-all';

interface NsfwFilterContextValue {
  isNsfw: (tmdbId: number) => boolean;
  addNsfwIds: (ids: number[]) => void;
  showAll: boolean;
  disableBlur: () => void;
  loaded: boolean;
}

export const NsfwFilterContext = createContext<NsfwFilterContextValue>({
  isNsfw: () => false,
  addNsfwIds: () => {},
  showAll: false,
  disableBlur: () => {},
  loaded: false,
});

export function useNsfwFilter() {
  return useContext(NsfwFilterContext);
}

export function useNsfwFilterProvider() {
  const { features } = useFeatures();
  const blurEnabled = features?.nsfwBlurEnabled !== false;
  const [nsfwSet, setNsfwSet] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get<number[]>('/media/nsfw-ids')
      .then(({ data }) => setNsfwSet(new Set(data)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const disableBlur = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setShowAll(true);
  }, []);

  const addNsfwIds = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    setNsfwSet((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  // Register global interceptor so any API response with nsfwTmdbIds auto-updates the filter
  useEffect(() => {
    registerNsfwHandler(addNsfwIds);
    return () => registerNsfwHandler(() => {});
  }, [addNsfwIds]);

  return {
    isNsfw: (tmdbId: number) => blurEnabled && !showAll && nsfwSet.has(tmdbId),
    addNsfwIds,
    showAll,
    disableBlur,
    loaded,
  };
}
