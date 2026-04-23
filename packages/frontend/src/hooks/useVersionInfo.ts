import { useEffect, useState } from 'react';
import api from '@/lib/api';

export interface VersionInfo {
  current: string;
  latest?: string;
  updateAvailable?: boolean;
  releaseUrl?: string;
}

/** Shared cache — `/app/version` hits the GitHub releases API, one call per session. */
let cached: VersionInfo | null = null;
let inFlight: Promise<VersionInfo | null> | null = null;
const listeners = new Set<(info: VersionInfo | null) => void>();

async function fetchVersion(): Promise<VersionInfo | null> {
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = api.get<VersionInfo>('/app/version')
    .then(({ data }) => {
      cached = data;
      listeners.forEach((cb) => cb(cached));
      return cached;
    })
    .catch(() => null)
    .finally(() => { inFlight = null; });
  return inFlight;
}

export function useVersionInfo(): VersionInfo | null {
  const [info, setInfo] = useState<VersionInfo | null>(cached);

  useEffect(() => {
    if (cached) {
      setInfo(cached);
      return;
    }
    listeners.add(setInfo);
    fetchVersion();
    return () => { listeners.delete(setInfo); };
  }, []);

  return info;
}
