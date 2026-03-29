import type { FastifyInstance } from 'fastify';

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
