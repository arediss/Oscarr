import type { FastifyInstance } from 'fastify';

// ─── Arr Client Shared Types ────────────────────────────────────────

export interface ArrTag { id: number; label: string }
export interface ArrQualityProfile { id: number; name: string }
export interface ArrRootFolder { id: number; path: string; freeSpace: number }

// ─── Normalized types for business logic ────────────────────────────

export interface ArrMediaItem {
  serviceMediaId: number;
  externalId: number;
  title: string;
  status: string;
  posterPath: string | null;
  backdropPath: string | null;
  qualityProfileId: number;
  addedDate: string | null;
  tags: number[];
  hasFile: boolean;
  seasons?: ArrSeasonItem[];
}

export interface ArrSeasonItem {
  seasonNumber: number;
  monitored: boolean;
  episodeFileCount: number;
  totalEpisodeCount: number;
  percentComplete: number;
  status: string;
}

export interface ArrAvailabilityResult {
  available: boolean;
  audioLanguages: string[] | null;
  subtitleLanguages: string[] | null;
  seasonStats?: { seasonNumber: number; episodeFileCount: number; episodeCount: number; totalEpisodeCount: number }[];
}

export interface ArrHistoryEntry {
  serviceMediaId: number;
  date: Date;
  extraData?: Record<string, unknown>;
}

export interface ArrEpisode {
  episodeNumber: number;
  title: string;
  airDateUtc: string | null;
  hasFile: boolean;
  monitored: boolean;
  quality: string | null;
  size: number | null;
}

export interface ArrWebhookEvent {
  type: 'download' | 'grab' | 'added' | 'deleted' | 'test' | 'unknown';
  externalId: number;
  title: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface ArrAddMediaOptions {
  title: string;
  externalId: number;
  qualityProfileId: number;
  rootFolderPath: string;
  tags: number[];
  seasons?: number[];
  seriesType?: string;
}

export interface ArrClient {
  getTags(): Promise<ArrTag[]>;
  createTag(label: string): Promise<ArrTag>;
  getOrCreateTag(username: string): Promise<number>;
  getQualityProfiles(): Promise<ArrQualityProfile[]>;
  getRootFolders(): Promise<ArrRootFolder[]>;
  getSystemStatus(): Promise<{ version: string }>;
  getQueue(): Promise<{ records: unknown[] }>;
  getHistory(since?: Date | null): Promise<unknown[]>;
  getCalendar(start: string, end: string): Promise<unknown[]>;

  // Sync
  getAllMedia(): Promise<ArrMediaItem[]>;

  // Live check
  checkAvailability(externalId: number): Promise<ArrAvailabilityResult>;

  // Request dispatch
  findByExternalId(externalId: number): Promise<{ id: number } | null>;
  addMedia(options: ArrAddMediaOptions): Promise<void>;
  searchMedia(serviceMediaId: number): Promise<void>;
  deleteMedia(serviceMediaId: number, deleteFiles?: boolean): Promise<void>;

  // Normalized history
  getHistoryEntries(since?: Date | null): Promise<ArrHistoryEntry[]>;

  // Episodes (TV only — optional, not implemented by movie providers)
  getEpisodesNormalized?(serviceMediaId: number, seasonNumber?: number): Promise<ArrEpisode[]>;

  // Webhooks
  parseWebhookPayload?(body: unknown): ArrWebhookEvent | null;
  registerWebhook?(name: string, url: string, apiKey: string): Promise<number>;
  removeWebhook?(webhookId: number): Promise<void>;
  checkWebhookExists?(webhookId: number): Promise<boolean>;
  getWebhookEvents?(): { key: string; label: string; description: string }[];

  // Metadata
  readonly mediaType: 'movie' | 'tv';
  readonly serviceType: string;
  readonly dbIdField: 'radarrId' | 'sonarrId';
  readonly defaultRootFolder: string;
}

// ─── Shared image extraction utility ────────────────────────────────

export function extractImageFromArr(images: { coverType: string; remoteUrl: string }[] | undefined, type: 'poster' | 'fanart'): string | null {
  const url = images?.find(i => i.coverType === type)?.remoteUrl;
  if (!url) return null;
  const match = url.match(/\/t\/p\/\w+(\/.+?)(?:\?|$)/);
  if (match) return match[1];
  // For non-TMDB URLs (TVDB etc.), store the full URL
  if (url.startsWith('http')) return url;
  return null;
}

// ─── Service Definition ─────────────────────────────────────────────

export interface ServiceField {
  key: string;
  labelKey: string; // i18n key — translated by the frontend
  type: 'text' | 'password';
  placeholder?: string;
  helper?: string; // e.g. 'plex-oauth', 'plex-detect-machine-id'
}

export interface ServiceDefinition {
  id: string;
  label: string;
  icon: string; // URL to provider icon
  category: 'arr' | 'media-server' | 'download-client' | 'monitoring';
  fields: ServiceField[];
  test(config: Record<string, string>): Promise<{ ok: boolean; version?: string }>;
  createClient?(config: Record<string, string>): ArrClient;
}

// ─── Auth Provider ──────────────────────────────────────────────────

export interface AuthProviderConfig {
  id: string;
  label: string;
  type: 'oauth' | 'credentials';
}

export interface AuthHelpers {
  signAndSend: (reply: import('fastify').FastifyReply, userId: number) => Promise<void>;
  findOrCreateUser: (opts: {
    provider: string;
    providerId: string;
    providerToken?: string;
    providerUsername?: string;
    providerEmail?: string;
    email: string;
    displayName: string;
    avatar?: string | null;
  }) => Promise<{
    id: number;
    email: string;
    displayName: string | null;
    avatar: string | null;
    role: string;
    providers: { provider: string; providerUsername: string | null; providerEmail: string | null }[];
    isNew: boolean;
  }>;
}

export interface AuthProvider {
  config: AuthProviderConfig;
  registerRoutes(app: FastifyInstance, helpers: AuthHelpers): Promise<void>;
  linkAccount?(pinId: number, userId: number): Promise<{ providerUsername: string }>;
  linkAccountByCredentials?(username: string, password: string, userId: number): Promise<{ providerUsername: string }>;
  importUsers?(adminUserId: number): Promise<{ imported: number; skipped: number; total: number }>;
  getToken?(adminUserId: number): Promise<string | null>;
}

// ─── Unified Provider ───────────────────────────────────────────────

export interface Provider {
  service: ServiceDefinition;
  auth?: AuthProvider;
}
