import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentType } from 'react';
import { loadPluginModule, hasLoaded, getCached, pluginFrontendUrl } from './pluginModuleCache';

export function PluginPage() {
  const { pluginId } = useParams<{ pluginId: string }>();
  const { t } = useTranslation();

  const url = pluginId ? pluginFrontendUrl(pluginId) : '';
  const [Component, setComponent] = useState<ComponentType<any> | null>(url ? getCached(url) : null);
  const [loading, setLoading] = useState(url ? !hasLoaded(url) : false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) return;
    if (hasLoaded(url)) {
      setComponent(() => getCached(url));
      setError(!getCached(url) && hasLoaded(url));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    loadPluginModule(url).then((comp) => {
      if (cancelled) return;
      setComponent(() => comp);
      setError(!comp);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [url]);

  if (!pluginId) {
    return <div className="flex items-center justify-center h-64 text-ndp-text-muted">{t('plugin.not_found')}</div>;
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
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-ndp-text-muted">{t('plugin.frontend_unavailable', { pluginId })}</p>
        <button
          onClick={() => {
            setError(false);
            setLoading(true);
            loadPluginModule(url).then(c => { setComponent(() => c); setError(!c); setLoading(false); });
          }}
          className="text-sm text-ndp-accent hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }
  return <Component />;
}
