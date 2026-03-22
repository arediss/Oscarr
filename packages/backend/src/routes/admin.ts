import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { radarr } from '../services/radarr.js';
import { sonarr } from '../services/sonarr.js';
import { syncRadarr, syncSonarr, runFullSync } from '../services/sync.js';
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
      defaultRootFolder?: string;
      subscriptionPrice?: number;
      subscriptionDuration?: number;
      plexMachineId?: string;
    };

    const settings = await prisma.appSettings.upsert({
      where: { id: 1 },
      update: {
        defaultQualityProfile: body.defaultQualityProfile ?? undefined,
        defaultRootFolder: body.defaultRootFolder ?? undefined,
        subscriptionPrice: body.subscriptionPrice ?? undefined,
        subscriptionDuration: body.subscriptionDuration ?? undefined,
        plexMachineId: body.plexMachineId ?? undefined,
      },
      create: {
        id: 1,
        defaultQualityProfile: body.defaultQualityProfile,
        defaultRootFolder: body.defaultRootFolder,
        subscriptionPrice: body.subscriptionPrice ?? 0,
        subscriptionDuration: body.subscriptionDuration ?? 30,
        plexMachineId: body.plexMachineId,
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

  // === USER MANAGEMENT ===

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
