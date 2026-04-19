import type { ComponentType } from 'react';

interface CacheEntry {
  component: ComponentType<any> | null;
  loadedAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Plugin id → injected `<link>` node. Stored by reference so removal never has to re-query
 *  the DOM with a user-controlled selector (escape safety) and stays consistent with the DOM
 *  across Vite HMR cycles where module state resets but document.head doesn't. */
const cssLinks = new Map<string, HTMLLinkElement>();

/** Extract the plugin id from a plugin asset URL. Both entry-point and hook-point URLs follow
 *  `/api/plugins/<pluginId>/frontend/...`, so the third path segment is the id. */
function pluginIdFromUrl(url: string): string | null {
  const match = url.match(/^\/api\/plugins\/([^/]+)\/frontend\//);
  return match ? (match[1] ?? null) : null;
}

/**
 * Inject a `<link rel="stylesheet">` for the plugin's compiled CSS bundle, once per plugin.
 * Called only after the plugin's JS loads successfully so a broken import doesn't leave an
 * orphan stylesheet in the page. If the CSS file 404s (plugin not rebuilt with the Tailwind
 * scaffolder), we surface a dev-mode warning rather than debug-archaeology the network panel.
 */
function ensurePluginCss(pluginId: string): void {
  if (cssLinks.has(pluginId)) return;
  // HMR safety: if a previous module instance already appended the link, re-use it.
  const existing = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[data-plugin-id]'))
    .find((el) => el.dataset.pluginId === pluginId);
  if (existing) {
    cssLinks.set(pluginId, existing);
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/api/plugins/${pluginId}/frontend/index.css`;
  link.dataset.pluginId = pluginId;
  if (import.meta.env.DEV) {
    link.onerror = () => console.warn(
      `Plugin "${pluginId}" did not ship a CSS bundle. Run \`npm run plugin:add-tailwind -- <plugin-dir>\` to enable Tailwind in the plugin.`,
    );
  }
  document.head.appendChild(link);
  cssLinks.set(pluginId, link);
}

/** Remove a previously-injected plugin CSS link — used when the plugin is disabled /
 *  uninstalled so stale utilities don't keep styling the page after the JS is gone. */
function removePluginCss(pluginId: string): void {
  const link = cssLinks.get(pluginId);
  if (!link) return;
  link.remove();
  cssLinks.delete(pluginId);
}

/** Load a plugin ESM module from a URL. Returns the default export as a React component.
 *  Also injects the plugin's compiled CSS bundle on first successful load — the core bundle
 *  no longer purges classes it doesn't use itself, so plugins ship their own utilities. */
export async function loadPluginModule(url: string): Promise<ComponentType<any> | null> {
  const cached = cache.get(url);
  if (cached) return cached.component;

  try {
    const mod = await import(/* @vite-ignore */ url);
    const component = mod.default || null;
    const pluginId = pluginIdFromUrl(url);
    if (pluginId) ensurePluginCss(pluginId);
    cache.set(url, { component, loadedAt: Date.now() });
    return component;
  } catch (err) {
    // Don't cache failures — allow retry on next call. Log in dev so a bundle eval crash /
    // CSP block / syntax error doesn't silently render the plugin as missing.
    if (import.meta.env.DEV) console.error(`Failed to load plugin module at ${url}`, err);
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

/** Invalidate cache for a specific plugin (by pluginId prefix) or all entries. Also tears down
 *  the plugin's injected CSS so a disabled plugin can't keep styling the app. */
export function invalidate(pluginId?: string): void {
  if (!pluginId) {
    cache.clear();
    for (const id of Array.from(cssLinks.keys())) removePluginCss(id);
    return;
  }
  const prefix = `/api/plugins/${pluginId}/`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  removePluginCss(pluginId);
}

/** Build the standard URL for a plugin's main frontend module. */
export function pluginFrontendUrl(pluginId: string): string {
  return `/api/plugins/${pluginId}/frontend/index.js`;
}

/** Build the standard URL for a plugin's hook component. */
export function pluginHookUrl(pluginId: string, hookPoint: string): string {
  return `/api/plugins/${pluginId}/frontend/hooks/${hookPoint}.js`;
}
