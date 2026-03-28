import React, { useState, useEffect, Component as ReactComponent } from 'react';
import type { PluginUIContribution } from './types';

interface Props {
  pluginId: string;
  hookPoint: string;
  context: Record<string, unknown>;
  contribution: PluginUIContribution;
}

const componentCache = new Map<string, React.ComponentType<any> | null>();

async function loadPluginModule(pluginId: string, path: string): Promise<React.ComponentType<any> | null> {
  try {
    const module = await import(/* @vite-ignore */ `/api/plugins/${pluginId}/frontend/${path}.js`);
    return module.default || null;
  } catch {
    return null;
  }
}

// Error boundary — plugin crash never breaks the host app
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

function PluginRenderer({ component: Comp, contribution, context }: {
  component: React.ComponentType<any>;
  contribution: PluginUIContribution;
  context: Record<string, unknown>;
}) {
  return (
    <PluginErrorBoundary>
      <Comp contribution={contribution} context={context} />
    </PluginErrorBoundary>
  );
}

export function PluginHookComponent({ pluginId, hookPoint, context, contribution }: Props) {
  const cacheKey = `${pluginId}:${hookPoint}`;
  const [ready, setReady] = useState(false);
  const [Comp, setComp] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    const cached = componentCache.get(cacheKey);
    if (cached) {
      setComp(() => cached);
      setReady(true);
      return;
    }

    let cancelled = false;
    loadPluginModule(pluginId, `hooks/${hookPoint}`).then((loaded) => {
      if (cancelled) return;
      componentCache.set(cacheKey, loaded);
      if (loaded) setComp(() => loaded);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [pluginId, hookPoint]);

  if (!ready || !Comp) return null;

  return <PluginRenderer component={Comp} contribution={contribution} context={context} />;
}
