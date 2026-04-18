import type { FastifyInstance } from 'fastify';
import type { AuthProvider, AuthHelpers, Provider, ServiceDefinition } from '../types.js';

/**
 * Email is a first-class auth provider even though it has no matching media service.
 * Login is still served by the generic /api/auth/login route; this file exists so email
 * appears in the Authentication admin tab alongside OAuth providers and owns its enabled
 * flag via AuthProviderSettings.
 */

const emailService: ServiceDefinition = {
  id: 'email',
  label: 'Email',
  icon: '',
  category: 'media-server', // unused — getAllServiceDefinitions filters email out
  fields: [],
  test: async () => ({ ok: true }),
};

const emailAuth: AuthProvider = {
  config: {
    id: 'email',
    label: 'Email',
    type: 'credentials',
    configSchema: [],
  },
  async registerRoutes(_app: FastifyInstance, _helpers: AuthHelpers) {
    // No-op: /api/auth/register + /api/auth/login are registered globally, not per-provider.
  },
};

export const emailProvider: Provider = { service: emailService, auth: emailAuth };
