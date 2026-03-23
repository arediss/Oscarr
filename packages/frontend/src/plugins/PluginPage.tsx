import { useParams } from 'react-router-dom';
import { lazy, Suspense, useMemo } from 'react';

const pluginModules = new Map<string, React.LazyExoticComponent<React.ComponentType>>();

function getPluginComponent(pluginId: string) {
  if (!pluginModules.has(pluginId)) {
    const LazyComponent = lazy(() =>
      import(`../../plugins/${pluginId}/frontend/index.tsx`).catch(() => ({
        default: () => (
          <div className="flex items-center justify-center h-64 text-zinc-400">
            Plugin "{pluginId}" — frontend non disponible
          </div>
        ),
      }))
    );
    pluginModules.set(pluginId, LazyComponent);
  }
  return pluginModules.get(pluginId)!;
}

export function PluginPage() {
  const { pluginId } = useParams<{ pluginId: string }>();

  const Component = useMemo(
    () => (pluginId ? getPluginComponent(pluginId) : null),
    [pluginId]
  );

  if (!Component) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400">
        Plugin introuvable
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <Component />
    </Suspense>
  );
}
