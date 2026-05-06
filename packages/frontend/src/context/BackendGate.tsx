import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import api from '@/lib/api';

interface BackendState {
  installed: boolean;
}

const BackendContext = createContext<BackendState | null>(null);

/** Blocks rendering until the backend replies to `/setup/install-status`. Retries forever on
 *  network errors and Vite-proxy 5xx so downstream providers never see a transient failure. */
export function BackendGate({ children, fallback }: Readonly<{ children: ReactNode; fallback: ReactNode }>) {
  const [state, setState] = useState<BackendState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const probe = () => {
      api.get('/setup/install-status')
        .then(({ data }) => {
          if (cancelled) return;
          setState({ installed: !!data.installed });
        })
        .catch((err) => {
          if (cancelled) return;
          const s = err?.response?.status;
          if (!err?.response || (typeof s === 'number' && s >= 500)) {
            setTimeout(probe, 500);
            return;
          }
          setState({ installed: false });
        });
    };
    probe();
    return () => { cancelled = true; };
  }, []);

  if (!state) return <>{fallback}</>;
  return <BackendContext.Provider value={state}>{children}</BackendContext.Provider>;
}

export function useBackend(): BackendState {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error('useBackend must be used within BackendGate');
  return ctx;
}
