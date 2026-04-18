/** UI contribution from a plugin, enriched with pluginId by the engine */
export interface PluginUIContribution {
  pluginId: string;
  hookPoint: string;
  props: Record<string, unknown>;
  order?: number;
}

/** Public plugin info as returned by GET /api/plugins/ */
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
  /** Populated by the backend from the update-check cache (see GET /api/plugins/updates). */
  latestVersion?: string | null;
  lastUpdateCheck?: string | null;
  updateAvailable?: boolean;
  services?: string[];
  capabilities?: string[];
  capabilityReasons?: Record<string, string>;
}

export interface PluginSettingDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'password';
  required?: boolean;
  default?: unknown;
}

export interface PluginSettings {
  schema: PluginSettingDef[];
  values: Record<string, unknown>;
}

/** Props received by a plugin hook component */
export interface HookComponentProps {
  contribution: PluginUIContribution;
  context: Record<string, unknown>;
}
