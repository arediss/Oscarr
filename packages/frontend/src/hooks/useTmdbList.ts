import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';

interface UseTmdbListOptions {
  skip?: boolean;
  transform?: (data: any) => any[];
}

interface UseTmdbListResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTmdbList<T = any>(
  endpoint: string | null,
  deps: unknown[] = [],
  options: UseTmdbListOptions = {}
): UseTmdbListResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(!options.skip && !!endpoint);
  const [error, setError] = useState<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!endpoint || optionsRef.current.skip) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(endpoint, { signal });
      const raw = res.data;
      const items = optionsRef.current.transform
        ? optionsRef.current.transform(raw)
        : Array.isArray(raw) ? raw : raw.results || raw.cast || [];
      setData(items);
    } catch (err: any) {
      if (err.name === 'CanceledError' || signal?.aborted) return;
      setError(err.message || 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [endpoint, ...deps]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const refetch = useCallback(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch };
}
