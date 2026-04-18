import type { FastifyBaseLogger } from 'fastify';
import type { NotificationRegistry } from '../notifications/registry.js';
import type { NotificationPayload } from '../notifications/types.js';
import type { ArrClient } from '../providers/types.js';
import type { PluginRouter } from './router.js';

// ─── Plugin Manifest (manifest.json) ────────────────────────────────

export type PluginCapability =
  | 'users:read'
  | 'users:write'
  | 'settings:plugin'
  | 'settings:app'
  | 'notifications'
  | 'permissions'
  | 'events';

export const ALL_CAPABILITIES: readonly PluginCapability[] = [
  'users:read',
  'users:write',
  'settings:plugin',
  'settings:app',
  'notifications',
  'permissions',
  'events',
] as const;

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: 'v1';
  description?: string;
  author?: string;
  entry: string;
  frontend?: string;
  /** Compatibility declaration. `oscarr` is a semver range the author claims to support;
   *  `testedAgainst` lists Oscarr versions explicitly verified to work. Missing = 'unknown' status. */
  engines?: {
    oscarr: string;
    testedAgainst?: string[];
  };
  /** Services whose config the plugin is allowed to read via getServiceConfig / getServiceConfigRaw.
   *  Any service not listed here returns null and is logged. Empty / missing = no service access. */
  services?: string[];
  /** Capability buckets the plugin requests. Any ctx method outside the declared buckets throws at call
   *  time. `log` and `services:*` are gated separately (log = always granted, services = via `services`). */
  capabilities?: PluginCapability[];
  /** Optional per-capability justification shown in the admin consent prompt on enable. */
  capabilityReasons?: Partial<Record<PluginCapability, string>>;
  settings?: PluginSettingDef[];
  hooks?: {
    routes?: { prefix: string };
    jobs?: PluginJobDef[];
    ui?: UIContribution[];
    features?: Record<string, boolean>;
  };
}

export interface PluginSettingDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'password';
  required?: boolean;
  default?: unknown;
}

export interface PluginJobDef {
  key: string;
  label: string;
  cron: string;
}

export interface UIContribution {
  hookPoint: string;
  props: Record<string, unknown>;
  order?: number;
}

/** UIContribution enriched with the owning plugin's id (returned by engine) */
export interface LoadedUIContribution extends UIContribution {
  pluginId: string;
}

// ─── Plugin Context (V1 API passed to plugins) ──────────────────────

export interface PluginContext {
  log: FastifyBaseLogger;
  getUser(userId: number): Promise<{ id: number; email: string; displayName: string | null; role: string } | null>;
  /** Assign a role to a user. Throws if the role doesn't exist. */
  setUserRole(userId: number, roleName: string): Promise<void>;
  /** Enable or disable an Oscarr user. Disabled users are rejected at login per AppSettings.disabledLoginMode (friendly message vs silent block). Admins cannot be disabled via this method — throws if you try, to protect the server owner from accidental lockout. */
  setUserDisabled(userId: number, disabled: boolean): Promise<void>;
  /** Mint an auth JWT for the given user. Caller is responsible for delivering it (cookie, response body, etc.). */
  issueAuthToken(userId: number): Promise<string>;
  /** Returns the plugin's dedicated data folder (creates it if missing). Absolute path under {backendRoot}/data/plugins/{pluginId}/. */
  getPluginDataDir(): Promise<string>;
  getAppSettings(): Promise<Record<string, unknown>>;
  getSetting(key: string): Promise<unknown>;
  setSetting(key: string, value: unknown): Promise<void>;
  sendNotification(type: string, data: NotificationPayload): Promise<void>;
  sendUserNotification(userId: number, payload: { type: string; title: string; message: string; metadata?: Record<string, unknown> }): Promise<void>;
  notificationRegistry: NotificationRegistry;
  getArrClient(serviceType: string): Promise<ArrClient>;
  getServiceConfig(serviceType: string): Promise<{ url: string; apiKey: string } | null>;
  /** Returns the full raw JSON config of a configured service (whatever fields the provider chose to store). Use when you need more than the common url/apiKey subset. */
  getServiceConfigRaw(serviceType: string): Promise<Record<string, unknown> | null>;
  /** Returns the external auth providers linked to an Oscarr user (identity info only — no tokens). */
  getUserProviders(userId: number): Promise<Array<{ provider: string; providerId: string | null; providerUsername: string | null; providerEmail: string | null }>>;
  registerRoutePermission(routeKey: string, rule: { permission: string; ownerScoped?: boolean }): void;
  registerPluginPermission(permission: string, description?: string): void;
  events: {
    on(event: string, handler: (data: unknown) => void | Promise<void>): void;
    off(event: string, handler: (data: unknown) => void | Promise<void>): void;
    emit(event: string, data: unknown): Promise<void>;
  };
}

// ─── Plugin Registration (what register() returns) ──────────────────

/** Guard result — return null to allow, or an error to block */
export interface PluginGuardResult {
  blocked: true;
  error: string;
  statusCode?: number;
}

export interface PluginRegistration {
  manifest: PluginManifest;
  registerRoutes?(app: PluginRouter, ctx: PluginContext): Promise<void>;
  registerJobs?(ctx: PluginContext): Record<string, () => Promise<unknown>>;
  registerGuards?(ctx: PluginContext): Record<string, (userId: number) => Promise<PluginGuardResult | null>>;
  registerNotificationProviders?(registry: NotificationRegistry): void;
  onInstall?(ctx: PluginContext): Promise<void>;
  onEnable?(ctx: PluginContext): Promise<void>;
  onDisable?(ctx: PluginContext): Promise<void>;
}

// ─── Internal types ─────────────────────────────────────────────────

export interface LoadedPlugin {
  manifest: PluginManifest;
  registration: PluginRegistration;
  dir: string;
  enabled: boolean;
  error?: string;
}

/** Public shape returned by getPluginList() — consumed by the frontend */
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
  /** Latest version seen by the last `/updates` check — populated from PluginState, null if never checked. */
  latestVersion?: string | null;
  lastUpdateCheck?: string | null;
  updateAvailable?: boolean;
  /** Surfaced from manifest so the admin UI can render the consent prompt before an enable. */
  services?: string[];
  capabilities?: string[];
  capabilityReasons?: Partial<Record<string, string>>;
}
