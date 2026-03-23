import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { getRadarr, createRadarrFromConfig } from '../services/radarr.js';
import { getSonarr, createSonarrFromConfig } from '../services/sonarr.js';
import { getServiceById } from '../utils/services.js';
import { syncRadarr, syncSonarr, runFullSync, syncAvailabilityDates } from '../services/sync.js';
import { getPlexFriends } from '../services/plex.js';
import { syncRequestsFromTags } from '../services/requestSync.js';
import { testDiscord, testTelegram, testEmail, sendNotification } from '../services/notifications.js';
import { triggerJob, updateJobSchedule } from '../services/scheduler.js';
import nodeSchedule from 'node-cron';

function parseId(value: string): number | null {
  const id = parseInt(value, 10);
  return Number.isNaN(id) || id < 1 ? null : id;
}

async function requireAdmin(request: { user: unknown }, reply: { status: (code: number) => { send: (body: unknown) => void } }) {
  const user = request.user as { id: number; role: string };
  if (user.role !== 'admin') {
    return reply.status(403).send({ error: 'Admin uniquement' });
  }
}

export async function adminRoutes(app: FastifyInstance) {
  // All admin routes require auth + admin role
  app.addHook('preHandler', app.authenticate);

  // === SETTINGS ===

  app.get('/settings', async (request, reply) => {
    await requireAdmin(request, reply);
    let settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.appSettings.create({
        data: { id: 1, updatedAt: new Date() },
      });
    }
    return settings;
  });

  app.put('/settings', async (request, reply) => {
    await requireAdmin(request, reply);
    const body = request.body as {
      defaultQualityProfile?: number;
      defaultMovieFolder?: string;
      defaultTvFolder?: string;
      defaultAnimeFolder?: string;
      plexMachineId?: string;
      discordWebhookUrl?: string;
      telegramBotToken?: string;
      telegramChatId?: string;
      resendApiKey?: string;
      resendFromEmail?: string;
      resendToEmail?: string;
      notificationMatrix?: string;
      autoApproveRequests?: boolean;
      requestsEnabled?: boolean;
      supportEnabled?: boolean;
      calendarEnabled?: boolean;
    };

    const settings = await prisma.appSettings.upsert({
      where: { id: 1 },
      update: {
        defaultQualityProfile: body.defaultQualityProfile ?? undefined,
        defaultMovieFolder: body.defaultMovieFolder ?? undefined,
        defaultTvFolder: body.defaultTvFolder ?? undefined,
        defaultAnimeFolder: body.defaultAnimeFolder ?? undefined,
        plexMachineId: body.plexMachineId ?? undefined,
        discordWebhookUrl: body.discordWebhookUrl ?? undefined,
        telegramBotToken: body.telegramBotToken ?? undefined,
        telegramChatId: body.telegramChatId ?? undefined,
        resendApiKey: body.resendApiKey ?? undefined,
        resendFromEmail: body.resendFromEmail ?? undefined,
        resendToEmail: body.resendToEmail ?? undefined,
        notificationMatrix: body.notificationMatrix ?? undefined,
        autoApproveRequests: body.autoApproveRequests ?? undefined,
        requestsEnabled: body.requestsEnabled ?? undefined,
        supportEnabled: body.supportEnabled ?? undefined,
        calendarEnabled: body.calendarEnabled ?? undefined,
      },
      create: {
        id: 1,
        defaultQualityProfile: body.defaultQualityProfile,
        defaultMovieFolder: body.defaultMovieFolder,
        defaultTvFolder: body.defaultTvFolder,
        defaultAnimeFolder: body.defaultAnimeFolder,
        plexMachineId: body.plexMachineId,
        discordWebhookUrl: body.discordWebhookUrl,
        telegramBotToken: body.telegramBotToken,
        telegramChatId: body.telegramChatId,
        resendApiKey: body.resendApiKey,
        resendFromEmail: body.resendFromEmail,
        resendToEmail: body.resendToEmail,
        notificationMatrix: body.notificationMatrix,
        updatedAt: new Date(),
      },
    });

    return settings;
  });

  // === SERVICES REGISTRY ===

  app.get('/services', async (request, reply) => {
    await requireAdmin(request, reply);
    const services = await prisma.service.findMany({ orderBy: { createdAt: 'asc' } });
    return services.map((s) => ({ ...s, config: JSON.parse(s.config) }));
  });

  app.post('/services', async (request, reply) => {
    await requireAdmin(request, reply);
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
    return reply.status(201).send({ ...service, config: JSON.parse(service.config) });
  });

  app.put('/services/:id', async (request, reply) => {
    await requireAdmin(request, reply);
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

  app.delete('/services/:id', async (request, reply) => {
    await requireAdmin(request, reply);
    const { id } = request.params as { id: string };
    const serviceId = parseId(id);
    if (!serviceId) return reply.status(400).send({ error: 'ID invalide' });
    await prisma.service.delete({ where: { id: serviceId } });
    return { ok: true };
  });

  app.post('/services/:id/test', async (request, reply) => {
    await requireAdmin(request, reply);
    const { id } = request.params as { id: string };
    const serviceId = parseId(id);
    if (!serviceId) return reply.status(400).send({ error: 'ID invalide' });
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) return reply.status(404).send({ error: 'Service introuvable' });
    const config = JSON.parse(service.config) as Record<string, string>;

    try {
      if (service.type === 'radarr' || service.type === 'sonarr') {
        const { default: axios } = await import('axios');
        const { data } = await axios.get(`${config.url}/api/v3/system/status`, {
          params: { apikey: config.apiKey },
          timeout: 5000,
        });
        return { ok: true, version: data.version };
      }
      if (service.type === 'plex') {
        const { default: axios } = await import('axios');
        const { data } = await axios.get(`${config.url}/identity`, {
          headers: { 'X-Plex-Token': config.token, Accept: 'application/json' },
          timeout: 5000,
        });
        return { ok: true, version: data.MediaContainer?.version };
      }
      if (service.type === 'qbittorrent') {
        const { default: axios } = await import('axios');
        await axios.get(`${config.url}/api/v2/app/version`, { timeout: 5000 });
        return { ok: true };
      }
      if (service.type === 'tautulli') {
        const { default: axios } = await import('axios');
        const { data } = await axios.get(`${config.url}/api/v2`, {
          params: { apikey: config.apiKey, cmd: 'arnold' },
          timeout: 5000,
        });
        return { ok: true, version: data?.response?.data?.version };
      }
      if (service.type === 'trackarr') {
        const { default: axios } = await import('axios');
        await axios.get(`${config.url}/api/health`, {
          headers: { 'X-Api-Key': config.apiKey },
          timeout: 5000,
        });
        return { ok: true };
      }
      return reply.status(400).send({ error: 'Test non supporté pour ce type de service' });
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter le service' });
    }
  });

  // === PLEX TOKEN HELPER (for service setup) ===

  app.get('/plex-token', async (request, reply) => {
    await requireAdmin(request, reply);
    const adminUser = request.user as { id: number };
    const admin = await prisma.user.findUnique({
      where: { id: adminUser.id },
      select: { plexToken: true },
    });
    if (!admin?.plexToken) return reply.status(404).send({ error: 'Aucun token Plex trouvé' });
    return { token: admin.plexToken };
  });

  // === SERVICE CONFIG (Radarr/Sonarr profiles & folders) ===

  app.get('/radarr/profiles', async (request, reply) => {
    await requireAdmin(request, reply);
    try {
      const profiles = await getRadarr().getQualityProfiles();
      return profiles;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Radarr' });
    }
  });

  app.get('/radarr/rootfolders', async (request, reply) => {
    await requireAdmin(request, reply);
    try {
      const folders = await getRadarr().getRootFolders();
      return folders;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Radarr' });
    }
  });

  app.get('/sonarr/profiles', async (request, reply) => {
    await requireAdmin(request, reply);
    try {
      const profiles = await getSonarr().getQualityProfiles();
      return profiles;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Sonarr' });
    }
  });

  app.get('/sonarr/rootfolders', async (request, reply) => {
    await requireAdmin(request, reply);
    try {
      const folders = await getSonarr().getRootFolders();
      return folders;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Sonarr' });
    }
  });

  // === BANNER ===

  app.put('/banner', async (request, reply) => {
    await requireAdmin(request, reply);
    const { banner } = request.body as { banner: string | null };
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { incidentBanner: banner || null },
      create: { id: 1, incidentBanner: banner || null, updatedAt: new Date() },
    });
    if (banner) {
      sendNotification('incident_banner', { title: 'Incident', message: banner });
    }
    return { ok: true };
  });

  // === FOLDER RULES ===

  app.get('/folder-rules', async (request, reply) => {
    await requireAdmin(request, reply);
    return prisma.folderRule.findMany({ orderBy: { priority: 'asc' } });
  });

  app.post('/folder-rules', async (request, reply) => {
    await requireAdmin(request, reply);
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

  app.put('/folder-rules/:id', async (request, reply) => {
    await requireAdmin(request, reply);
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

  app.delete('/folder-rules/:id', async (request, reply) => {
    await requireAdmin(request, reply);
    const { id } = request.params as { id: string };
    const ruleId = parseId(id);
    if (!ruleId) return reply.status(400).send({ error: 'ID invalide' });
    await prisma.folderRule.delete({ where: { id: ruleId } });
    return reply.send({ ok: true });
  });

  // === USER MANAGEMENT ===

  // Import Plex friends as users
  app.post('/users/import-plex', async (request, reply) => {
    await requireAdmin(request, reply);

    // Get admin's Plex token
    const adminUser = request.user as { id: number };
    const admin = await prisma.user.findUnique({
      where: { id: adminUser.id },
      select: { plexToken: true },
    });

    if (!admin?.plexToken) {
      return reply.status(400).send({ error: 'Token Plex admin introuvable. Reconnectez-vous.' });
    }

    try {
      const friends = await getPlexFriends(admin.plexToken);
      let imported = 0;
      let skipped = 0;

      for (const friend of friends) {
        // Check if user already exists
        const existing = await prisma.user.findFirst({
          where: {
            OR: [
              ...(friend.id ? [{ plexId: friend.id }] : []),
              ...(friend.email ? [{ email: friend.email.toLowerCase() }] : []),
            ],
          },
        });

        if (existing) {
          skipped++;
          continue;
        }

        await prisma.user.create({
          data: {
            email: (friend.email || `${friend.username}@plex.local`).toLowerCase(),
            plexId: friend.id,
            plexUsername: friend.username || friend.title,
            avatar: friend.thumb,
            role: 'user',
            hasPlexServerAccess: true,
          },
        });
        imported++;
      }

      return { imported, skipped, total: friends.length };
    } catch (err) {
      console.error('Failed to import Plex users:', err);
      return reply.status(502).send({ error: 'Impossible de récupérer les utilisateurs Plex' });
    }
  });

  app.get('/users', async (request, reply) => {
    await requireAdmin(request, reply);
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        plexUsername: true,
        avatar: true,
        role: true,
        hasPlexServerAccess: true,
        createdAt: true,
        _count: { select: { requests: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => ({
      ...u,
      requestCount: u._count.requests,
    }));
  });

  // Change user role
  app.put('/users/:id/role', async (request, reply) => {
    await requireAdmin(request, reply);
    const { id } = request.params as { id: string };
    const userId = parseId(id);
    if (!userId) return reply.status(400).send({ error: 'ID invalide' });

    const { role } = request.body as { role: string };
    if (role !== 'admin' && role !== 'user') {
      return reply.status(400).send({ error: 'Rôle invalide' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, plexUsername: true, role: true },
    });

    return user;
  });

  // === LOGS ===

  app.get('/logs', async (request, reply) => {
    await requireAdmin(request, reply);
    const { page, level } = request.query as { page?: string; level?: string };
    const pageNum = parseInt(page || '1', 10) || 1;
    const take = 50;
    const skip = (pageNum - 1) * take;
    const where: Record<string, unknown> = {};
    if (level && ['info', 'warn', 'error'].includes(level)) where.level = level;

    const [logs, total] = await Promise.all([
      prisma.appLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.appLog.count({ where }),
    ]);

    return { results: logs, total, page: pageNum, totalPages: Math.ceil(total / take) };
  });

  app.delete('/logs', async (request, reply) => {
    await requireAdmin(request, reply);
    await prisma.appLog.deleteMany();
    return { ok: true };
  });

  // === CRON JOBS ===

  app.get('/jobs', async (request, reply) => {
    await requireAdmin(request, reply);
    return prisma.cronJob.findMany({ orderBy: { key: 'asc' } });
  });

  app.put('/jobs/:key', async (request, reply) => {
    await requireAdmin(request, reply);
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

  app.post('/jobs/:key/run', async (request, reply) => {
    await requireAdmin(request, reply);
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
    await requireAdmin(request, reply);
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    return {
      lastRadarrSync: settings?.lastRadarrSync,
      lastSonarrSync: settings?.lastSonarrSync,
      syncIntervalHours: settings?.syncIntervalHours ?? 6,
    };
  });

  app.post('/sync/run', async (request, reply) => {
    await requireAdmin(request, reply);
    return triggerJob('full_sync');
  });

  app.post('/sync/force', async (request, reply) => {
    await requireAdmin(request, reply);
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

  // === NOTIFICATION TESTS ===

  app.post('/notifications/test/discord', async (request, reply) => {
    await requireAdmin(request, reply);
    const { webhookUrl } = request.body as { webhookUrl: string };
    if (!webhookUrl) return reply.status(400).send({ error: 'URL webhook requise' });
    try {
      await testDiscord(webhookUrl);
      return { ok: true };
    } catch (err) {
      return reply.status(502).send({ error: 'Échec de l\'envoi Discord' });
    }
  });

  app.post('/notifications/test/telegram', async (request, reply) => {
    await requireAdmin(request, reply);
    const { botToken, chatId } = request.body as { botToken: string; chatId: string };
    if (!botToken || !chatId) return reply.status(400).send({ error: 'Bot token et chat ID requis' });
    try {
      await testTelegram(botToken, chatId);
      return { ok: true };
    } catch (err) {
      return reply.status(502).send({ error: 'Échec de l\'envoi Telegram' });
    }
  });

  app.post('/notifications/test/email', async (request, reply) => {
    await requireAdmin(request, reply);
    const { apiKey, from, to } = request.body as { apiKey: string; from: string; to: string };
    if (!apiKey || !from || !to) return reply.status(400).send({ error: 'API key, from et to requis' });
    try {
      await testEmail(apiKey, from, to);
      return { ok: true };
    } catch (err) {
      return reply.status(502).send({ error: 'Échec de l\'envoi email' });
    }
  });

  // === QUALITY OPTIONS ===

  app.get('/quality-options', async (request, reply) => {
    await requireAdmin(request, reply);
    return prisma.qualityOption.findMany({
      orderBy: { position: 'asc' },
      include: {
        mappings: {
          include: { service: { select: { id: true, name: true, type: true } } },
        },
      },
    });
  });

  app.post('/quality-options', async (request, reply) => {
    await requireAdmin(request, reply);
    const { label, position } = request.body as { label: string; position?: number };
    if (!label) return reply.status(400).send({ error: 'Label requis' });
    const maxPos = await prisma.qualityOption.aggregate({ _max: { position: true } });
    const option = await prisma.qualityOption.create({
      data: { label, position: position ?? (maxPos._max.position ?? 0) + 1 },
    });
    return reply.status(201).send(option);
  });

  app.put('/quality-options/:id', async (request, reply) => {
    await requireAdmin(request, reply);
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

  app.delete('/quality-options/:id', async (request, reply) => {
    await requireAdmin(request, reply);
    const { id } = request.params as { id: string };
    const optionId = parseId(id);
    if (!optionId) return reply.status(400).send({ error: 'ID invalide' });
    await prisma.qualityOption.delete({ where: { id: optionId } });
    return { ok: true };
  });

  // Seed default quality options
  app.post('/quality-options/seed', async (request, reply) => {
    await requireAdmin(request, reply);
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
    await requireAdmin(request, reply);
    return prisma.qualityMapping.findMany({
      include: {
        qualityOption: true,
        service: { select: { id: true, name: true, type: true } },
      },
      orderBy: { qualityOptionId: 'asc' },
    });
  });

  app.post('/quality-mappings', async (request, reply) => {
    await requireAdmin(request, reply);
    const { qualityOptionId, serviceId, qualityProfileId, qualityProfileName } = request.body as {
      qualityOptionId: number; serviceId: number; qualityProfileId: number; qualityProfileName: string;
    };
    if (!qualityOptionId || !serviceId || !qualityProfileId || !qualityProfileName) {
      return reply.status(400).send({ error: 'Tous les champs sont requis' });
    }
    const mapping = await prisma.qualityMapping.upsert({
      where: { qualityOptionId_serviceId: { qualityOptionId, serviceId } },
      update: { qualityProfileId, qualityProfileName },
      create: { qualityOptionId, serviceId, qualityProfileId, qualityProfileName },
      include: {
        qualityOption: true,
        service: { select: { id: true, name: true, type: true } },
      },
    });
    return reply.status(201).send(mapping);
  });

  app.delete('/quality-mappings/:id', async (request, reply) => {
    await requireAdmin(request, reply);
    const { id } = request.params as { id: string };
    const mappingId = parseId(id);
    if (!mappingId) return reply.status(400).send({ error: 'ID invalide' });
    await prisma.qualityMapping.delete({ where: { id: mappingId } });
    return { ok: true };
  });

  // === SERVICE PROFILES (fetch quality profiles from a specific service) ===

  app.get('/services/:id/profiles', async (request, reply) => {
    await requireAdmin(request, reply);
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
}
