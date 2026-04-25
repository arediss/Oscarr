import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface Service { id: number; name: string; type: string; enabled: boolean }
interface HealthState { status: 'loading' | 'ok' | 'error'; version?: string; error?: string }

export function ServiceHealthWidget() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [health, setHealth] = useState<Record<number, HealthState>>({});

  useEffect(() => {
    let cancelled = false;
    api.get<Service[]>('/admin/services')
      .then(({ data }) => { if (!cancelled) setServices(data.filter((s) => s.enabled)); })
      .catch(() => { if (!cancelled) setServices([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!services) return;
    setHealth(Object.fromEntries(services.map((s) => [s.id, { status: 'loading' as const }])));
    services.forEach((s) => {
      api.post<{ ok: boolean; version?: string }>(`/admin/services/${s.id}/test`)
        .then(({ data }) => {
          setHealth((h) => ({ ...h, [s.id]: { status: data.ok ? 'ok' : 'error', version: data.version, error: data.ok ? undefined : 'Unreachable' } }));
        })
        .catch((err) => {
          setHealth((h) => ({ ...h, [s.id]: { status: 'error', error: (err as Error).message } }));
        });
    });
  }, [services]);

  const sorted = useMemo(() => services ? [...services].sort((a, b) => a.name.localeCompare(b.name)) : [], [services]);

  if (!services) return <p className="text-xs text-ndp-text-dim">Loading…</p>;
  if (services.length === 0) return <p className="text-xs text-ndp-text-dim">No services configured.</p>;

  return (
    <ul className="space-y-2">
      {sorted.map((s) => {
        const h = health[s.id];
        return (
          <li key={s.id} className="flex items-center justify-between gap-3 rounded-md bg-white/5 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ndp-text">{s.name}</p>
              <p className="text-[11px] text-ndp-text-dim uppercase">{s.type}</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {h?.status === 'loading' && <Loader2 className="h-3.5 w-3.5 animate-spin text-ndp-text-dim" />}
              {h?.status === 'ok' && <><CheckCircle2 className="h-3.5 w-3.5 text-ndp-success" /><span className="text-ndp-text-dim">{h.version || 'OK'}</span></>}
              {h?.status === 'error' && <><AlertCircle className="h-3.5 w-3.5 text-ndp-danger" /><span className="text-ndp-danger">{h.error || 'Error'}</span></>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
