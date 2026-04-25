import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardLayout {
  version: number;
  items: LayoutItem[];
}

interface UseDashboardLayoutResult {
  layout: DashboardLayout | null;
  loading: boolean;
  error: string | null;
  save: (next: DashboardLayout) => Promise<void>;
  reset: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useDashboardLayout(): UseDashboardLayoutResult {
  const [layout, setLayout] = useState<DashboardLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLayout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<DashboardLayout>('/admin/dashboard-layout');
      setLayout(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLayout(); }, [fetchLayout]);

  const save = useCallback(async (next: DashboardLayout) => {
    await api.put('/admin/dashboard-layout', next);
    setLayout(next);
  }, []);

  const reset = useCallback(async () => {
    await api.delete('/admin/dashboard-layout');
    await fetchLayout();
  }, [fetchLayout]);

  return { layout, loading, error, save, reset, refresh: fetchLayout };
}
