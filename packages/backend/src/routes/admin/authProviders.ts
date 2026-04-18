import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { getAuthProviders } from '../../providers/index.js';
import {
  getProviderConfig,
  listAllProviderSettings,
  updateProviderSettings,
} from '../../providers/authSettings.js';
import type { AuthProviderField } from '../../providers/types.js';

// adminRoutes is mounted with prefix '/api/admin', so paths here are relative.
const PREFIX = '/auth-providers';

/** Placeholder sent to the frontend for password-type fields with a stored value — keeps secrets server-side. */
const MASK = '__MASKED__';

function maskPasswords(schema: AuthProviderField[] | undefined, config: Record<string, unknown>): Record<string, unknown> {
  if (!schema) return config;
  const out: Record<string, unknown> = { ...config };
  for (const field of schema) {
    if (field.type === 'password' && typeof out[field.key] === 'string' && out[field.key]) {
      out[field.key] = MASK;
    }
  }
  return out;
}

/** Drop masked values from a PATCH so the stored password doesn't get overwritten with the placeholder. */
function stripMasked(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === MASK) continue;
    out[k] = v;
  }
  return out;
}

function validate(schema: AuthProviderField[] | undefined, config: Record<string, unknown>): string | null {
  if (!schema) return null;
  for (const field of schema) {
    const v = config[field.key];
    if (field.required && (v === undefined || v === null || v === '')) {
      return `Field "${field.label}" is required`;
    }
    if (v !== undefined && v !== null && typeof v !== 'string') {
      return `Field "${field.label}" must be a string`;
    }
  }
  return null;
}

export async function authProvidersRoutes(app: FastifyInstance) {
  app.get(PREFIX, async (request) => {
    const providers = getAuthProviders();
    const [settings, services] = await Promise.all([
      listAllProviderSettings(),
      prisma.service.findMany({ select: { type: true, enabled: true } }),
    ]);
    const settingsById = new Map(settings.map((s) => [s.provider, s]));
    // For providers that require an admin-configured service (jellyfin, emby), map their id to
    // whether that Service exists AND is enabled. Lets the admin UI grey them out with a helpful
    // hint instead of pretending the toggle would actually enable a working login.
    const serviceEnabledByType = new Map(services.map((s) => [s.type, s.enabled]));

    // Compute the public base URL Oscarr is being reached at, so we can suggest concrete callback
    // paths in the admin UI. Trust x-forwarded-* first (reverse proxy setups) with request.protocol
    // / request.hostname as fallback — those are Fastify-provided and already respect trustProxy.
    const fwdProto = (request.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
    const fwdHost = (request.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
    const proto = fwdProto || request.protocol;
    const host = fwdHost || request.hostname;
    const baseUrl = `${proto}://${host}`;

    return providers.map((p) => {
      const s = settingsById.get(p.config.id);
      const serviceAvailable = p.config.requiresService
        ? serviceEnabledByType.get(p.config.id) === true
        : true;
      // Inject a dynamic placeholder for Discord's redirectUri so the admin sees the exact URL
      // they need to register in Discord's OAuth2 settings without guessing. Keep provider-
      // specific logic here rather than bloating the generic AuthProviderField shape.
      const configSchema = (p.config.configSchema ?? []).map((field) => {
        if (p.config.id === 'discord' && field.key === 'redirectUri') {
          return { ...field, placeholder: `${baseUrl}/api/auth/discord/callback` };
        }
        return field;
      });
      return {
        id: p.config.id,
        label: p.config.label,
        type: p.config.type,
        configSchema,
        requiresService: p.config.requiresService ?? false,
        serviceAvailable,
        enabled: s?.enabled ?? false,
        config: maskPasswords(p.config.configSchema, s?.config ?? {}),
      };
    });
  });

  app.patch<{ Params: { id: string }; Body: { enabled?: boolean; config?: Record<string, unknown> } }>(
    `${PREFIX}/:id`,
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            config: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const provider = getAuthProviders().find((p) => p.config.id === id);
      if (!provider) return reply.status(404).send({ error: `Unknown provider "${id}"` });

      const patch = request.body;
      const cleanedConfig = patch.config ? stripMasked(patch.config) : undefined;

      if (cleanedConfig) {
        const current = await getProviderConfig(id);
        const merged = { ...current, ...cleanedConfig };
        const err = validate(provider.config.configSchema, merged);
        if (err) return reply.status(400).send({ error: err });
      }

      await updateProviderSettings(id, {
        enabled: patch.enabled,
        config: cleanedConfig,
      });
      return { ok: true };
    }
  );
}
