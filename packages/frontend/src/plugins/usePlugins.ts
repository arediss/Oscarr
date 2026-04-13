import { useEffect, useState } from 'react';
import api from '../lib/api';
import type { PluginUIContribution } from './types';

const cache = new Map<string, { data: PluginUIContribution[]; fetchedAt: number }>();
const CACHE_TTL = 60_000;

export function usePluginUI(hookPoint: string) {
  const cached = cache.get(hookPoint);
  const hasFresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL;

  const [contributions, setContributions] = useState<PluginUIContribution[]>(hasFresh ? cached.data : []);
  const [loading, setLoading] = useState(!hasFresh);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasFresh) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    api.get<PluginUIContribution[]>(`/plugins/ui/${hookPoint}`)
      .then((res) => {
        if (cancelled) return;
        cache.set(hookPoint, { data: res.data, fetchedAt: Date.now() });
        setContributions(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        setContributions([]);
        setError(err.message || 'Failed to load plugin contributions');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [hookPoint]);

  return { contributions, loading, error };
}

/** Invalidate the UI contribution cache (e.g. after toggling a plugin). */
export function invalidatePluginUICache(hookPoint?: string): void {
  if (hookPoint) {
    cache.delete(hookPoint);
  } else {
    cache.clear();
  }
}
