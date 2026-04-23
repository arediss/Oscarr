import type { ComponentType } from 'react';

interface CacheEntry {
  component: ComponentType<any> | null;
  loadedAt: number;
}

const cache = new Map<string, CacheEntry>();

const cssStyles = new Map<string, HTMLStyleElement>();

/** Attribute that plugin containers must carry — matches the scope prefix applied to their CSS. */
export const PLUGIN_SCOPE_ATTR = 'data-oscarr-plugin';

/** Extract the plugin id from a plugin asset URL. Both entry-point and hook-point URLs follow
 *  `/api/plugins/<pluginId>/frontend/...`, so the third path segment is the id. */
function pluginIdFromUrl(url: string): string | null {
  const match = url.match(/^\/api\/plugins\/([^/]+)\/frontend\//);
  return match ? (match[1] ?? null) : null;
}

/** Prefix every rule selector with the scope attribute. Skips keyframe step selectors. */
function scopePluginCss(css: string, scope: string): string {
  return css.replace(/([^{}@]+)\{/g, (match, selectorList: string) => {
    const trimmed = selectorList.trim();
    if (!trimmed) return match;
    if (/^(\d+(\.\d+)?%|from|to)(\s*,\s*(\d+(\.\d+)?%|from|to))*$/.test(trimmed)) return match;
    const scoped = trimmed
      .split(',')
      .map((s) => `${scope} ${s.trim()}`)
      .join(',');
    return `${scoped}{`;
  });
}

/** Fetch + scope + inject the plugin's compiled CSS bundle. One-shot per pluginId. */
async function ensurePluginCss(pluginId: string): Promise<void> {
  if (cssStyles.has(pluginId)) return;
  const existing = Array.from(document.head.querySelectorAll<HTMLStyleElement>('style[data-plugin-id]'))
    .find((el) => el.dataset.pluginId === pluginId);
  if (existing) {
    cssStyles.set(pluginId, existing);
    return;
  }

  try {
    const res = await fetch(`/api/plugins/${pluginId}/frontend/index.css`);
    if (!res.ok) {
      if (import.meta.env.DEV && res.status === 404) {
        console.warn(
          `Plugin "${pluginId}" did not ship a CSS bundle. Run \`npm run plugin:add-tailwind -- <plugin-dir>\` to enable Tailwind in the plugin.`,
        );
      }
      return;
    }
    const raw = await res.text();
    const scoped = scopePluginCss(raw, `[${PLUGIN_SCOPE_ATTR}="${CSS.escape(pluginId)}"]`);
    const style = document.createElement('style');
    style.dataset.pluginId = pluginId;
    style.textContent = scoped;
    document.head.appendChild(style);
    cssStyles.set(pluginId, style);
  } catch (err) {
    if (import.meta.env.DEV) console.warn(`Failed to inject CSS for plugin "${pluginId}"`, err);
  }
}

function removePluginCss(pluginId: string): void {
  const style = cssStyles.get(pluginId);
  if (!style) return;
  style.remove();
  cssStyles.delete(pluginId);
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
    for (const id of Array.from(cssStyles.keys())) removePluginCss(id);
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
