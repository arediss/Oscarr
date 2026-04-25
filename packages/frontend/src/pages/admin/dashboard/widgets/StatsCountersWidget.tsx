import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Film, Server, Plug } from 'lucide-react';
import api from '@/lib/api';

interface Stats {
  users: number | null;
  pendingRequests: number | null;
  services: number | null;
  plugins: number | null;
}

export function StatsCountersWidget() {
  const { t } = useTranslation();
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

  const cards: { key: keyof Stats; label: string; icon: typeof Users; accent: string }[] = [
    { key: 'users', label: t('admin.dashboard.users'), icon: Users, accent: 'text-indigo-400' },
    { key: 'pendingRequests', label: t('admin.dashboard.pending_requests'), icon: Film, accent: 'text-amber-400' },
    { key: 'services', label: t('admin.dashboard.services'), icon: Server, accent: 'text-emerald-400' },
    { key: 'plugins', label: t('admin.dashboard.plugins'), icon: Plug, accent: 'text-fuchsia-400' },
  ];

  return (
    <div className="grid h-full grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(({ key, label, icon: Icon, accent }) => (
        <div key={key} className="card p-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ndp-text-dim uppercase tracking-wider">{label}</span>
            <Icon className={`w-4 h-4 ${accent}`} />
          </div>
          <div className="text-2xl font-semibold text-ndp-text tabular-nums">
            {stats[key] ?? '—'}
          </div>
        </div>
      ))}
    </div>
  );
}
