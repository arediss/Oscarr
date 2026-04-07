import type { FastifyInstance } from 'fastify';

// ─── Arr Client Shared Types ────────────────────────────────────────

export interface ArrTag { id: number; label: string }
export interface ArrQualityProfile { id: number; name: string }
export interface ArrRootFolder { id: number; path: string; freeSpace: number }

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
  importUsers?(adminUserId: number): Promise<{ imported: number; skipped: number; total: number }>;
  getToken?(adminUserId: number): Promise<string | null>;
}

// ─── Unified Provider ───────────────────────────────────────────────

export interface Provider {
  service: ServiceDefinition;
  auth?: AuthProvider;
}
