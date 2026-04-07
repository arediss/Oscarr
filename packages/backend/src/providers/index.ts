import { plexProvider } from './plex/index.js';
import { radarrProvider } from './radarr/index.js';
import { sonarrProvider } from './sonarr/index.js';
import { qbittorrentProvider } from './qbittorrent/index.js';
import { tautulliProvider } from './tautulli/index.js';
import type { Provider, ServiceDefinition, AuthProvider, ArrClient } from './types.js';
import { getServiceConfig } from '../utils/services.js';

// ─── Provider Registry ──────────────────────────────────────────────
// Add new providers here — they auto-register everywhere
const ALL_PROVIDERS: Provider[] = [
  radarrProvider,
  sonarrProvider,
  plexProvider,
  qbittorrentProvider,
  tautulliProvider,
];

// ─── Service queries ────────────────────────────────────────────────

export function getServiceDefinition(type: string): ServiceDefinition | undefined {
  return ALL_PROVIDERS.find((p) => p.service.id === type)?.service;
}

export function getAllServiceDefinitions(): ServiceDefinition[] {
  return ALL_PROVIDERS.map((p) => p.service);
}

/** Return schemas for the frontend (fields, icon, label — no test function) */
export function getServiceSchemas() {
  return ALL_PROVIDERS.map((p) => ({
    id: p.service.id,
    label: p.service.label,
    icon: p.service.icon,
    category: p.service.category,
    fields: p.service.fields,
  }));
}

// ─── Auth queries ───────────────────────────────────────────────────

export function getAuthProviders(): AuthProvider[] {
  return ALL_PROVIDERS.filter((p) => p.auth).map((p) => p.auth!);
}

export function getAuthProvider(id: string): AuthProvider | undefined {
  return ALL_PROVIDERS.find((p) => p.auth?.config.id === id)?.auth;
}

export function getAuthProviderConfigs() {
  return [
    { id: 'email', label: 'Email', type: 'credentials' as const },
    ...getAuthProviders().map((p) => p.config),
  ];
}

// ─── Arr Client Factory & Caching ───────────────────────────────────

const _defaultCache = new Map<string, { instance: ArrClient; configKey: string }>();
const _serviceCache = new Map<number, { instance: ArrClient; configKey: string }>();

export async function getArrClient(type: string): Promise<ArrClient> {
  const config = await getServiceConfig(type);
  if (!config?.url || !config?.apiKey) throw new Error(`No ${type} service configured`);
  const configKey = `${config.url}|${config.apiKey}`;
  const cached = _defaultCache.get(type);
  if (cached && cached.configKey === configKey) return cached.instance;
  const def = getServiceDefinition(type);
  if (!def?.createClient) throw new Error(`Provider "${type}" does not support client creation`);
  const instance = def.createClient(config);
  _defaultCache.set(type, { instance, configKey });
  return instance;
}

export function getArrClientForService(serviceId: number, serviceType: string, config: Record<string, string>): ArrClient {
  const configKey = `${config.url}|${config.apiKey}`;
  const cached = _serviceCache.get(serviceId);
  if (cached && cached.configKey === configKey) return cached.instance;
  const def = getServiceDefinition(serviceType);
  if (!def?.createClient) throw new Error(`Provider "${serviceType}" does not support client creation`);
  const instance = def.createClient(config);
  _serviceCache.set(serviceId, { instance, configKey });
  return instance;
}

export function createArrClient(type: string, config: Record<string, string>): ArrClient {
  const def = getServiceDefinition(type);
  if (!def?.createClient) throw new Error(`Provider "${type}" does not support client creation`);
  return def.createClient(config);
}

const MEDIA_TYPE_TO_SERVICE: Record<string, string> = { movie: 'radarr', tv: 'sonarr' };
export function getServiceTypeForMedia(mediaType: string): string {
  const type = MEDIA_TYPE_TO_SERVICE[mediaType];
  if (!type) throw new Error(`No service type for media type "${mediaType}"`);
  return type;
}

// Re-export types
export type { Provider, ServiceDefinition, AuthProvider, AuthHelpers, AuthProviderConfig, ServiceField, ArrClient } from './types.js';
