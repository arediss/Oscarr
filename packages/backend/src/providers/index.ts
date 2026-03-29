import { plexProvider } from './plex/index.js';
import { radarrProvider } from './radarr/index.js';
import { sonarrProvider } from './sonarr/index.js';
import { qbittorrentProvider } from './qbittorrent/index.js';
import { tautulliProvider } from './tautulli/index.js';
import type { Provider, ServiceDefinition, AuthProvider } from './types.js';

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

// Re-export types
export type { Provider, ServiceDefinition, AuthProvider, AuthHelpers, AuthProviderConfig, ServiceField } from './types.js';
