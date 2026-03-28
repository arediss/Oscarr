import { lazy, Suspense, useMemo } from 'react';
import type { PluginUIContribution } from './types';

interface Props {
  pluginId: string;
  hookPoint: string;
  context: Record<string, unknown>;
  contribution: PluginUIContribution;
}

const componentCache = new Map<string, React.LazyExoticComponent<React.ComponentType<{ contribution: PluginUIContribution; context: Record<string, unknown> }>>>();

function getHookComponent(pluginId: string, hookPoint: string) {
  const cacheKey = `${pluginId}:${hookPoint}`;
  if (!componentCache.has(cacheKey)) {
    const LazyComponent = lazy(() =>
      import(`../../plugins/${pluginId}/frontend/hooks/${hookPoint}.tsx`).catch(() => ({
        default: () => null,
      }))
    );
    componentCache.set(cacheKey, LazyComponent);
  }
  return componentCache.get(cacheKey)!;
}

export function PluginHookComponent({ pluginId, hookPoint, context, contribution }: Props) {
  const Component = useMemo(
    () => getHookComponent(pluginId, hookPoint),
    [pluginId, hookPoint]
  );

  return (
    <Suspense fallback={null}>
      <Component contribution={contribution} context={context} />
    </Suspense>
  );
}
