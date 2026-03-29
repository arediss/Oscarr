import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Plug } from 'lucide-react';
import api from '@/lib/api';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';

export function PluginsTab() {
  const { t } = useTranslation();
  const [plugins, setPlugins] = useState<{ id: string; name: string; version: string; description?: string; author?: string; enabled: boolean; hasSettings: boolean; hasFrontend: boolean; error?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchPlugins = useCallback(() => {
    api.get('/plugins').then(({ data }) => setPlugins(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchPlugins(); }, [fetchPlugins]);

  const handleToggle = async (id: string, enabled: boolean) => {
    setToggling(id);
    try {
      await api.put(`/plugins/${id}/toggle`, { enabled });
      setPlugins(prev => prev.map(p => p.id === id ? { ...p, enabled } : p));
    } catch { /* ignore */ }
    setToggling(null);
  };

  if (loading) return <Spinner />;

  if (plugins.length === 0) {
    return (
      <AdminTabLayout title={t('admin.tab.plugins')} count={0}>
        <div className="card p-8 text-center">
          <Plug className="w-10 h-10 text-ndp-text-dim mx-auto mb-3" />
          <p className="text-ndp-text-muted">{t('admin.plugins.no_plugins')}</p>
          <p className="text-sm text-ndp-text-dim mt-1" dangerouslySetInnerHTML={{ __html: t('admin.plugins.no_plugins_help') }} />
        </div>
      </AdminTabLayout>
    );
  }

  return (
    <AdminTabLayout title={t('admin.tab.plugins')} count={plugins.length}>
      <div className="space-y-3">
      {plugins.map((plugin) => (
        <div key={plugin.id} className="card p-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-ndp-text">{plugin.name}</h3>
              <span className="text-xs text-ndp-text-dim">v{plugin.version}</span>
              {plugin.error && (
                <span className="text-xs bg-ndp-danger/10 text-ndp-danger px-2 py-0.5 rounded-full">{t('common.error')}</span>
              )}
            </div>
            {plugin.description && (
              <p className="text-sm text-ndp-text-muted mt-0.5">{plugin.description}</p>
            )}
            {plugin.author && (
              <p className="text-xs text-ndp-text-dim mt-0.5">par {plugin.author}</p>
            )}
            {plugin.error && (
              <p className="text-xs text-ndp-danger mt-1">{plugin.error}</p>
            )}
          </div>
          <button
            onClick={() => handleToggle(plugin.id, !plugin.enabled)}
            disabled={toggling === plugin.id}
            className={clsx(
              'relative w-12 h-6 rounded-full transition-colors flex-shrink-0',
              plugin.enabled ? 'bg-ndp-accent' : 'bg-white/10'
            )}
          >
            <span className={clsx(
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform',
              plugin.enabled && 'translate-x-6'
            )} />
          </button>
        </div>
      ))}
      </div>
    </AdminTabLayout>
  );
}
