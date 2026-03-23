import { useEffect, useState } from 'react';
import api from '../lib/api';
import type { PluginUIContribution } from './types';

const cache = new Map<string, { data: PluginUIContribution[]; fetchedAt: number }>();
const CACHE_TTL = 60_000; // 1 minute

export function usePluginUI(hookPoint: string) {
  const [contributions, setContributions] = useState<PluginUIContribution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = cache.get(hookPoint);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setContributions(cached.data);
      setLoading(false);
      return;
    }

    let cancelled = false;
    api.get<PluginUIContribution[]>(`/plugins/ui/${hookPoint}`)
      .then((res) => {
        if (cancelled) return;
        cache.set(hookPoint, { data: res.data, fetchedAt: Date.now() });
        setContributions(res.data);
      })
      .catch(() => {
        if (cancelled) return;
        setContributions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [hookPoint]);

  return { contributions, loading };
}

export function invalidatePluginCache(hookPoint?: string) {
  if (hookPoint) {
    cache.delete(hookPoint);
  } else {
    cache.clear();
  }
}
