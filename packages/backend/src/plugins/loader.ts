import { readdir, readFile, stat, access } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PluginManifest } from './types.js';
import { isVersionSupported, getSupportedVersions } from './context/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Resolve the plugins directory. Supports OSCARR_PLUGINS_DIR env var. */
function getPluginsDir(): string {
  if (process.env.OSCARR_PLUGINS_DIR) return resolve(process.env.OSCARR_PLUGINS_DIR);
  return resolve(__dirname, '../../../plugins');
}

export interface DiscoveredPlugin {
  dir: string;
  manifest: PluginManifest;
}

function validateManifest(data: unknown, dir: string): PluginManifest {
  const m = data as Record<string, unknown>;
  if (!m.id || typeof m.id !== 'string') throw new Error(`Missing or invalid "id" in ${dir}`);
  if (!m.name || typeof m.name !== 'string') throw new Error(`Missing or invalid "name" in ${dir}`);
  if (!m.version || typeof m.version !== 'string') throw new Error(`Missing or invalid "version" in ${dir}`);
  if (typeof m.apiVersion !== 'string' || !isVersionSupported(m.apiVersion)) {
    throw new Error(
      `Unsupported apiVersion "${m.apiVersion}" in ${dir}. Supported: ${getSupportedVersions().join(', ')}`
    );
  }
  if (!m.entry || typeof m.entry !== 'string') throw new Error(`Missing or invalid "entry" in ${dir}`);

  // Validate hooks shape if present
  if (m.hooks !== undefined && (typeof m.hooks !== 'object' || m.hooks === null)) {
    throw new Error(`Invalid "hooks" in ${dir}: must be an object`);
  }
  const hooks = m.hooks as Record<string, unknown> | undefined;
  if (hooks?.routes !== undefined) {
    if (typeof hooks.routes !== 'object' || hooks.routes === null || typeof (hooks.routes as any).prefix !== 'string') {
      throw new Error(`Invalid "hooks.routes" in ${dir}: must be { prefix: string }`);
    }
  }
  if (hooks?.jobs !== undefined && !Array.isArray(hooks.jobs)) {
    throw new Error(`Invalid "hooks.jobs" in ${dir}: must be an array`);
  }
  if (hooks?.ui !== undefined && !Array.isArray(hooks.ui)) {
    throw new Error(`Invalid "hooks.ui" in ${dir}: must be an array`);
  }
  if (hooks?.features !== undefined && (typeof hooks.features !== 'object' || hooks.features === null)) {
    throw new Error(`Invalid "hooks.features" in ${dir}: must be an object`);
  }

  // Validate settings shape if present
  if (m.settings !== undefined && !Array.isArray(m.settings)) {
    throw new Error(`Invalid "settings" in ${dir}: must be an array`);
  }

  return data as PluginManifest;
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
      await access(manifestPath);
    } catch {
      continue; // No manifest.json — skip
    }

    try {
      const raw = await readFile(manifestPath, 'utf-8');
      const data = JSON.parse(raw);
      const manifest = validateManifest(data, entryPath);
      plugins.push({ dir: entryPath, manifest });
    } catch (err) {
      console.error(`[PluginLoader] Failed to load manifest from ${entryPath}:`, err);
    }
  }

  return plugins;
}
