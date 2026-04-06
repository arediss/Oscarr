import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { getRadarrAsync, createRadarrFromConfig } from '../services/radarr.js';
import { getSonarrAsync, createSonarrFromConfig } from '../services/sonarr.js';
import { getServiceById } from '../utils/services.js';
import { syncRadarr, syncSonarr, runFullSync, syncAvailabilityDates } from '../services/sync.js';
import { getAuthProvider, getServiceDefinition, getServiceSchemas } from '../providers/index.js';
import { syncRequestsFromTags } from '../services/requestSync.js';
import { notificationRegistry } from '../notifications/index.js';
import { logEvent } from '../utils/logEvent.js';
import { invalidateLanguageCache } from '../services/tmdb.js';
import { triggerJob, updateJobSchedule } from '../services/scheduler.js';
import { invalidateRoleCache, getAllPermissions } from '../middleware/rbac.js';
import nodeSchedule from 'node-cron';
import { parseId } from '../utils/params.js';
export async function adminRoutes(app: FastifyInstance) {
  // === SETUP STATUS (checklist) ===

  app.get('/setup-status', async (request, reply) => {

    const [radarr, sonarr, plex, settings, qualityMappings, folderRules, userCount, requestSyncJob] = await Promise.all([
      prisma.service.findFirst({ where: { type: 'radarr', enabled: true } }),
      prisma.service.findFirst({ where: { type: 'sonarr', enabled: true } }),
      prisma.service.findFirst({ where: { type: 'plex', enabled: true } }),
      prisma.appSettings.findUnique({ where: { id: 1 } }),
      prisma.qualityMapping.count(),
      prisma.folderRule.count(),
      prisma.user.count(),
      prisma.cronJob.findUnique({ where: { key: 'request_sync' } }),
    ]);

    const hasDefaultMovieFolder = !!settings?.defaultMovieFolder;
    const hasDefaultTvFolder = !!settings?.defaultTvFolder;
    const hasSynced = !!(settings?.lastRadarrSync || settings?.lastSonarrSync);

    return {
      plex: !!plex,
      radarr: !!radarr,
      sonarr: !!sonarr,
      usersImported: userCount > 1, // more than just the admin
      synced: hasSynced,
      requestsSynced: !!(requestSyncJob?.lastRunAt && requestSyncJob.lastStatus === 'success'),
      qualityMappings: qualityMappings > 0,
      defaultFolders: hasDefaultMovieFolder && hasDefaultTvFolder,
      folderRules: folderRules > 0,
    };
  });

  // === SETTINGS ===

  app.get('/settings', async (request, reply) => {

    let settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.appSettings.create({
        data: { id: 1, updatedAt: new Date() },
      });
    }
    return {
      ...settings,
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
          registrationEnabled: { type: 'boolean', description: 'Allow new account registration' },
          missingSearchCooldownMin: { type: 'number', description: 'Cooldown in minutes before allowing another missing search' },
          requestsEnabled: { type: 'boolean', description: 'Enable the request system' },
          supportEnabled: { type: 'boolean', description: 'Enable the support/ticket system' },
          calendarEnabled: { type: 'boolean', description: 'Enable the calendar feature' },
          siteName: { type: 'string', description: 'Custom site name' },
          instanceLanguages: { type: 'array', items: { type: 'string' }, description: 'Instance languages (ISO 639-1 codes)' },
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
      registrationEnabled?: boolean;
      missingSearchCooldownMin?: number;
      requestsEnabled?: boolean;
      supportEnabled?: boolean;
      calendarEnabled?: boolean;
      siteName?: string;
      instanceLanguages?: string[];
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
        registrationEnabled: body.registrationEnabled ?? undefined,
        missingSearchCooldownMin: body.missingSearchCooldownMin ?? undefined,
        requestsEnabled: body.requestsEnabled ?? undefined,
        supportEnabled: body.supportEnabled ?? undefined,
        calendarEnabled: body.calendarEnabled ?? undefined,
        siteName: body.siteName ?? undefined,
        instanceLanguages: body.instanceLanguages ? JSON.stringify(body.instanceLanguages) : undefined,
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
        registrationEnabled: body.registrationEnabled,
        missingSearchCooldownMin: body.missingSearchCooldownMin,
        requestsEnabled: body.requestsEnabled,
        supportEnabled: body.supportEnabled,
        calendarEnabled: body.calendarEnabled,
        siteName: body.siteName,
        instanceLanguages: body.instanceLanguages ? JSON.stringify(body.instanceLanguages) : undefined,
        updatedAt: new Date(),
      },
    });

    // If instance language changed, clear all caches to force re-fetch in new language
    if (body.instanceLanguages) {
      invalidateLanguageCache();
      await prisma.tmdbCache.deleteMany();
      logEvent('info', 'Settings', 'Cache TMDB vidé suite au changement de langue');
    }

    logEvent('info', 'Settings', 'Paramètres mis à jour');
    return settings;
  });

  // === SERVICES REGISTRY ===

  // Service schemas — used by frontend to build dynamic forms
  app.get('/service-schemas', async (request, reply) => {

    return getServiceSchemas();
  });

  app.get('/services', async (request, reply) => {

    const services = await prisma.service.findMany({ orderBy: { createdAt: 'asc' } });
    return services.map((s) => ({ ...s, config: JSON.parse(s.config) }));
  });

  app.post('/services', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'type', 'config'],
        properties: {
          name: { type: 'string', description: 'Service display name' },
          type: { type: 'string', description: 'Service type (radarr, sonarr, plex, qbittorrent, tautulli, trackarr)' },
          config: { type: 'object', description: 'Service-specific configuration (url, apiKey, token, etc.)' },
          isDefault: { type: 'boolean', description: 'Set as the default service for its type' },
        },
      },
    },
  }, async (request, reply) => {

    const { name, type, config, isDefault } = request.body as {
      name: string; type: string; config: Record<string, string>; isDefault?: boolean;
    };
    if (!name || !type || !config) {
      return reply.status(400).send({ error: 'Nom, type et configuration requis' });
    }
    // If this is set as default, unset other defaults of the same type
    if (isDefault) {
      await prisma.service.updateMany({ where: { type, isDefault: true }, data: { isDefault: false } });
    }
    const service = await prisma.service.create({
      data: { name, type, config: JSON.stringify(config), isDefault: isDefault ?? false },
    });
    logEvent('info', 'Service', `Service "${name}" (${type}) ajouté`);
    return reply.status(201).send({ ...service, config: JSON.parse(service.config) });
  });

  app.put('/services/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Service ID' },
        },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Service display name' },
          config: { type: 'object', description: 'Service-specific configuration' },
          isDefault: { type: 'boolean', description: 'Set as the default service for its type' },
          enabled: { type: 'boolean', description: 'Enable or disable the service' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const serviceId = parseId(id);
    if (!serviceId) return reply.status(400).send({ error: 'ID invalide' });
    const { name, config, isDefault, enabled } = request.body as {
      name?: string; config?: Record<string, string>; isDefault?: boolean; enabled?: boolean;
    };
    // If setting as default, unset others of the same type
    if (isDefault) {
      const existing = await prisma.service.findUnique({ where: { id: serviceId } });
      if (existing) {
        await prisma.service.updateMany({ where: { type: existing.type, isDefault: true, NOT: { id: serviceId } }, data: { isDefault: false } });
      }
    }
    const service = await prisma.service.update({
      where: { id: serviceId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(config !== undefined ? { config: JSON.stringify(config) } : {}),
        ...(isDefault !== undefined ? { isDefault } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
      },
    });
    return { ...service, config: JSON.parse(service.config) };
  });

  app.delete('/services/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Service ID' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const serviceId = parseId(id);
    if (!serviceId) return reply.status(400).send({ error: 'ID invalide' });
    const deleted = await prisma.service.delete({ where: { id: serviceId } });
    logEvent('info', 'Service', `Service "${deleted.name}" supprimé`);
    return { ok: true };
  });

  app.post('/services/:id/test', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Service ID' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const serviceId = parseId(id);
    if (!serviceId) return reply.status(400).send({ error: 'ID invalide' });
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) return reply.status(404).send({ error: 'Service introuvable' });
    const config = JSON.parse(service.config) as Record<string, string>;

    const def = getServiceDefinition(service.type);
    if (!def) return reply.status(400).send({ error: 'Test non supporté pour ce type de service' });

    try {
      return await def.test(config);
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter le service' });
    }
  });

  // === PLEX TOKEN HELPER (for service setup) ===

  app.get('/plex-token', async (request, reply) => {

    const provider = getAuthProvider('plex');
    if (!provider?.getToken) return reply.status(404).send({ error: 'Provider Plex non disponible' });
    const adminUser = request.user as { id: number };
    const token = await provider.getToken(adminUser.id);
    if (!token) return reply.status(404).send({ error: 'Aucun token Plex trouvé' });
    return { token };
  });

  // === SERVICE CONFIG (Radarr/Sonarr profiles & folders) ===

  app.get('/radarr/profiles', async (request, reply) => {

    try {
      const radarr = await getRadarrAsync();
      const profiles = await radarr.getQualityProfiles();
      return profiles;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Radarr' });
    }
  });

  app.get('/radarr/rootfolders', async (request, reply) => {

    try {
      const radarr = await getRadarrAsync();
      const folders = await radarr.getRootFolders();
      return folders;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Radarr' });
    }
  });

  app.get('/sonarr/profiles', async (request, reply) => {

    try {
      const sonarr = await getSonarrAsync();
      const profiles = await sonarr.getQualityProfiles();
      return profiles;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Sonarr' });
    }
  });

  app.get('/sonarr/rootfolders', async (request, reply) => {

    try {
      const sonarr = await getSonarrAsync();
      const folders = await sonarr.getRootFolders();
      return folders;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Sonarr' });
    }
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
      notificationRegistry.send('incident_banner', { title: 'Incident', message: banner }).catch(err => console.error('[Notification] Failed:', err));
    }
    return { ok: true };
  });

  // === FOLDER RULES ===

  app.get('/folder-rules', async (request, reply) => {

    return prisma.folderRule.findMany({ orderBy: { priority: 'asc' } });
  });

  app.post('/folder-rules', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'mediaType', 'conditions', 'folderPath'],
        properties: {
          name: { type: 'string', description: 'Rule display name' },
          mediaType: { type: 'string', description: 'Media type this rule applies to (movie, tv)' },
          conditions: { type: 'array', description: 'Array of condition objects for matching' },
          folderPath: { type: 'string', description: 'Target root folder path' },
          seriesType: { type: 'string', description: 'Series type filter (e.g. anime)' },
          priority: { type: 'number', description: 'Rule priority (lower = higher priority)' },
          serviceId: { type: 'number', description: 'Associated service ID' },
        },
      },
    },
  }, async (request, reply) => {

    const { name, mediaType, conditions, folderPath, seriesType, priority, serviceId } = request.body as {
      name: string; mediaType: string; conditions: unknown[]; folderPath: string; seriesType?: string; priority?: number; serviceId?: number;
    };
    if (!name || !mediaType || !conditions || !folderPath) {
      return reply.status(400).send({ error: 'Tous les champs sont requis' });
    }
    const rule = await prisma.folderRule.create({
      data: {
        name,
        mediaType,
        conditions: JSON.stringify(conditions),
        folderPath,
        seriesType: seriesType || null,
        priority: priority ?? 0,
        serviceId: serviceId ?? null,
      },
    });
    return reply.status(201).send(rule);
  });

  app.put('/folder-rules/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Folder rule ID' },
        },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Rule display name' },
          mediaType: { type: 'string', description: 'Media type this rule applies to' },
          conditions: { type: 'array', description: 'Array of condition objects for matching' },
          folderPath: { type: 'string', description: 'Target root folder path' },
          seriesType: { type: 'string', description: 'Series type filter (e.g. anime)' },
          priority: { type: 'number', description: 'Rule priority (lower = higher priority)' },
          serviceId: { type: ['number', 'null'], description: 'Associated service ID, or null to unset' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const ruleId = parseId(id);
    if (!ruleId) return reply.status(400).send({ error: 'ID invalide' });
    const { name, mediaType, conditions, folderPath, seriesType, priority, serviceId } = request.body as {
      name?: string; mediaType?: string; conditions?: unknown[]; folderPath?: string; seriesType?: string; priority?: number; serviceId?: number | null;
    };
    const rule = await prisma.folderRule.update({
      where: { id: ruleId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(mediaType !== undefined ? { mediaType } : {}),
        ...(conditions !== undefined ? { conditions: JSON.stringify(conditions) } : {}),
        ...(folderPath !== undefined ? { folderPath } : {}),
        ...(seriesType !== undefined ? { seriesType: seriesType || null } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(serviceId !== undefined ? { serviceId } : {}),
      },
    });
    return reply.send(rule);
  });

  app.delete('/folder-rules/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Folder rule ID' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const ruleId = parseId(id);
    if (!ruleId) return reply.status(400).send({ error: 'ID invalide' });
    await prisma.folderRule.delete({ where: { id: ruleId } });
    return reply.send({ ok: true });
  });

  // Reorder folder rules
  app.put('/folder-rules/reorder', {
    schema: {
      body: {
        type: 'object',
        required: ['ids'],
        properties: {
          ids: { type: 'array', items: { type: 'number' }, description: 'Rule IDs in desired order' },
        },
      },
    },
  }, async (request, reply) => {
    const { ids } = request.body as { ids: number[] };
    await Promise.all(ids.map((id, i) => prisma.folderRule.update({ where: { id }, data: { priority: i } })));
    return reply.send({ ok: true });
  });

  // Toggle folder rule enabled/disabled
  app.patch('/folder-rules/:id/toggle', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ruleId = parseId(id);
    if (!ruleId) return reply.status(400).send({ error: 'ID invalide' });
    const rule = await prisma.folderRule.findUnique({ where: { id: ruleId } });
    if (!rule) return reply.status(404).send({ error: 'Règle introuvable' });
    const updated = await prisma.folderRule.update({ where: { id: ruleId }, data: { enabled: !rule.enabled } });
    return reply.send(updated);
  });

  // Duplicate a folder rule
  app.post('/folder-rules/:id/duplicate', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ruleId = parseId(id);
    if (!ruleId) return reply.status(400).send({ error: 'ID invalide' });
    const rule = await prisma.folderRule.findUnique({ where: { id: ruleId } });
    if (!rule) return reply.status(404).send({ error: 'Règle introuvable' });
    const count = await prisma.folderRule.count();
    const copy = await prisma.folderRule.create({
      data: {
        name: `${rule.name} (2)`,
        priority: count,
        mediaType: rule.mediaType,
        conditions: rule.conditions,
        folderPath: rule.folderPath,
        seriesType: rule.seriesType,
        serviceId: rule.serviceId,
        enabled: false,
      },
    });
    return reply.status(201).send(copy);
  });

  // === USER MANAGEMENT ===

  // Import users from a provider (e.g. Plex shared users, Jellyfin users)
  app.post('/users/import/:provider', {
    schema: {
      params: {
        type: 'object',
        required: ['provider'],
        properties: {
          provider: { type: 'string', description: 'Provider ID (e.g. "plex")' },
        },
      },
    },
  }, async (request, reply) => {

    const { provider: providerId } = request.params as { provider: string };
    const authProvider = getAuthProvider(providerId);

    if (!authProvider?.importUsers) {
      return reply.status(400).send({ error: `Le provider "${providerId}" ne supporte pas l'import d'utilisateurs.` });
    }

    const adminUser = request.user as { id: number };
    try {
      const result = await authProvider.importUsers(adminUser.id);
      return result;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'NO_TOKEN') return reply.status(400).send({ error: `Aucun token ${providerId} trouvé. Configurez le service dans les paramètres.` });
      if (msg === 'NO_MACHINE_ID') return reply.status(400).send({ error: `Aucun serveur ${providerId} configuré.` });
      console.error(`Failed to import ${providerId.replace(/[\r\n\t]/g, '')} users:`, err);
      logEvent('error', 'User', `Import ${providerId.replace(/[\r\n\t]/g, '')} échoué : ${err}`);
      return reply.status(502).send({ error: `Impossible de récupérer les utilisateurs ${providerId}` });
    }
  });

  // Link a provider to a user (admin only)
  app.post('/users/:id/link-provider', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'User ID' } },
      },
      body: {
        type: 'object',
        required: ['provider', 'pinId'],
        properties: {
          provider: { type: 'string', description: 'Provider ID (e.g. "plex")' },
          pinId: { type: 'number', description: 'OAuth PIN ID' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const userId = parseId(id);
    if (!userId) return reply.status(400).send({ error: 'ID invalide' });

    const { provider: providerId, pinId } = request.body as { provider: string; pinId: number };
    const authProvider = getAuthProvider(providerId);
    if (!authProvider?.linkAccount) {
      return reply.status(400).send({ error: `Le provider "${providerId}" ne supporte pas le linking.` });
    }

    try {
      const result = await authProvider.linkAccount(pinId, userId);
      return reply.send({ success: true, providerUsername: result.providerUsername });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'PIN_INVALID') return reply.status(400).send({ error: 'PIN non validé. Réessayez.' });
      if (msg === 'PROVIDER_ALREADY_LINKED') return reply.status(409).send({ error: 'Ce compte est déjà lié à un autre utilisateur.' });
      throw err;
    }
  });

  app.get('/users', async (request, reply) => {

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        avatar: true,
        role: true,
        createdAt: true,
        providers: { select: { provider: true, providerUsername: true, providerEmail: true } },
        _count: { select: { requests: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => ({
      ...u,
      providers: u.providers,
      requestCount: u._count.requests,
    }));
  });

  // Change user role
  app.put('/users/:id/role', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User ID' },
        },
      },
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', description: 'Role name to assign' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const userId = parseId(id);
    if (!userId) return reply.status(400).send({ error: 'ID invalide' });

    const { role } = request.body as { role: string };

    // Validate role exists in DB
    const roleExists = await prisma.role.findUnique({ where: { name: role } });
    if (!roleExists) return reply.status(400).send({ error: 'Rôle invalide' });

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, displayName: true, role: true },
    });

    logEvent('info', 'User', `Rôle de ${user.displayName} changé en ${role}`);
    return user;
  });

  // === LOGS ===

  app.get('/logs', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string', description: 'Page number (defaults to 1)' },
          level: { type: 'string', enum: ['info', 'warn', 'error'], description: 'Filter logs by level' },
          label: { type: 'string', description: 'Filter logs by label' },
        },
      },
    },
  }, async (request, reply) => {

    const { page, level, label } = request.query as { page?: string; level?: string; label?: string };
    const pageNum = parseInt(page || '1', 10) || 1;
    const take = 50;
    const skip = (pageNum - 1) * take;
    const where: Record<string, unknown> = {};
    if (level && ['info', 'warn', 'error'].includes(level)) where.level = level;
    if (label) where.label = label;

    const [logs, total] = await Promise.all([
      prisma.appLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.appLog.count({ where }),
    ]);

    return { results: logs, total, page: pageNum, totalPages: Math.ceil(total / take) };
  });

  app.delete('/logs', async (request, reply) => {

    await prisma.appLog.deleteMany();
    return { ok: true };
  });

  // === CRON JOBS ===

  app.get('/jobs', async (request, reply) => {

    return prisma.cronJob.findMany({ orderBy: { key: 'asc' } });
  });

  app.put('/jobs/:key', {
    schema: {
      params: {
        type: 'object',
        required: ['key'],
        properties: {
          key: { type: 'string', description: 'Cron job key identifier' },
        },
      },
      body: {
        type: 'object',
        properties: {
          cronExpression: { type: 'string', description: 'Cron expression for scheduling' },
          enabled: { type: 'boolean', description: 'Enable or disable the job' },
        },
      },
    },
  }, async (request, reply) => {

    const { key } = request.params as { key: string };
    const { cronExpression, enabled } = request.body as { cronExpression?: string; enabled?: boolean };

    if (cronExpression && !nodeSchedule.validate(cronExpression)) {
      return reply.status(400).send({ error: 'Expression CRON invalide' });
    }

    const job = await prisma.cronJob.update({
      where: { key },
      data: {
        ...(cronExpression !== undefined ? { cronExpression } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
      },
    });

    await updateJobSchedule(key, job.cronExpression, job.enabled);
    return job;
  });

  app.post('/jobs/:key/run', {
    schema: {
      params: {
        type: 'object',
        required: ['key'],
        properties: {
          key: { type: 'string', description: 'Cron job key identifier' },
        },
      },
    },
  }, async (request, reply) => {

    const { key } = request.params as { key: string };
    try {
      const result = await triggerJob(key);
      const job = await prisma.cronJob.findUnique({ where: { key } });
      return { ok: true, result, job };
    } catch (err) {
      return reply.status(500).send({ error: 'Le job a échoué', details: String(err) });
    }
  });

  // Keep legacy sync endpoints for backwards compat
  app.get('/sync/status', async (request, reply) => {

    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    return {
      lastRadarrSync: settings?.lastRadarrSync,
      lastSonarrSync: settings?.lastSonarrSync,
      syncIntervalHours: settings?.syncIntervalHours ?? 6,
    };
  });

  app.post('/sync/run', async (request, reply) => {

    return triggerJob('full_sync');
  });

  app.post('/sync/force', async (request, reply) => {

    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { lastRadarrSync: null, lastSonarrSync: null },
      create: { id: 1, lastRadarrSync: null, lastSonarrSync: null, updatedAt: new Date() },
    });
    const radarrResult = await syncRadarr(null);
    const sonarrResult = await syncSonarr(null);
    await syncAvailabilityDates(null);
    return { radarr: radarrResult, sonarr: sonarrResult };
  });

  // === NOTIFICATION TEST (dynamic) ===
  app.post<{ Params: { providerId: string } }>('/notifications/test/:providerId', {
    schema: {
      params: {
        type: 'object',
        required: ['providerId'],
        properties: { providerId: { type: 'string' } },
      },
      body: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
    },
  }, async (request, reply) => {
    const { providerId } = request.params;
    const settings = request.body as Record<string, string>;
    try {
      await notificationRegistry.testProvider(providerId, settings);
      return { ok: true };
    } catch (err) {
      return reply.status(502).send({ error: `Test failed for ${providerId}` });
    }
  });

  // Get registry metadata (providers + event types) for the frontend
  app.get('/notifications/meta', async () => {
    return notificationRegistry.toJSON();
  });

  // Get all provider configs from DB
  app.get('/notifications/providers', async () => {
    return prisma.notificationProviderConfig.findMany();
  });

  // Save a provider's config
  app.put<{ Params: { providerId: string } }>('/notifications/providers/:providerId', {
    schema: {
      params: {
        type: 'object',
        required: ['providerId'],
        properties: { providerId: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          settings: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
    },
  }, async (request) => {
    const { providerId } = request.params;
    const { enabled, settings } = request.body as { enabled?: boolean; settings?: Record<string, string> };

    return prisma.notificationProviderConfig.upsert({
      where: { providerId },
      update: {
        ...(enabled !== undefined && { enabled }),
        ...(settings && { settings: JSON.stringify(settings) }),
      },
      create: {
        providerId,
        enabled: enabled ?? false,
        settings: settings ? JSON.stringify(settings) : '{}',
      },
    });
  });

  // === QUALITY OPTIONS ===

  app.get('/quality-options', async (request, reply) => {

    return prisma.qualityOption.findMany({
      orderBy: { position: 'asc' },
      include: {
        mappings: {
          include: { service: { select: { id: true, name: true, type: true } } },
        },
      },
    });
  });

  app.post('/quality-options', {
    schema: {
      body: {
        type: 'object',
        required: ['label'],
        properties: {
          label: { type: 'string', description: 'Quality option label (e.g. SD, HD, 4K)' },
          position: { type: 'number', description: 'Display order position' },
        },
      },
    },
  }, async (request, reply) => {

    const { label, position } = request.body as { label: string; position?: number };
    if (!label) return reply.status(400).send({ error: 'Label requis' });
    const maxPos = await prisma.qualityOption.aggregate({ _max: { position: true } });
    const option = await prisma.qualityOption.create({
      data: { label, position: position ?? (maxPos._max.position ?? 0) + 1 },
    });
    return reply.status(201).send(option);
  });

  app.put('/quality-options/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Quality option ID' },
        },
      },
      body: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Quality option label' },
          position: { type: 'number', description: 'Display order position' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const optionId = parseId(id);
    if (!optionId) return reply.status(400).send({ error: 'ID invalide' });
    const { label, position } = request.body as { label?: string; position?: number };
    const option = await prisma.qualityOption.update({
      where: { id: optionId },
      data: {
        ...(label !== undefined ? { label } : {}),
        ...(position !== undefined ? { position } : {}),
      },
    });
    return option;
  });

  app.delete('/quality-options/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Quality option ID' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const optionId = parseId(id);
    if (!optionId) return reply.status(400).send({ error: 'ID invalide' });
    await prisma.qualityOption.delete({ where: { id: optionId } });
    return { ok: true };
  });

  // Seed default quality options
  app.post('/quality-options/seed', async (request, reply) => {

    const defaults = [
      { label: 'SD', position: 1 },
      { label: 'HD', position: 2 },
      { label: '4K', position: 3 },
      { label: '4K HDR', position: 4 },
    ];
    let created = 0;
    for (const d of defaults) {
      const exists = await prisma.qualityOption.findUnique({ where: { label: d.label } });
      if (!exists) {
        await prisma.qualityOption.create({ data: d });
        created++;
      }
    }
    return { created };
  });

  // === QUALITY MAPPINGS ===

  app.get('/quality-mappings', async (request, reply) => {

    return prisma.qualityMapping.findMany({
      include: {
        qualityOption: true,
        service: { select: { id: true, name: true, type: true } },
      },
      orderBy: { qualityOptionId: 'asc' },
    });
  });

  app.post('/quality-mappings', {
    schema: {
      body: {
        type: 'object',
        required: ['qualityOptionId', 'serviceId', 'qualityProfileId', 'qualityProfileName'],
        properties: {
          qualityOptionId: { type: 'number', description: 'Quality option ID to map' },
          serviceId: { type: 'number', description: 'Service ID (Radarr/Sonarr) to map' },
          qualityProfileId: { type: 'number', description: 'Quality profile ID in the service' },
          qualityProfileName: { type: 'string', description: 'Quality profile display name in the service' },
        },
      },
    },
  }, async (request, reply) => {

    const { qualityOptionId, serviceId, qualityProfileId, qualityProfileName } = request.body as {
      qualityOptionId: number; serviceId: number; qualityProfileId: number; qualityProfileName: string;
    };
    if (!qualityOptionId || !serviceId || !qualityProfileId || !qualityProfileName) {
      return reply.status(400).send({ error: 'Tous les champs sont requis' });
    }
    // Check for duplicate
    const existing = await prisma.qualityMapping.findFirst({
      where: { qualityOptionId, serviceId, qualityProfileId },
    });
    if (existing) {
      return reply.status(409).send({ error: 'Ce mapping existe déjà' });
    }
    const mapping = await prisma.qualityMapping.create({
      data: { qualityOptionId, serviceId, qualityProfileId, qualityProfileName },
      include: {
        qualityOption: true,
        service: { select: { id: true, name: true, type: true } },
      },
    });
    return reply.status(201).send(mapping);
  });

  app.delete('/quality-mappings/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Quality mapping ID' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const mappingId = parseId(id);
    if (!mappingId) return reply.status(400).send({ error: 'ID invalide' });
    await prisma.qualityMapping.delete({ where: { id: mappingId } });
    return { ok: true };
  });

  // === DANGER ZONE ===

  // Purge all requests
  app.delete('/danger/requests', async (request, reply) => {

    const { count } = await prisma.mediaRequest.deleteMany();
    logEvent('warn', 'Admin', `Purge : ${count} demandes supprimées`);
    return { ok: true, deleted: count };
  });

  // Purge all media (to re-import fresh)
  app.delete('/danger/media', async (request, reply) => {

    // Requests reference media, delete them first
    const { count: reqCount } = await prisma.mediaRequest.deleteMany();
    const { count: seasonCount } = await prisma.season.deleteMany();
    const { count: mediaCount } = await prisma.media.deleteMany();
    logEvent('warn', 'Admin', `Purge : ${mediaCount} médias, ${seasonCount} saisons, ${reqCount} demandes supprimés`);
    return { ok: true, deleted: { media: mediaCount, seasons: seasonCount, requests: reqCount } };
  });

  // Delete a specific user (and cascade their requests/tickets)
  app.delete('/danger/users/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User ID to delete' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const userId = parseId(id);
    if (!userId) return reply.status(400).send({ error: 'ID invalide' });

    const currentUser = request.user as { id: number };
    if (userId === currentUser.id) return reply.status(400).send({ error: 'Impossible de supprimer votre propre compte' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.status(404).send({ error: 'Utilisateur introuvable' });

    await prisma.user.delete({ where: { id: userId } });
    logEvent('warn', 'Admin', `Utilisateur supprimé : ${user.displayName || user.email}`);
    return { ok: true };
  });

  // Purge all users except current admin
  app.delete('/danger/users', async (request, reply) => {

    const currentUser = request.user as { id: number };
    const { count } = await prisma.user.deleteMany({ where: { id: { not: currentUser.id } } });
    logEvent('warn', 'Admin', `Purge : ${count} utilisateurs supprimés`);
    return { ok: true, deleted: count };
  });

  // === SERVICE PROFILES (fetch quality profiles from a specific service) ===

  app.get('/services/:id/profiles', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Service ID' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const serviceId = parseId(id);
    if (!serviceId) return reply.status(400).send({ error: 'ID invalide' });
    const svc = await getServiceById(serviceId);
    if (!svc) return reply.status(404).send({ error: 'Service introuvable ou désactivé' });
    try {
      if (svc.type === 'radarr') {
        const radarr = createRadarrFromConfig(svc.config);
        return await radarr.getQualityProfiles();
      }
      if (svc.type === 'sonarr') {
        const sonarr = createSonarrFromConfig(svc.config);
        return await sonarr.getQualityProfiles();
      }
      return reply.status(400).send({ error: 'Ce type de service ne supporte pas les profils qualité' });
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter le service' });
    }
  });

  app.get('/services/:id/rootfolders', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'Service ID' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const serviceId = parseId(id);
    if (!serviceId) return reply.status(400).send({ error: 'ID invalide' });
    const svc = await getServiceById(serviceId);
    if (!svc) return reply.status(404).send({ error: 'Service introuvable ou désactivé' });
    try {
      if (svc.type === 'radarr') {
        const radarr = createRadarrFromConfig(svc.config);
        return await radarr.getRootFolders();
      }
      if (svc.type === 'sonarr') {
        const sonarr = createSonarrFromConfig(svc.config);
        return await sonarr.getRootFolders();
      }
      return reply.status(400).send({ error: 'Ce type de service ne supporte pas les dossiers racine' });
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter le service' });
    }
  });

  // === RBAC: ROLES MANAGEMENT ===

  // List all roles
  app.get('/roles', async () => {
    return prisma.role.findMany({ orderBy: { position: 'asc' } });
  });

  // List all available permissions (core + plugins)
  app.get('/permissions', async () => {
    return getAllPermissions();
  });

  // Create a new role
  app.post('/roles', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'permissions'],
        properties: {
          name: { type: 'string' },
          permissions: { type: 'array', items: { type: 'string' } },
          position: { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    const { name, permissions, position } = request.body as { name: string; permissions: string[]; position?: number };

    if (!name?.trim()) return reply.status(400).send({ error: 'Nom requis' });

    const existing = await prisma.role.findUnique({ where: { name: name.trim().toLowerCase() } });
    if (existing) return reply.status(409).send({ error: 'Ce rôle existe déjà' });

    const maxPos = await prisma.role.aggregate({ _max: { position: true } });
    const role = await prisma.role.create({
      data: {
        name: name.trim().toLowerCase(),
        permissions: JSON.stringify(permissions),
        position: position ?? (maxPos._max.position ?? 0) + 1,
      },
    });

    await invalidateRoleCache();
    logEvent('info', 'Admin', `Rôle créé : ${role.name}`);
    return reply.status(201).send(role);
  });

  // Update a role
  app.put('/roles/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          permissions: { type: 'array', items: { type: 'string' } },
          isDefault: { type: 'boolean' },
          position: { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    const roleId = parseId((request.params as { id: string }).id);
    if (!roleId) return reply.status(400).send({ error: 'ID invalide' });

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return reply.status(404).send({ error: 'Rôle introuvable' });

    const { name, permissions, isDefault, position } = request.body as {
      name?: string; permissions?: string[]; isDefault?: boolean; position?: number;
    };

    // System roles cannot be renamed
    if (role.isSystem && name && name !== role.name) {
      return reply.status(400).send({ error: 'Impossible de renommer un rôle système' });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.role.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const updated = await prisma.role.update({
      where: { id: roleId },
      data: {
        ...(name && !role.isSystem ? { name: name.trim().toLowerCase() } : {}),
        ...(permissions ? { permissions: JSON.stringify(permissions) } : {}),
        ...(isDefault !== undefined ? { isDefault } : {}),
        ...(position !== undefined ? { position } : {}),
      },
    });

    await invalidateRoleCache();
    logEvent('info', 'Admin', `Rôle modifié : ${updated.name}`);
    return updated;
  });

  // Delete a role
  app.delete('/roles/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const roleId = parseId((request.params as { id: string }).id);
    if (!roleId) return reply.status(400).send({ error: 'ID invalide' });

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return reply.status(404).send({ error: 'Rôle introuvable' });
    if (role.isSystem) return reply.status(400).send({ error: 'Impossible de supprimer un rôle système' });

    // Check if any users still have this role
    const usersWithRole = await prisma.user.count({ where: { role: role.name } });
    if (usersWithRole > 0) {
      return reply.status(400).send({ error: `${usersWithRole} utilisateur(s) ont encore ce rôle. Réassignez-les d'abord.` });
    }

    await prisma.role.delete({ where: { id: roleId } });
    await invalidateRoleCache();
    logEvent('info', 'Admin', `Rôle supprimé : ${role.name}`);
    return { ok: true };
  });

  // === KEYWORDS ===

  app.get('/keywords', async () => {
    const keywords = await prisma.keyword.findMany({ orderBy: { name: 'asc' } });

    // Count media per keyword
    const allMedia = await prisma.media.findMany({
      where: { keywordIds: { not: null } },
      select: { keywordIds: true },
    });

    const counts: Record<number, number> = {};
    for (const m of allMedia) {
      const ids: number[] = JSON.parse(m.keywordIds!);
      for (const id of ids) {
        counts[id] = (counts[id] || 0) + 1;
      }
    }

    return keywords.map((k) => ({
      ...k,
      mediaCount: counts[k.tmdbId] || 0,
    }));
  });

  app.patch('/keywords/:tmdbId', {
    schema: {
      params: {
        type: 'object' as const,
        required: ['tmdbId'],
        properties: {
          tmdbId: { type: 'string', description: 'TMDB keyword ID' },
        },
      },
      body: {
        type: 'object' as const,
        properties: {
          tag: { type: ['string', 'null'], description: 'Tag for this keyword (e.g. "nsfw", "anime") or null to clear' },
        },
      },
    },
  }, async (request, reply) => {
    const { tmdbId } = request.params as { tmdbId: string };
    const { tag } = request.body as { tag: string | null };
    const id = parseInt(tmdbId, 10);
    if (isNaN(id)) return reply.status(400).send({ error: 'Invalid tmdbId' });

    const keyword = await prisma.keyword.findUnique({ where: { tmdbId: id } });
    if (!keyword) return reply.status(404).send({ error: 'Keyword not found' });

    const updated = await prisma.keyword.update({
      where: { tmdbId: id },
      data: { tag: tag || null },
    });
    return updated;
  });
}
