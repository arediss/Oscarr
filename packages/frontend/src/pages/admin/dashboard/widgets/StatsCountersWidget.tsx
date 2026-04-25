import { useEffect, useState } from 'react';
import { Users, Film, Server, Plug } from 'lucide-react';
import api from '@/lib/api';

interface Stats {
  users: number | null;
  pendingRequests: number | null;
  services: number | null;
  plugins: number | null;
}

export function StatsCountersWidget() {
  const [stats, setStats] = useState<Stats>({ users: null, pendingRequests: null, services: null, plugins: null });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      api.get('/admin/users'),
      api.get('/requests?status=pending'),
      api.get('/admin/services'),
      api.get('/plugins'),
    ]).then((results) => {
      if (cancelled) return;
      const length = (r: PromiseSettledResult<{ data: unknown }>): number | null => {
        if (r.status !== 'fulfilled') return null;
        const d = r.value.data as { results?: unknown[]; data?: unknown[] } | unknown[];
        if (Array.isArray(d)) return d.length;
        if (Array.isArray(d?.results)) return d.results.length;
        if (Array.isArray(d?.data)) return d.data.length;
        return null;
      };
      setStats({
        users: length(results[0]),
        pendingRequests: length(results[1]),
        services: length(results[2]),
        plugins: length(results[3]),
      });
    });
    return () => { cancelled = true; };
  }, []);

  const items: { icon: typeof Users; label: string; value: number | null }[] = [
    { icon: Users, label: 'Users', value: stats.users },
    { icon: Film, label: 'Pending requests', value: stats.pendingRequests },
    { icon: Server, label: 'Services', value: stats.services },
    { icon: Plug, label: 'Plugins', value: stats.plugins },
  ];

  return (
    <div className="grid h-full grid-cols-4 gap-3">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
          <Icon className="h-5 w-5 text-ndp-accent" />
          <div className="min-w-0">
            <p className="truncate text-xs text-ndp-text-dim">{label}</p>
            <p className="text-lg font-semibold text-ndp-text">{value ?? '—'}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
