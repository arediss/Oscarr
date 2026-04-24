import { useState, useEffect } from 'react';
import api from '@/lib/api';

export interface HomepageSection {
  id: string;
  type: 'builtin' | 'custom';
  enabled: boolean;
  title: string;
  size?: 'default' | 'large';
  builtinKey?: string;
  endpoint?: string;
  query?: {
    mediaType: 'movie' | 'tv';
    genres?: number[];
    yearGte?: number;
    yearLte?: number;
    releasedWithin?: string;
    voteAverageGte?: number;
    voteCountGte?: number;
    sortBy?: string;
    language?: string;
  };
}

export function useHomepageLayout() {
  const [sections, setSections] = useState<HomepageSection[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/app/homepage-layout')
      .then(({ data }) => {
        if (Array.isArray(data)) {
          setSections(data);
        } else {
          setSections(null); // malformed response -> fallback
        }
      })
      .catch((err) => { console.warn("[useHomepageLayout] failed, using hardcoded default", err); setSections(null); }) // fallback to null = use hardcoded default
      .finally(() => setLoading(false));
  }, []);

  return { sections, loading };
}
