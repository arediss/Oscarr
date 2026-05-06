/** Plugin source classifier. Source of truth: `PluginState.installSource`. Symlinks force 'local'. */
import semver from 'semver';
import type { LoadedPlugin, PluginRuntimeStatus, PluginSource } from './types.js';

export interface DetectionContext {
  /** Latest version persisted by the update checker. Null when no check ran yet or the
   *  plugin isn't a registry install. */
  latestVersion: string | null;
  /** Persisted state. `installSource` is the authoritative source of truth (set at install).
   *  `autoUpdateEnabled` drives the per-plugin toggle (consumed by the future auto-update job). */
  pluginState: { installSource: string; autoUpdateEnabled: boolean } | null;
}

/** Anything other than 'registry' collapses to 'local' — keeps the model binary and resilient
 *  to bad/legacy values. */
function classifyPluginSource(args: { isSymlink: boolean; persistedSource: string | null }): PluginSource {
  if (args.isSymlink) return 'local';
  return args.persistedSource === 'registry' ? 'registry' : 'local';
}

/** Compatibility (engines.oscarr) is NOT checked here — that gate runs at install/update
 *  preflight and inside the auto-update job. */
export function isUpdateAvailable(installed: string, latest: string | null): boolean {
  if (!latest || latest === installed) return false;
  if (!semver.valid(installed) || !semver.valid(latest)) return latest !== installed;
  return semver.gt(latest, installed);
}

export function buildRuntimeStatus(plugin: LoadedPlugin, ctx: DetectionContext): PluginRuntimeStatus {
  const isSymlink = plugin.isSymlink === true;
  const source = classifyPluginSource({
    isSymlink,
    persistedSource: ctx.pluginState?.installSource ?? null,
  });
  const updateAvailable = source === 'registry' && isUpdateAvailable(plugin.manifest.version, ctx.latestVersion);

  return {
    source,
    isSymlink,
    installedVersion: plugin.manifest.version,
    latestVersion: source === 'registry' ? ctx.latestVersion : null,
    updateAvailable,
    autoUpdateEnabled: ctx.pluginState?.autoUpdateEnabled ?? false,
  };
}
