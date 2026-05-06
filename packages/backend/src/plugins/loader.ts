import { readdir, readFile, stat, lstat, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { PluginManifest } from './types.js';
import { parseManifest } from './manifestSchema.js';
import { PLUGINS_DIR } from '../utils/paths.js';

/** Resolve the plugins directory. Supports OSCARR_PLUGINS_DIR env var. */
export function getPluginsDir(): string {
  if (process.env.OSCARR_PLUGINS_DIR) return resolve(process.env.OSCARR_PLUGINS_DIR);
  return PLUGINS_DIR;
}

export interface DiscoveredPlugin {
  dir: string;
  manifest: PluginManifest;
  /** True when `dir` is a symlink — drives the "Local (dev)" status in the admin UI. */
  isSymlink: boolean;
}

export async function discoverPlugins(): Promise<DiscoveredPlugin[]> {
  const pluginsDir = getPluginsDir();

  try {
    await access(pluginsDir);
  } catch {
    return []; // Directory doesn't exist — no plugins
  }

  const entries = await readdir(pluginsDir, { withFileTypes: true });
  const plugins: DiscoveredPlugin[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // Skip hidden files/dirs

    // Follow symlinks for content (stat) but track whether the entry IS a symlink (lstat)
    // so the admin UI can badge dev-symlinked plugins as "Local". stat() throws on broken
    // symlinks — wrap so we skip those rather than abort the whole boot.
    const entryPath = join(pluginsDir, entry.name);
    let entryIsDirectory = false;
    let isSymlink = false;
    try {
      const entryStat = await stat(entryPath);
      entryIsDirectory = entryStat.isDirectory();
      const lstatResult = await lstat(entryPath);
      isSymlink = lstatResult.isSymbolicLink();
    } catch {
      continue;
    }
    if (!entryIsDirectory) continue;

    const manifestPath = join(entryPath, 'manifest.json');

    try {
      // Read directly — if the file doesn't exist, readFile throws and we skip
      const raw = await readFile(manifestPath, 'utf-8');
      const data = JSON.parse(raw);
      const manifest = parseManifest(data, entryPath) as PluginManifest;
      plugins.push({ dir: entryPath, manifest, isSymlink });
    } catch (err) {
      const { logEvent } = await import('../utils/logEvent.js');
      logEvent('error', 'PluginLoader', `Failed to load manifest from ${entryPath}: ${String(err)}`)
        .catch(() => { /* boot-time, AppLog may not be ready yet */ });
    }
  }

  return plugins;
}
