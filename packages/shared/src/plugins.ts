/** Plugin types that cross the wire between backend and frontend.
 *
 *  Runtime-side-only types (PluginManifest with FastifyBaseLogger refs, PluginContext,
 *  UIContribution as seen by the engine) stay in the backend — they reference Node/Fastify
 *  internals that don't belong in a pure-types shared package. Only the public contract
 *  shapes consumed by the frontend live here. */

/** A plugin's published UI contribution, enriched with its owning plugin's id by the engine
 *  before reaching the frontend. */
export interface PluginUIContribution {
  pluginId: string;
  hookPoint: string;
  props: Record<string, unknown>;
  order?: number;
}

/** Public plugin info as returned by `GET /api/plugins`. Consumed by the admin plugins tab,
 *  consent modals, the registry view, and the update banner. */
export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  enabled: boolean;
  hasSettings: boolean;
  hasFrontend: boolean;
  error?: string;
  compat?: {
    status: 'verified' | 'untested' | 'incompatible' | 'unknown';
    range?: string;
    oscarrVersion: string;
    reason?: string;
  };
  /** Populated by the backend from the update-check cache (GET /api/plugins/updates). */
  latestVersion?: string | null;
  lastUpdateCheck?: string | null;
  updateAvailable?: boolean;
  services?: string[];
  capabilities?: string[];
  capabilityReasons?: Partial<Record<string, string>>;
}

/** A single plugin settings field as published in the manifest. Shown in the admin plugin
 *  settings form. Runtime handling of `type: 'password'` lives on the backend. */
export interface PluginSettingDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'password';
  required?: boolean;
  default?: unknown;
}

/** Snapshot of a plugin's settings (schema + current values) served by
 *  `GET /api/plugins/:id/settings`. */
export interface PluginSettings {
  schema: PluginSettingDef[];
  values: Record<string, unknown>;
}
