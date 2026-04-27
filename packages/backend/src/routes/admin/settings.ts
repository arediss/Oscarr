import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../../utils/prisma.js';
import { logEvent } from '../../utils/logEvent.js';
import { safeNotify, invalidateSiteUrl } from '../../utils/safeNotify.js';
import { invalidateLanguageCache } from '../../services/tmdb.js';

export async function settingsRoutes(app: FastifyInstance) {
  // === SETUP STATUS ===
  // Returns warnings keyed by admin tab id, true when that tab needs the admin's attention
  // (missing required config). Rendered as red dots in the sidebar on the owning group + tab.
  app.get('/setup-status', async () => {
    const [arrService, qualityMappings, settings] = await Promise.all([
      prisma.service.findFirst({ where: { type: { in: ['radarr', 'sonarr'] }, enabled: true } }),
      prisma.qualityMapping.count(),
      prisma.appSettings.findUnique({ where: { id: 1 } }),
    ]);

    const warnings: Record<string, boolean> = {
      services: !arrService,
      quality: qualityMappings === 0,
      paths: !settings?.defaultMovieFolder || !settings?.defaultTvFolder,
    };

    return { warnings };
  });

  // === SETTINGS ===

  app.get('/settings', async (request, reply) => {

    let settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.appSettings.create({
        data: { id: 1, updatedAt: new Date() },
      });
    }
    const { apiKey: _omit, ...safeSettings } = settings;
    return {
      ...safeSettings,
      instanceLanguages: JSON.parse(settings.instanceLanguages),
    };
  });

  app.put('/settings', {
    schema: {
      body: {
        type: 'object',
        properties: {
          defaultQualityProfile: { type: 'number', description: 'Default quality profile ID' },
          defaultMovieFolder: { type: 'string', description: 'Default root folder for movies' },
          defaultTvFolder: { type: 'string', description: 'Default root folder for TV shows' },
          defaultAnimeFolder: { type: 'string', description: 'Default root folder for anime' },
          plexMachineId: { type: 'string', description: 'Plex server machine identifier' },
          notificationMatrix: { type: 'string', description: 'JSON matrix mapping event types to notification channels' },
          autoApproveRequests: { type: 'boolean', description: 'Automatically approve all requests' },
          missingSearchCooldownMin: { type: 'number', description: 'Cooldown in minutes before allowing another missing search' },
          requestsEnabled: { type: 'boolean', description: 'Enable the request system' },
          nsfwBlurEnabled: { type: 'boolean', description: 'Enable NSFW content blur' },
          supportEnabled: { type: 'boolean', description: 'Enable the support/ticket system' },
          calendarEnabled: { type: 'boolean', description: 'Enable the calendar feature' },
          siteName: { type: 'string', description: 'Custom site name' },
          siteUrl: { type: 'string', description: 'Public URL of the instance for notification links' },
          instanceLanguages: { type: 'array', items: { type: 'string' }, description: 'Instance languages (ISO 639-1 codes)' },
          disabledLoginMode: { type: 'string', enum: ['block', 'friendly'], description: 'How disabled accounts are rejected at login' },
        },
      },
    },
  }, async (request, reply) => {

    const body = request.body as {
      defaultQualityProfile?: number;
      defaultMovieFolder?: string;
      defaultTvFolder?: string;
      defaultAnimeFolder?: string;
      plexMachineId?: string;
      notificationMatrix?: string;
      autoApproveRequests?: boolean;
      missingSearchCooldownMin?: number;
      requestsEnabled?: boolean;
      nsfwBlurEnabled?: boolean;
      supportEnabled?: boolean;
      calendarEnabled?: boolean;
      siteName?: string;
      siteUrl?: string;
      instanceLanguages?: string[];
      disabledLoginMode?: 'block' | 'friendly';
    };

    const settings = await prisma.appSettings.upsert({
      where: { id: 1 },
      update: {
        defaultQualityProfile: body.defaultQualityProfile ?? undefined,
        defaultMovieFolder: body.defaultMovieFolder ?? undefined,
        defaultTvFolder: body.defaultTvFolder ?? undefined,
        defaultAnimeFolder: body.defaultAnimeFolder ?? undefined,
        plexMachineId: body.plexMachineId ?? undefined,
        notificationMatrix: body.notificationMatrix ?? undefined,
        autoApproveRequests: body.autoApproveRequests ?? undefined,
        missingSearchCooldownMin: body.missingSearchCooldownMin ?? undefined,
        requestsEnabled: body.requestsEnabled ?? undefined,
        nsfwBlurEnabled: body.nsfwBlurEnabled ?? undefined,
        supportEnabled: body.supportEnabled ?? undefined,
        calendarEnabled: body.calendarEnabled ?? undefined,
        siteName: body.siteName ?? undefined,
        siteUrl: body.siteUrl !== undefined ? (body.siteUrl?.trim() || null) : undefined,
        instanceLanguages: body.instanceLanguages ? JSON.stringify(body.instanceLanguages) : undefined,
        disabledLoginMode: body.disabledLoginMode ?? undefined,
      },
      create: {
        id: 1,
        defaultQualityProfile: body.defaultQualityProfile,
        defaultMovieFolder: body.defaultMovieFolder,
        defaultTvFolder: body.defaultTvFolder,
        defaultAnimeFolder: body.defaultAnimeFolder,
        plexMachineId: body.plexMachineId,
        notificationMatrix: body.notificationMatrix,
        autoApproveRequests: body.autoApproveRequests,
        missingSearchCooldownMin: body.missingSearchCooldownMin,
        requestsEnabled: body.requestsEnabled,
        supportEnabled: body.supportEnabled,
        calendarEnabled: body.calendarEnabled,
        siteName: body.siteName,
        instanceLanguages: body.instanceLanguages ? JSON.stringify(body.instanceLanguages) : undefined,
        disabledLoginMode: body.disabledLoginMode,
        updatedAt: new Date(),
      },
    });

    // If instance language changed, clear all caches to force re-fetch in new language.
    // invalidateSiteUrl flushes both the siteUrl AND the instance-language caches in
    // safeNotify — without it, plugin event-bus subscribers keep receiving the old
    // language's titleText/messageText until backend restart.
    if (body.instanceLanguages) {
      invalidateLanguageCache();
      invalidateSiteUrl();
      await prisma.tmdbCache.deleteMany();
      logEvent('info', 'Settings', 'TMDB cache cleared due to language change');
    }

    if (body.siteUrl !== undefined) invalidateSiteUrl();
    logEvent('info', 'Settings', 'Settings updated');
    return settings;
  });

  // === VERBOSE REQUEST LOG (debug toggle) ===
  // Persists every API request to AppLog while ON. Off by default to avoid filling the DB.

  app.get('/verbose-request-log', async () => {
    const s = await prisma.appSettings.findUnique({
      where: { id: 1 },
      select: { verboseRequestLog: true },
    });
    return { enabled: s?.verboseRequestLog === true };
  });

  app.put('/verbose-request-log', {
    schema: {
      body: {
        type: 'object',
        required: ['enabled'],
        properties: { enabled: { type: 'boolean' } },
      },
    },
  }, async (request) => {
    const { enabled } = request.body as { enabled: boolean };
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { verboseRequestLog: enabled },
      create: { id: 1, verboseRequestLog: enabled, updatedAt: new Date() },
    });
    const { setVerboseRequestLogFlag } = await import('../../utils/verboseRequestLog.js');
    setVerboseRequestLogFlag(enabled);
    logEvent('warn', 'Settings', `Verbose request log ${enabled ? 'enabled' : 'disabled'}`);
    return { ok: true };
  });

  // === BANNER ===

  app.put('/banner', {
    schema: {
      body: {
        type: 'object',
        properties: {
          banner: { type: ['string', 'null'], description: 'Incident banner message, or null to clear' },
        },
      },
    },
  }, async (request, reply) => {

    const { banner } = request.body as { banner: string | null };
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { incidentBanner: banner || null },
      create: { id: 1, incidentBanner: banner || null, updatedAt: new Date() },
    });
    if (banner) {
      safeNotify('incident_banner', { title: 'Incident', message: banner });
    }
    return { ok: true };
  });

  // ─── API Key management ─────────────────────────────────────────────

  app.get('/api-key', async () => {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings?.apiKey) return { hasKey: false, maskedKey: null };
    const key = settings.apiKey;
    return { hasKey: true, maskedKey: `${key.slice(0, 8)}${'•'.repeat(24)}${key.slice(-8)}` };
  });

  // Separate endpoint so the plaintext key only travels the wire when the admin explicitly
  // asks for it (Show / Copy), not on every page load. Matches the *arr UX where the key stays
  // retrievable — avoids having to regenerate and re-paste it into every downstream service.
  app.get('/api-key/reveal', async (_request, reply) => {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings?.apiKey) return reply.code(404).send({ error: 'NO_API_KEY' });
    logEvent('info', 'Settings', 'API key revealed');
    return { apiKey: settings.apiKey };
  });

  app.post('/api-key/generate', async () => {
    const apiKey = crypto.randomBytes(32).toString('hex');
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { apiKey },
      create: { id: 1, apiKey, updatedAt: new Date() },
    });
    logEvent('info', 'Settings', 'API key generated');
    return { apiKey };
  });

  app.delete('/api-key', async () => {
    await prisma.appSettings.update({
      where: { id: 1 },
      data: { apiKey: null },
    });
    logEvent('info', 'Settings', 'API key revoked');
    return { ok: true };
  });
}
