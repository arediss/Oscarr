import type { PluginContext, PluginManifest } from '../types.js';
import { createContextV1, clearLogRateCounter, type V1FactoryDeps } from './v1.js';

export { clearLogRateCounter };

// ─── Public types ──────────────────────────────────────────────────

/** Union of all dep interfaces accepted by context factories. */
export type ContextFactoryDeps = V1FactoryDeps;

/** Signature shared by every versioned factory function. */
type ContextFactory = (manifest: PluginManifest, deps: ContextFactoryDeps) => PluginContext;

// ─── Registry ──────────────────────────────────────────────────────

const contextFactories = new Map<string, ContextFactory>([
  ['v1', createContextV1],
]);

// ─── Public API ────────────────────────────────────────────────────

/**
 * Create a PluginContext for the given manifest, dispatching to the
 * correct versioned factory based on `manifest.apiVersion`.
 */
export function createContext(manifest: PluginManifest, deps: ContextFactoryDeps): PluginContext {
  const factory = contextFactories.get(manifest.apiVersion);
  if (!factory) {
    throw new Error(
      `Unsupported plugin API version "${manifest.apiVersion}" ` +
        `(plugin: "${manifest.id}"). Supported: ${getSupportedVersions().join(', ')}`,
    );
  }
  return factory(manifest, deps);
}

/** List all API versions the engine can serve. */
export function getSupportedVersions(): string[] {
  return Array.from(contextFactories.keys());
}

/** Check whether a specific API version is supported. */
export function isVersionSupported(version: string): boolean {
  return contextFactories.has(version);
}
