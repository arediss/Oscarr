import type { ComponentType } from 'react';

interface CacheEntry {
  component: ComponentType<any> | null;
  loadedAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Load a plugin ESM module from a URL. Returns the default export as a React component. */
export async function loadPluginModule(url: string): Promise<ComponentType<any> | null> {
  const cached = cache.get(url);
  if (cached) return cached.component;

  try {
    const mod = await import(/* @vite-ignore */ url);
    const component = mod.default || null;
    cache.set(url, { component, loadedAt: Date.now() });
    return component;
  } catch {
    cache.set(url, { component: null, loadedAt: Date.now() });
    return null;
  }
}

/** Check if a URL has been loaded (hit or miss). */
export function hasLoaded(url: string): boolean {
  return cache.has(url);
}

/** Get a previously loaded component (or null). */
export function getCached(url: string): ComponentType<any> | null {
  return cache.get(url)?.component ?? null;
}

/** Invalidate cache for a specific plugin (by pluginId prefix) or all entries. */
export function invalidate(pluginId?: string): void {
  if (!pluginId) {
    cache.clear();
    return;
  }
  const prefix = `/api/plugins/${pluginId}/`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Build the standard URL for a plugin's main frontend module. */
export function pluginFrontendUrl(pluginId: string): string {
  return `/api/plugins/${pluginId}/frontend/index.js`;
}

/** Build the standard URL for a plugin's hook component. */
export function pluginHookUrl(pluginId: string, hookPoint: string): string {
  return `/api/plugins/${pluginId}/frontend/hooks/${hookPoint}.js`;
}
