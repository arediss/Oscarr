import { readdir, readFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import type { PluginManifest } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = resolve(__dirname, '../../../plugins');

export interface DiscoveredPlugin {
  dir: string;
  manifest: PluginManifest;
}

function validateManifest(data: unknown, dir: string): PluginManifest {
  const m = data as Record<string, unknown>;
  if (!m.id || typeof m.id !== 'string') throw new Error(`Missing or invalid "id" in ${dir}`);
  if (!m.name || typeof m.name !== 'string') throw new Error(`Missing or invalid "name" in ${dir}`);
  if (!m.version || typeof m.version !== 'string') throw new Error(`Missing or invalid "version" in ${dir}`);
  if (m.apiVersion !== 'v1') throw new Error(`Unsupported apiVersion "${m.apiVersion}" in ${dir} (expected "v1")`);
  if (!m.entry || typeof m.entry !== 'string') throw new Error(`Missing or invalid "entry" in ${dir}`);
  return data as PluginManifest;
}

export async function discoverPlugins(): Promise<DiscoveredPlugin[]> {
  if (!existsSync(PLUGINS_DIR)) return [];

  const entries = await readdir(PLUGINS_DIR, { withFileTypes: true });
  const plugins: DiscoveredPlugin[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dir = join(PLUGINS_DIR, entry.name);
    const manifestPath = join(dir, 'manifest.json');

    if (!existsSync(manifestPath)) continue;

    try {
      const raw = await readFile(manifestPath, 'utf-8');
      const data = JSON.parse(raw);
      const manifest = validateManifest(data, dir);
      plugins.push({ dir, manifest });
    } catch (err) {
      console.error(`[PluginLoader] Failed to load manifest from ${dir}:`, err);
    }
  }

  return plugins;
}
