import { useEffect, useState } from 'react';
import { Sparkles, Plug, Info } from 'lucide-react';
import api from '@/lib/api';

interface VersionResp { current: string; latest?: string; updateAvailable?: boolean }
interface PluginInfo { id: string; updateAvailable?: boolean }

export function SystemWidget() {
  const [v, setV] = useState<VersionResp | null>(null);
  const [pluginUpdates, setPluginUpdates] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<VersionResp>('/app/version').then(({ data }) => { if (!cancelled) setV(data); }).catch(() => {});
    api.get<PluginInfo[]>('/plugins').then(({ data }) => {
      if (cancelled) return;
      const list = Array.isArray(data) ? data : [];
      setPluginUpdates(list.filter((p) => p.updateAvailable).length);
    }).catch(() => { if (!cancelled) setPluginUpdates(null); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="card p-4 h-full overflow-auto">
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
          <Info className="h-5 w-5 text-ndp-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ndp-text-dim">Oscarr version</p>
            <p className="font-mono text-sm text-ndp-text">{v?.current ?? '—'}</p>
          </div>
          {v?.updateAvailable && (
            <span className="rounded-full bg-ndp-accent/20 px-2 py-0.5 text-[11px] font-medium text-ndp-accent">
              {v.latest} available
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
          <Plug className="h-5 w-5 text-ndp-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ndp-text-dim">Plugin updates</p>
            <p className="text-sm text-ndp-text">{pluginUpdates ?? '—'}</p>
          </div>
          {pluginUpdates && pluginUpdates > 0 ? (
            <Sparkles className="h-4 w-4 text-ndp-accent" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
