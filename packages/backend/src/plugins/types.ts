import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import type { NotificationRegistry } from '../notifications/registry.js';
import type { NotificationPayload } from '../notifications/types.js';
import type { ArrClient } from '../providers/types.js';

// ─── Plugin Manifest (manifest.json) ────────────────────────────────

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: 'v1';
  description?: string;
  author?: string;
  entry: string;
  frontend?: string;
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

// ─── Plugin Context (V1 API passed to plugins) ──────────────────────

export interface PluginContext {
  getUser(userId: number): Promise<{ id: number; email: string; displayName: string | null; role: string } | null>;
  getAppSettings(): Promise<Record<string, unknown>>;
  log: FastifyBaseLogger;
  getSetting(key: string): Promise<unknown>;
  setSetting(key: string, value: unknown): Promise<void>;
  sendNotification(type: string, data: NotificationPayload): Promise<void>;
  sendUserNotification(userId: number, payload: { type: string; title: string; message: string; metadata?: Record<string, unknown> }): Promise<void>;
  notificationRegistry: NotificationRegistry;
  getArrClient(serviceType: string): Promise<ArrClient>;
  getServiceConfig(serviceType: string): Promise<{ url: string; apiKey: string } | null>;
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
  registerRoutes?(app: FastifyInstance, ctx: PluginContext): Promise<void>;
  registerJobs?(ctx: PluginContext): Record<string, () => Promise<unknown>>;
  registerGuards?(ctx: PluginContext): Record<string, (userId: number) => Promise<PluginGuardResult | null>>;
  registerNotificationProviders?(registry: NotificationRegistry): void;
  onInstall?(ctx: PluginContext): Promise<void>;
}

// ─── Internal types ─────────────────────────────────────────────────

export interface LoadedPlugin {
  manifest: PluginManifest;
  registration: PluginRegistration;
  dir: string;
  enabled: boolean;
  error?: string;
}

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
}
