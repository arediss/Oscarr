import { useEffect, useState } from 'react';
import api from '@/lib/api';

let cached: string | null = null;
let inFlight: Promise<string> | null = null;

/** Returns the backend's resolved plugins directory (env-aware). Cached at module scope so
 *  the N places that show a path hint don't each fire their own request, and the first call
 *  de-dupes concurrent in-flight fetches. Falls back to a sensible default if the endpoint
 *  errors out (older backend, admin-only 403, …). */
export function usePluginsDir(): string {
  const [dir, setDir] = useState<string>(cached ?? '~/Oscarr/plugins');

  useEffect(() => {
    if (cached) return;
    if (!inFlight) {
      inFlight = api.get<{ dir: string }>('/plugins/dir')
        .then((res) => {
          cached = res.data.dir;
          return cached;
        })
        .catch(() => {
          cached = '~/Oscarr/plugins';
          return cached;
        })
        .finally(() => { inFlight = null; });
    }
    inFlight.then(setDir).catch(() => {});
  }, []);

  return dir;
}
