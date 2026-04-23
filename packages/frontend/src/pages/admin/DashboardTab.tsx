import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Film, Server, Plug, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { AdminTabLayout } from './AdminTabLayout';
import { PluginSlot } from '@/plugins/PluginSlot';

/** Admin dashboard — stats + plugin slot + setup checklist. */

type StatKey = 'users' | 'pendingRequests' | 'services' | 'plugins';
type Stats = Record<StatKey, number | null>;
type StatErrors = Record<StatKey, boolean>;

export function DashboardTab() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats>({
    users: null,
    pendingRequests: null,
    services: null,
    plugins: null,
  });
  const [errors, setErrors] = useState<StatErrors>({
    users: false,
    pendingRequests: false,
    services: false,
    plugins: false,
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const [users, requests, services, plugins] = await Promise.allSettled([
      api.get('/admin/users'),
      api.get('/requests?status=pending'),
      api.get('/admin/services'),
      api.get('/plugins'),
    ]);
    // Log rejections so a failing probe is at least visible in devtools / future error telemetry.
    // The UI surfaces the failure per-card with an alert marker — no silent em-dashes.
    [users, requests, services, plugins].forEach((r, i) => {
      if (r.status === 'rejected') console.error(`DashboardTab probe #${i} failed`, r.reason);
    });
    setStats({
      users: users.status === 'fulfilled' ? users.value.data?.length ?? users.value.data?.users?.length ?? null : null,
      pendingRequests:
        requests.status === 'fulfilled'
          ? requests.value.data?.requests?.length ?? requests.value.data?.length ?? null
          : null,
      services: services.status === 'fulfilled' ? services.value.data?.length ?? null : null,
      plugins: plugins.status === 'fulfilled' ? plugins.value.data?.length ?? null : null,
    });
    setErrors({
      users: users.status === 'rejected',
      pendingRequests: requests.status === 'rejected',
      services: services.status === 'rejected',
      plugins: plugins.status === 'rejected',
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const cards: { key: StatKey; label: string; icon: typeof Users; accent: string }[] = [
    { key: 'users', label: t('admin.dashboard.users'), icon: Users, accent: 'text-indigo-400' },
    { key: 'pendingRequests', label: t('admin.dashboard.pending_requests'), icon: Film, accent: 'text-amber-400' },
    { key: 'services', label: t('admin.dashboard.services'), icon: Server, accent: 'text-emerald-400' },
    { key: 'plugins', label: t('admin.dashboard.plugins'), icon: Plug, accent: 'text-fuchsia-400' },
  ];

  return (
    <AdminTabLayout>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(({ key, label, icon: Icon, accent }) => {
          const value = stats[key];
          const errored = errors[key];
          return (
            <div key={key} className="card p-5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ndp-text-dim uppercase tracking-wider">{label}</span>
                <Icon className={`w-4 h-4 ${accent}`} />
              </div>
              {errored ? (
                <div
                  className="flex items-center gap-2 text-ndp-danger"
                  title={t('admin.dashboard.probe_failed')}
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">{t('admin.dashboard.unavailable')}</span>
                </div>
              ) : (
                <div className="text-2xl font-semibold text-ndp-text tabular-nums">
                  {loading ? '…' : value ?? '—'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Plugin-contributed widgets. Any plugin can hook into admin.dashboard and ship a
          component that renders here. Rendered in a stacked column below the core stats. */}
      <div className="mt-6 flex flex-col gap-4">
        <PluginSlot hookPoint="admin.dashboard" />
      </div>
    </AdminTabLayout>
  );
}
