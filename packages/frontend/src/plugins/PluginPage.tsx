import { useParams } from 'react-router-dom';
import { useState, useEffect, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

const pageCache = new Map<string, ComponentType<any> | null>();

export function PluginPage() {
  const { pluginId } = useParams<{ pluginId: string }>();
  const { t } = useTranslation();
  const [Component, setComponent] = useState<ComponentType<any> | null>(
    pluginId && pageCache.has(pluginId) ? pageCache.get(pluginId)! : null
  );
  const [loading, setLoading] = useState(!pageCache.has(pluginId || ''));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!pluginId || pageCache.has(pluginId)) return;
    let cancelled = false;

    import(/* @vite-ignore */ `/api/plugins/${pluginId}/frontend/index.js`)
      .then((mod) => {
        if (cancelled) return;
        const comp = mod.default || null;
        pageCache.set(pluginId, comp);
        setComponent(() => comp);
      })
      .catch(() => {
        if (cancelled) return;
        pageCache.set(pluginId, null);
        setError(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [pluginId]);

  if (!pluginId) {
    return (
      <div className="flex items-center justify-center h-64 text-ndp-text-muted">
        {t('plugin.not_found')}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-ndp-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !Component) {
    return (
      <div className="flex items-center justify-center h-64 text-ndp-text-muted">
        {t('plugin.frontend_unavailable', { pluginId })}
      </div>
    );
  }

  return <Component />;
}
