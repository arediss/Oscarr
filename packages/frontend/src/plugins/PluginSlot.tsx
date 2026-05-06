import type { ReactNode } from 'react';
import { usePluginUI } from './usePlugins';
import { PluginHookComponent } from './PluginHookComponent';
import type { PluginUIContribution } from './types';

interface PluginSlotProps {
  hookPoint: string;
  /** Context data passed to plugin hook components (component mode) */
  context?: Record<string, unknown>;
  /** Render callback for simple mode (e.g. nav links). If omitted, uses component mode. */
  renderItem?: (contribution: PluginUIContribution, index: number) => ReactNode;
}

export function PluginSlot({ hookPoint, context, renderItem }: Readonly<PluginSlotProps>) {
  const { contributions } = usePluginUI(hookPoint);
  if (!contributions.length) return null;

  if (renderItem) {
    // Simple mode — existing behavior for static rendering (nav links, etc.)
    return <>{contributions.map((c, i) => renderItem(c, i))}</>;
  }

  // Component mode — lazy load plugin components with contextual data
  return (
    <>
      {contributions.map((c) => (
        <PluginHookComponent
          key={`${c.pluginId}-${hookPoint}`}
          pluginId={c.pluginId}
          hookPoint={hookPoint}
          context={context || {}}
          contribution={c}
        />
      ))}
    </>
  );
}
