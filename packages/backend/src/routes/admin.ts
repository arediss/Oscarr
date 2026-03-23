import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { getRadarr } from '../services/radarr.js';
import { getSonarr } from '../services/sonarr.js';
import { syncRadarr, syncSonarr, runFullSync } from '../services/sync.js';
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
      subscriptionPrice?: number;
      subscriptionDuration?: number;
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
      subscriptionEnabled?: boolean;
    };

    const settings = await prisma.appSettings.upsert({
      where: { id: 1 },
      update: {
        defaultQualityProfile: body.defaultQualityProfile ?? undefined,
        defaultMovieFolder: body.defaultMovieFolder ?? undefined,
        defaultTvFolder: body.defaultTvFolder ?? undefined,
        defaultAnimeFolder: body.defaultAnimeFolder ?? undefined,
        subscriptionPrice: body.subscriptionPrice ?? undefined,
        subscriptionDuration: body.subscriptionDuration ?? undefined,
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
        subscriptionEnabled: body.subscriptionEnabled ?? undefined,
      },
      create: {
        id: 1,
        defaultQualityProfile: body.defaultQualityProfile,
        defaultMovieFolder: body.defaultMovieFolder,
        defaultTvFolder: body.defaultTvFolder,
        defaultAnimeFolder: body.defaultAnimeFolder,
        subscriptionPrice: body.subscriptionPrice ?? 0,
        subscriptionDuration: body.subscriptionDuration ?? 30,
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
    const { name, mediaType, conditions, folderPath, seriesType, priority } = request.body as {
      name: string; mediaType: string; conditions: unknown[]; folderPath: string; seriesType?: string; priority?: number;
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
      },
    });
    return reply.status(201).send(rule);
  });

  app.put('/folder-rules/:id', async (request, reply) => {
    await requireAdmin(request, reply);
    const { id } = request.params as { id: string };
    const ruleId = parseId(id);
    if (!ruleId) return reply.status(400).send({ error: 'ID invalide' });
    const { name, mediaType, conditions, folderPath, seriesType, priority } = request.body as {
      name?: string; mediaType?: string; conditions?: unknown[]; folderPath?: string; seriesType?: string; priority?: number;
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
        subscriptionEndDate: true,
        lastPaymentDate: true,
        lastPaymentAmount: true,
        createdAt: true,
        _count: { select: { requests: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => ({
      ...u,
      requestCount: u._count.requests,
      subscriptionActive: u.role === 'admin' ||
        (u.subscriptionEndDate && new Date(u.subscriptionEndDate) > new Date()),
    }));
  });

  // Update user subscription (admin records a payment)
  app.put('/users/:id/subscription', async (request, reply) => {
    await requireAdmin(request, reply);
    const { id } = request.params as { id: string };
    const userId = parseId(id);
    if (!userId) return reply.status(400).send({ error: 'ID invalide' });

    const { paymentDate, amount, durationDays } = request.body as {
      paymentDate: string;
      amount?: number;
      durationDays?: number;
    };

    if (!paymentDate) {
      return reply.status(400).send({ error: 'La date de paiement est requise' });
    }

    // Get default duration from settings
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const duration = durationDays || settings?.subscriptionDuration || 30;

    const payDate = new Date(paymentDate);
    const endDate = new Date(payDate.getTime() + duration * 24 * 60 * 60 * 1000);

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        lastPaymentDate: payDate,
        lastPaymentAmount: amount,
        subscriptionEndDate: endDate,
      },
      select: {
        id: true,
        plexUsername: true,
        subscriptionEndDate: true,
        lastPaymentDate: true,
        lastPaymentAmount: true,
      },
    });

    return user;
  });

  // Revoke subscription
  app.delete('/users/:id/subscription', async (request, reply) => {
    await requireAdmin(request, reply);
    const { id } = request.params as { id: string };
    const userId = parseId(id);
    if (!userId) return reply.status(400).send({ error: 'ID invalide' });

    const user = await prisma.user.update({
      where: { id: userId },
      data: { subscriptionEndDate: null },
      select: { id: true, plexUsername: true, subscriptionEndDate: true },
    });

    return user;
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
    const [radarrResult, sonarrResult] = await Promise.all([syncRadarr(null), syncSonarr(null)]);
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
}
