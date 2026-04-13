import { useState, useEffect } from 'react';
import api from '@/lib/api';

export interface HomepageSection {
  id: string;
  type: 'builtin' | 'custom';
  enabled: boolean;
  title: string;
  size?: 'default' | 'large';
  builtinKey?: string;
  query?: {
    mediaType: 'movie' | 'tv';
    genres?: number[];
    yearGte?: number;
    yearLte?: number;
    voteAverageGte?: number;
    sortBy?: string;
    language?: string;
  };
}

export function useHomepageLayout() {
  const [sections, setSections] = useState<HomepageSection[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/app/homepage-layout')
      .then(({ data }) => setSections(data))
      .catch(() => setSections(null)) // fallback to null = use hardcoded default
      .finally(() => setLoading(false));
  }, []);

  return { sections, loading };
}
