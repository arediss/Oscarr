import React, { useState, useEffect, Component as ReactComponent } from 'react';
import type { PluginUIContribution } from './types';
import { loadPluginModule, hasLoaded, getCached, pluginHookUrl, PLUGIN_SCOPE_ATTR } from './pluginModuleCache';

interface Props {
  pluginId: string;
  hookPoint: string;
  context: Record<string, unknown>;
  contribution: PluginUIContribution;
}

class PluginErrorBoundary extends ReactComponent<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) {
    console.warn('[Plugin] Component error:', error.message);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function PluginHookComponent({ pluginId, hookPoint, context, contribution }: Readonly<Props>) {
  const url = pluginHookUrl(pluginId, hookPoint);
  const [Comp, setComp] = useState<React.ComponentType<any> | null>(() => getCached(url));
  const [ready, setReady] = useState(() => hasLoaded(url));

  useEffect(() => {
    if (hasLoaded(url)) {
      setComp(() => getCached(url));
      setReady(true);
      return;
    }
    let cancelled = false;
    loadPluginModule(url).then((loaded) => {
      if (cancelled) return;
      if (loaded) setComp(() => loaded);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [pluginId, hookPoint, url]);

  if (!ready || !Comp) return null;

  // `display: contents` keeps the scope wrapper out of layout so parent flex/grid still applies.
  return (
    <div {...{ [PLUGIN_SCOPE_ATTR]: pluginId }} style={{ display: 'contents' }}>
      <PluginErrorBoundary>
        <Comp contribution={contribution} context={context} />
      </PluginErrorBoundary>
    </div>
  );
}
