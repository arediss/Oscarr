import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { radarr } from '../services/radarr.js';
import { sonarr } from '../services/sonarr.js';
import { syncRadarr, syncSonarr, runFullSync } from '../services/sync.js';
import { getPlexFriends } from '../services/plex.js';
import { syncRequestsFromTags } from '../services/requestSync.js';

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
        updatedAt: new Date(),
      },
    });

    return settings;
  });

  // === SERVICE CONFIG (Radarr/Sonarr profiles & folders) ===

  app.get('/radarr/profiles', async (request, reply) => {
    await requireAdmin(request, reply);
    try {
      const profiles = await radarr.getQualityProfiles();
      return profiles;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Radarr' });
    }
  });

  app.get('/radarr/rootfolders', async (request, reply) => {
    await requireAdmin(request, reply);
    try {
      const folders = await radarr.getRootFolders();
      return folders;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Radarr' });
    }
  });

  app.get('/sonarr/profiles', async (request, reply) => {
    await requireAdmin(request, reply);
    try {
      const profiles = await sonarr.getQualityProfiles();
      return profiles;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Sonarr' });
    }
  });

  app.get('/sonarr/rootfolders', async (request, reply) => {
    await requireAdmin(request, reply);
    try {
      const folders = await sonarr.getRootFolders();
      return folders;
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter Sonarr' });
    }
  });

  // === CHAT / BANNER ===

  app.put('/banner', async (request, reply) => {
    await requireAdmin(request, reply);
    const { banner } = request.body as { banner: string | null };
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { incidentBanner: banner || null },
      create: { id: 1, incidentBanner: banner || null, updatedAt: new Date() },
    });
    return { ok: true };
  });

  app.put('/chat-toggle', async (request, reply) => {
    await requireAdmin(request, reply);
    const { enabled } = request.body as { enabled: boolean };
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { chatEnabled: enabled },
      create: { id: 1, chatEnabled: enabled, updatedAt: new Date() },
    });
    return { ok: true, chatEnabled: enabled };
  });

  app.post('/channels', async (request, reply) => {
    await requireAdmin(request, reply);
    const { name, type } = request.body as { name: string; type?: string };
    if (!name) return reply.status(400).send({ error: 'Nom requis' });
    const channel = await prisma.chatChannel.create({
      data: { name, type: type || 'general', isPrivate: false },
    });
    return reply.status(201).send(channel);
  });

  app.delete('/channels/:id', async (request, reply) => {
    await requireAdmin(request, reply);
    const { id } = request.params as { id: string };
    const channelId = parseId(id);
    if (!channelId) return reply.status(400).send({ error: 'ID invalide' });
    await prisma.chatChannel.delete({ where: { id: channelId } });
    return reply.send({ ok: true });
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

  // === SYNC JOBS ===

  // Get sync status
  app.get('/sync/status', async (request, reply) => {
    await requireAdmin(request, reply);
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    return {
      lastRadarrSync: settings?.lastRadarrSync,
      lastSonarrSync: settings?.lastSonarrSync,
      syncIntervalHours: settings?.syncIntervalHours ?? 6,
    };
  });

  // Trigger incremental sync
  app.post('/sync/run', async (request, reply) => {
    await requireAdmin(request, reply);
    const result = await runFullSync();
    return result;
  });

  // Force full sync (reset timestamps, re-import everything)
  app.post('/sync/force', async (request, reply) => {
    await requireAdmin(request, reply);
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { lastRadarrSync: null, lastSonarrSync: null },
      create: { id: 1, lastRadarrSync: null, lastSonarrSync: null, updatedAt: new Date() },
    });
    const [radarrResult, sonarrResult] = await Promise.all([
      syncRadarr(null),
      syncSonarr(null),
    ]);
    return { radarr: radarrResult, sonarr: sonarrResult };
  });

  // Trigger Radarr sync only
  app.post('/sync/radarr', async (request, reply) => {
    await requireAdmin(request, reply);
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const result = await syncRadarr(settings?.lastRadarrSync);
    return result;
  });

  // Trigger Sonarr sync only
  app.post('/sync/sonarr', async (request, reply) => {
    await requireAdmin(request, reply);
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const result = await syncSonarr(settings?.lastSonarrSync);
    return result;
  });

  // Update sync interval
  app.put('/sync/interval', async (request, reply) => {
    await requireAdmin(request, reply);
    const { hours } = request.body as { hours: number };
    if (typeof hours !== 'number' || hours < 1 || hours > 168) {
      return reply.status(400).send({ error: 'Intervalle entre 1 et 168 heures' });
    }
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { syncIntervalHours: hours },
      create: { id: 1, syncIntervalHours: hours, updatedAt: new Date() },
    });
    return { ok: true, syncIntervalHours: hours };
  });

  // Import historical requests from Radarr/Sonarr tags
  app.post('/sync/requests', async (request, reply) => {
    await requireAdmin(request, reply);
    const result = await syncRequestsFromTags();
    return result;
  });
}
