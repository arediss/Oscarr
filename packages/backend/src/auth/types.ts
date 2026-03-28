import type { FastifyInstance } from 'fastify';

export interface AuthResult {
  email: string;
  displayName: string;
  avatar?: string | null;
  providerData: Record<string, unknown>;
}

export interface AuthProviderConfig {
  id: string;
  label: string;
  type: 'oauth' | 'credentials';
}

export interface AuthProvider {
  config: AuthProviderConfig;
  registerRoutes(app: FastifyInstance, helpers: AuthHelpers): Promise<void>;
  /** Link this provider to an existing user account (OAuth PIN flow) */
  linkAccount?(pinId: number, userId: number): Promise<{ providerUsername: string }>;
  /** Import users from this provider's external system (e.g. Plex shared users, Jellyfin users) */
  importUsers?(adminUserId: number): Promise<{ imported: number; skipped: number; total: number }>;
  /** Get a valid API token for this provider (from service config or user provider) */
  getToken?(adminUserId: number): Promise<string | null>;
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
  }) => Promise<{ id: number; email: string; displayName: string | null; avatar: string | null; role: string; providers: { provider: string; providerUsername: string | null; providerEmail: string | null }[]; isNew: boolean }>;
}
