import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { getAuthProviders } from '../../providers/index.js';
import {
  getProviderConfig,
  getProviderSettings,
  listAllProviderSettings,
  updateProviderSettings,
} from '../../providers/authSettings.js';
import type { AuthProviderField } from '../../providers/types.js';
import { resolveOAuthCallbackUrl } from '../../utils/publicUrl.js';

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

/**
 * Build the cleaned config from a PATCH payload: keep only keys declared in the provider's
 * configSchema (drops `__proto__`/`constructor` and any typo'd field), and skip values that
 * still hold the MASK placeholder so the stored password isn't clobbered on save-with-no-edit.
 *
 * The per-key whitelist also satisfies CodeQL's "remote property injection" check — we never
 * write an attacker-controlled key to our output object.
 */
function buildCleanedConfig(
  patch: Record<string, unknown>,
  schema: AuthProviderField[] | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  const allowed = new Set(schema?.map((f) => f.key) ?? []);
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.has(k)) continue;
    if (v === MASK) continue;
    out[k] = v;
  }
  return out;
}

function validate(schema: AuthProviderField[] | undefined, config: Record<string, unknown>): string | null {
  if (!schema) return null;
  for (const field of schema) {
    const v = config[field.key];
    if (v === undefined || v === null) {
      if (field.required) return `Field "${field.label}" is required`;
      continue;
    }
    if (field.type === 'boolean') {
      if (typeof v !== 'boolean') return `Field "${field.label}" must be a boolean`;
      continue;
    }
    if (typeof v !== 'string') return `Field "${field.label}" must be a string`;
    if (field.required && v === '') return `Field "${field.label}" is required`;
    // URL fields must be http(s) — blocks javascript:/data:/file: schemes that could bite if
    // a future feature renders the value as a link (e.g. OIDC issuer URL).
    if (field.type === 'url' && v !== '' && !/^https?:\/\//i.test(v)) {
      return `Field "${field.label}" must be an http(s) URL`;
    }
  }
  return null;
}

export async function authProvidersRoutes(app: FastifyInstance) {
  app.get(PREFIX, async (request) => {
    const providers = getAuthProviders();
    // Reconcile: upsert-on-read every declared provider so a registry addition (e.g. a new
    // provider shipped in code) surfaces with its default disabled row instead of racing on the
    // first concurrent call that hits getProviderConfig.
    await Promise.all(providers.map((p) => getProviderSettings(p.config.id)));
    const [settings, services] = await Promise.all([
      listAllProviderSettings(),
      prisma.service.findMany({ select: { type: true, enabled: true } }),
    ]);
    const settingsById = new Map(settings.map((s) => [s.provider, s]));
    // For providers that require an admin-configured service (jellyfin, emby), map their id to
    // whether that Service exists AND is enabled. Lets the admin UI grey them out with a helpful
    // hint instead of pretending the toggle would actually enable a working login.
    const serviceEnabledByType = new Map(services.map((s) => [s.type, s.enabled]));

    return providers.map((p) => {
      const s = settingsById.get(p.config.id);
      const serviceAvailable = p.config.requiresService
        ? serviceEnabledByType.get(p.config.id) === true
        : true;
      // OAuth providers get a read-only `callbackUrl` computed from the current request so the
      // admin can copy it into the provider's portal. The same URL is sent back to the provider
      // at authorize + token-exchange time — we own it end-to-end, admin can't mistype it.
      const callbackUrl = p.config.type === 'oauth' ? resolveOAuthCallbackUrl(request, p.config.id) : undefined;
      return {
        id: p.config.id,
        label: p.config.label,
        type: p.config.type,
        configSchema: p.config.configSchema ?? [],
        requiresService: p.config.requiresService ?? false,
        serviceAvailable,
        callbackUrl,
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

      // Self-lockout guard: refuse to disable the last enabled provider. Without this an admin
      // who clicks the wrong power icon loses login access permanently — recovery is DB surgery.
      if (patch.enabled === false) {
        const allSettings = await listAllProviderSettings();
        const othersEnabled = allSettings.some((s) => s.provider !== id && s.enabled);
        if (!othersEnabled) {
          return reply.status(409).send({
            error: 'Cannot disable the last enabled auth provider — you would lose login access. Enable another provider first.',
          });
        }
      }

      const cleanedConfig = patch.config
        ? buildCleanedConfig(patch.config, provider.config.configSchema)
        : undefined;

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
