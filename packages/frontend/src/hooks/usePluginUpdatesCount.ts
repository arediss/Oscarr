import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface UpdateInfo {
  available: boolean;
}

let lastCount = 0;
let initialized = false;
const subscribers = new Set<(n: number) => void>();

async function fetchCount(): Promise<void> {
  try {
    const { data } = await api.get<Record<string, UpdateInfo>>('/plugins/updates');
    lastCount = Object.values(data).filter((r) => r.available).length;
    initialized = true;
    subscribers.forEach((cb) => cb(lastCount));
  } catch { /* silent — the dot just doesn't show */ }
}

/** Trigger a re-fetch and notify all mounted `usePluginUpdatesCount` consumers. Call after
 *  any mutation that changes the count: install / uninstall / update / force-refresh. */
export function refreshPluginUpdatesCount(): void {
  fetchCount();
}

/** Counts pending plugin updates. Polls on first mount + when the tab regains visibility,
 *  and refreshes on demand via `refreshPluginUpdatesCount()`. Used by AdminLayout to show
 *  a badge on the Plugins entry. */
export function usePluginUpdatesCount(): number {
  const [count, setCount] = useState(lastCount);

  useEffect(() => {
    subscribers.add(setCount);
    if (!initialized) fetchCount();
    const onVisible = () => { if (document.visibilityState === 'visible') fetchCount(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      subscribers.delete(setCount);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return count;
}
