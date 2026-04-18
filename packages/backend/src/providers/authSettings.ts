import { prisma } from '../utils/prisma.js';

/**
 * Auth provider settings are stored in AuthProviderSettings (migration 20260418203028).
 * Upsert-on-read means a brand-new provider (added to code after initial migration) gets a
 * disabled row automatically on first query — no manual seed needed.
 */

export interface AuthProviderSettingsRow {
  enabled: boolean;
  config: Record<string, unknown>;
}

/** Read (or create-then-read) a provider's settings row. */
export async function getProviderSettings(providerId: string): Promise<AuthProviderSettingsRow> {
  const row = await prisma.authProviderSettings.upsert({
    where: { provider: providerId },
    update: {},
    create: { provider: providerId, enabled: false, config: '{}' },
  });
  return { enabled: row.enabled, config: safeParseConfig(row.config) };
}

/** Just the JSON config — use when you need a specific field. */
export async function getProviderConfig(providerId: string): Promise<Record<string, unknown>> {
  const { config } = await getProviderSettings(providerId);
  return config;
}

/** Every row, for the admin UI grid. */
export async function listAllProviderSettings(): Promise<
  Array<{ provider: string; enabled: boolean; config: Record<string, unknown> }>
> {
  const rows = await prisma.authProviderSettings.findMany({ orderBy: { provider: 'asc' } });
  return rows.map((r) => ({ provider: r.provider, enabled: r.enabled, config: safeParseConfig(r.config) }));
}

/**
 * Patch a provider's row. `config` is merged shallowly with the existing blob so the UI can
 * PATCH a single field without sending the whole config back.
 */
export async function updateProviderSettings(
  providerId: string,
  patch: { enabled?: boolean; config?: Record<string, unknown> }
): Promise<void> {
  const current = await getProviderSettings(providerId);
  const nextConfig = patch.config ? { ...current.config, ...patch.config } : current.config;
  await prisma.authProviderSettings.upsert({
    where: { provider: providerId },
    update: {
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      config: JSON.stringify(nextConfig),
    },
    create: {
      provider: providerId,
      enabled: patch.enabled ?? false,
      config: JSON.stringify(nextConfig),
    },
  });
}

function safeParseConfig(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
