import { readdir, readFile, stat, access } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PluginManifest } from './types.js';
import { parseManifest } from './manifestSchema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Resolve the plugins directory. Supports OSCARR_PLUGINS_DIR env var. */
export function getPluginsDir(): string {
  if (process.env.OSCARR_PLUGINS_DIR) return resolve(process.env.OSCARR_PLUGINS_DIR);
  return resolve(__dirname, '../../../plugins');
}

export interface DiscoveredPlugin {
  dir: string;
  manifest: PluginManifest;
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

    // Follow symlinks: stat() follows symlinks, isDirectory() doesn't for symlink entries
    const entryPath = join(pluginsDir, entry.name);
    const entryStat = await stat(entryPath);
    if (!entryStat.isDirectory()) continue;

    const manifestPath = join(entryPath, 'manifest.json');

    try {
      // Read directly — if the file doesn't exist, readFile throws and we skip
      const raw = await readFile(manifestPath, 'utf-8');
      const data = JSON.parse(raw);
      const manifest = parseManifest(data, entryPath) as PluginManifest;
      plugins.push({ dir: entryPath, manifest });
    } catch (err) {
      console.error(`[PluginLoader] Failed to load manifest from ${entryPath}:`, err);
    }
  }

  return plugins;
}
