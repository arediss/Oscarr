import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { getArrClient, getServiceTypeForMedia } from '../providers/index.js';
import { getCollection } from '../services/tmdb.js';
import { logEvent } from '../utils/logEvent.js';
import { safeNotify, safeUserNotify, buildSiteLink } from '../utils/safeNotify.js';
import { parseId, parsePage } from '../utils/params.js';
import { REQUEST_STATUSES, ACTIVE_REQUEST_STATUSES } from '../utils/requestStatus.js';
import {
  validateRequestBody,
  findOrCreateMedia,
  getUserTagName,
  runPluginGuard,
  sendToService,
  requestCollectionMovie,
  promoteStaleStatuses,
  resolveServiceContext,
} from '../services/requestService.js';

const VALID_STATUSES: string[] = [...REQUEST_STATUSES];

export async function requestRoutes(app: FastifyInstance) {

  // ─── List requests ────────────────────────────────────────────────
  app.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by request status (pending, approved, declined, processing, available, failed)' },
          page: { type: 'string', description: 'Page number for pagination' },
          userId: { type: 'string', description: 'Filter by user ID (admin only)' },
        },
      },
    },
  }, async (request) => {
    const user = request.user as { id: number; role: string };
    const { status, page, userId } = request.query as { status?: string; page?: string; userId?: string };
    const pageNum = parsePage(page);
    const take = 20;
    const skip = (pageNum - 1) * take;

    const where: Record<string, unknown> = {};
    if (request.ownerScoped) {
      where.userId = user.id;
    } else if (userId) {
      const uid = parseId(userId);
      if (uid) where.userId = uid;
    }
    if (status && VALID_STATUSES.includes(status)) where.status = status;

    // Promote stale statuses before reading
    await promoteStaleStatuses();

    const [requests, total] = await Promise.all([
      prisma.mediaRequest.findMany({
        where,
        include: {
          media: true,
          user: { select: { id: true, displayName: true, avatar: true } },
          approvedBy: { select: { id: true, displayName: true } },
          qualityOption: { select: { id: true, label: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.mediaRequest.count({ where }),
    ]);

    return {
      results: requests,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / take),
    };
  });

  // ─── Request stats ────────────────────────────────────────────────
  app.get('/stats', async (request) => {
    const user = request.user as { id: number; role: string };
    const userFilter = request.ownerScoped ? { userId: user.id } : {};

    const [total, pending, approved, available, declined, searching, upcoming] = await Promise.all([
      prisma.mediaRequest.count({ where: userFilter }),
      prisma.mediaRequest.count({ where: { ...userFilter, status: 'pending' } }),
      prisma.mediaRequest.count({ where: { ...userFilter, status: 'approved' } }),
      prisma.mediaRequest.count({ where: { ...userFilter, status: 'available' } }),
      prisma.mediaRequest.count({ where: { ...userFilter, status: 'declined' } }),
      prisma.mediaRequest.count({ where: { ...userFilter, status: { in: ['searching'] } } }),
      prisma.mediaRequest.count({ where: { ...userFilter, status: 'upcoming' } }),
    ]);

    return { total, pending, approved, available, declined, processing: searching + upcoming };
  });

  // ─── Create request ───────────────────────────────────────────────
  app.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['tmdbId', 'mediaType'],
        properties: {
          tmdbId: { type: 'number', description: 'TMDB ID of the media to request' },
          mediaType: { type: 'string', enum: ['movie', 'tv'], description: 'Type of media' },
          seasons: { type: 'array', items: { type: 'number' }, description: 'Season numbers to request (TV only)' },
          rootFolder: { type: 'string', description: 'Root folder path override' },
          qualityOptionId: { type: 'number', description: 'Quality option ID for quality profile mapping' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const body = request.body as { tmdbId: unknown; mediaType: unknown; seasons?: unknown; rootFolder?: string; qualityOptionId?: number };

    const validation = validateRequestBody(body);
    if (!validation.valid) return reply.status(400).send({ error: validation.error });
    const { tmdbId, mediaType, seasons: validSeasons } = validation;

    // Plugin guard
    if (user.role !== 'admin') {
      const guardResult = await runPluginGuard(user.id);
      if (guardResult?.blocked) return reply.status(guardResult.statusCode || 403).send({ error: guardResult.error });
    }

    const media = await findOrCreateMedia(tmdbId, mediaType);

    // Duplicate check
    const existing = await prisma.mediaRequest.findFirst({
      where: { mediaId: media.id, userId: user.id, status: { in: [...ACTIVE_REQUEST_STATUSES] } },
    });
    if (existing) return reply.status(409).send({ error: 'Vous avez déjà une demande en cours pour ce média' });

    // Auto-approve
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const shouldAutoApprove = user.role === 'admin' || (settings?.autoApproveRequests ?? false);

    const mediaRequest = await prisma.mediaRequest.create({
      data: {
        mediaId: media.id,
        userId: user.id,
        mediaType,
        seasons: validSeasons ? JSON.stringify(validSeasons) : null,
        rootFolder: typeof body.rootFolder === 'string' ? body.rootFolder : null,
        qualityOptionId: body.qualityOptionId ?? null,
        status: shouldAutoApprove ? 'approved' : 'pending',
        approvedById: shouldAutoApprove ? user.id : null,
      },
      include: { media: true, user: { select: { id: true, displayName: true, avatar: true } } },
    });

    let sendFailed = false;
    if (shouldAutoApprove) {
      const tagName = await getUserTagName(user.id);
      const sent = await sendToService(media, mediaType, tagName, user.id, validSeasons, body.qualityOptionId);
      if (!sent) {
        await prisma.mediaRequest.update({ where: { id: mediaRequest.id }, data: { status: 'failed' } });
        sendFailed = true;
      }
    }

    // Notifications
    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { displayName: true } });
    const username = dbUser?.displayName || 'Utilisateur';
    const mediaUrl = await buildSiteLink(`/${mediaType}/${media.tmdbId}`);
    safeNotify('request_new', { title: media.title, mediaType, username, posterPath: media.posterPath, tmdbId: media.tmdbId, url: mediaUrl });
    if (shouldAutoApprove && !sendFailed) {
      safeUserNotify(user.id, { type: 'request_approved', title: media.title, message: `Votre demande pour "${media.title}" a été approuvée automatiquement.`, metadata: { mediaId: media.id, tmdbId: media.tmdbId, mediaType } });
    }
    logEvent('info', 'Request', `${username} a demandé "${media.title}"`);

    if (sendFailed) return reply.status(202).send({ ...mediaRequest, status: 'failed', sendError: true });
    return reply.status(201).send(mediaRequest);
  });

  // ─── Resolve request context (admin preview) ──────────────────────
  app.get('/:id/resolve', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      querystring: { type: 'object', properties: { qualityOptionId: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const requestId = parseId((request.params as { id: string }).id);
    if (!requestId) return reply.status(400).send({ error: 'ID invalide' });
    const overrideQuality = parseId((request.query as { qualityOptionId?: string }).qualityOptionId || '');

    const mediaRequest = await prisma.mediaRequest.findUnique({
      where: { id: requestId },
      include: { media: true, qualityOption: { select: { id: true, label: true } } },
    });
    if (!mediaRequest) return reply.status(404).send({ error: 'Demande introuvable' });

    const effectiveQuality = overrideQuality ?? mediaRequest.qualityOptionId ?? undefined;
    const ctx = await resolveServiceContext(
      mediaRequest.mediaType as 'movie' | 'tv',
      mediaRequest.media.tmdbId,
      mediaRequest.userId,
      effectiveQuality,
    );

    const matchedRuleName = ctx.ruleMatch?.ruleName ?? null;

    // Fetch available root folders and services
    const serviceType = mediaRequest.mediaType === 'movie' ? 'radarr' : 'sonarr';
    let availableRootFolders: { path: string }[] = [];
    try {
      const { getArrClient, getArrClientForService } = await import('../providers/index.js');
      const client = ctx.targetService
        ? getArrClientForService(ctx.targetService.id, serviceType, ctx.targetService.config)
        : await getArrClient(serviceType);
      const folders = await client.getRootFolders();
      availableRootFolders = folders.map(f => ({ path: f.path }));
    } catch { /* service unreachable */ }

    const { getAllServices } = await import('../utils/services.js');
    const availableServices = (await getAllServices(serviceType)).map(s => ({ id: s.id, name: s.name }));

    return {
      qualityOption: effectiveQuality
        ? await prisma.qualityOption.findUnique({ where: { id: effectiveQuality }, select: { id: true, label: true } })
        : mediaRequest.qualityOption,
      folderPath: ctx.ruleMatch?.folderPath || ctx.defaultFolder || null,
      matchedRule: matchedRuleName,
      serviceName: ctx.targetService
        ? (await prisma.service.findUnique({ where: { id: ctx.targetService.id }, select: { name: true } }))?.name
        : null,
      seriesType: ctx.ruleMatch?.seriesType || null,
      targetServiceId: ctx.targetService?.id || null,
      availableRootFolders,
      availableServices,
    };
  });

  // ─── Approve request ──────────────────────────────────────────────
  app.post('/:id/approve', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', properties: { qualityOptionId: { type: 'number' } } },
    },
  }, async (request, reply) => {
    const user = request.user as { id: number };
    const requestId = parseId((request.params as { id: string }).id);
    if (!requestId) return reply.status(400).send({ error: 'ID invalide' });
    const { qualityOptionId: overrideQuality } = (request.body as { qualityOptionId?: number }) || {};

    const mediaRequest = await prisma.mediaRequest.findUnique({
      where: { id: requestId },
      include: { media: true, user: { select: { displayName: true, email: true, id: true } } },
    });
    if (!mediaRequest) return reply.status(404).send({ error: 'Demande introuvable' });
    if (mediaRequest.status !== 'pending') return reply.status(400).send({ error: 'Cette demande ne peut pas être approuvée' });

    // Use override quality if provided, otherwise keep the original
    const effectiveQuality = overrideQuality ?? mediaRequest.qualityOptionId ?? undefined;
    if (overrideQuality && overrideQuality !== mediaRequest.qualityOptionId) {
      await prisma.mediaRequest.update({ where: { id: requestId }, data: { qualityOptionId: overrideQuality } });
    }

    const seasons = mediaRequest.seasons ? JSON.parse(mediaRequest.seasons) : undefined;
    const tagName = mediaRequest.user.displayName || mediaRequest.user.email || `user-${mediaRequest.user.id}`;
    const sent = await sendToService(mediaRequest.media, mediaRequest.mediaType, tagName, mediaRequest.userId, seasons, effectiveQuality, mediaRequest.rootFolder);

    const updated = await prisma.mediaRequest.update({
      where: { id: requestId },
      data: { status: sent ? 'approved' : 'failed', approvedById: user.id },
      include: { media: true, user: { select: { id: true, displayName: true, avatar: true } }, qualityOption: { select: { id: true, label: true } } },
    });

    if (sent) {
      const approvedUrl = await buildSiteLink(`/${updated.mediaType}/${updated.media.tmdbId}`);
      safeNotify('request_approved', { title: updated.media.title, mediaType: updated.mediaType as 'movie' | 'tv', username: updated.user?.displayName || 'Utilisateur', posterPath: updated.media.posterPath, url: approvedUrl });
      safeUserNotify(updated.user.id, { type: 'request_approved', title: updated.media.title, message: `Votre demande pour "${updated.media.title}" a été approuvée.`, metadata: { mediaId: updated.mediaId, tmdbId: updated.media.tmdbId, mediaType: updated.mediaType } });
      logEvent('info', 'Request', `Demande "${updated.media.title}" approuvée`);
    } else {
      logEvent('error', 'Request', `Demande "${updated.media.title}" approuvée mais l'envoi au service a échoué`);
    }

    return reply.send(updated);
  });

  // ─── Decline request ──────────────────────────────────────────────
  app.post('/:id/decline', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const user = request.user as { id: number };
    const requestId = parseId((request.params as { id: string }).id);
    if (!requestId) return reply.status(400).send({ error: 'ID invalide' });

    const updated = await prisma.mediaRequest.update({
      where: { id: requestId },
      data: { status: 'declined', approvedById: user.id },
      include: { media: true, user: { select: { id: true, displayName: true, avatar: true } } },
    });

    const declinedUrl = await buildSiteLink(`/${updated.mediaType}/${updated.media.tmdbId}`);
    safeNotify('request_declined', { title: updated.media.title, mediaType: updated.mediaType as 'movie' | 'tv', username: updated.user?.displayName || 'Utilisateur', posterPath: updated.media.posterPath, url: declinedUrl });
    safeUserNotify(updated.user.id, { type: 'request_declined', title: updated.media.title, message: `Votre demande pour "${updated.media.title}" a été refusée.`, metadata: { mediaId: updated.mediaId, tmdbId: updated.media.tmdbId, mediaType: updated.mediaType } });
    logEvent('info', 'Request', `Demande "${updated.media.title}" refusée`);

    return reply.send(updated);
  });

  // ─── Search missing ───────────────────────────────────────────────
  app.post('/search-missing', {
    schema: {
      body: {
        type: 'object' as const,
        required: ['tmdbId', 'mediaType'],
        properties: {
          tmdbId: { type: 'number' },
          mediaType: { type: 'string', enum: ['movie', 'tv'] },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { tmdbId, mediaType } = request.body as { tmdbId: number; mediaType: string };

    if (user.role !== 'admin') {
      const guardResult = await runPluginGuard(user.id);
      if (guardResult?.blocked) return reply.status(guardResult.statusCode || 403).send({ error: guardResult.error });
    }

    const media = await prisma.media.findUnique({ where: { tmdbId_mediaType: { tmdbId, mediaType } } });
    if (!media) return reply.status(404).send({ error: 'Média introuvable' });

    // Cooldown check
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const cooldownMin = settings?.missingSearchCooldownMin ?? 60;
    if (media.lastMissingSearchAt) {
      const elapsed = Date.now() - new Date(media.lastMissingSearchAt).getTime();
      const remaining = Math.ceil((cooldownMin * 60 * 1000 - elapsed) / 60000);
      if (elapsed < cooldownMin * 60 * 1000) {
        return reply.status(429).send({ error: `Recherche déjà lancée récemment. Réessayez dans ${remaining} min.`, cooldownRemaining: remaining });
      }
    }

    try {
      const serviceId = mediaType === 'movie' ? media.radarrId : media.sonarrId;
      if (!serviceId) {
        return reply.status(400).send({ error: 'Ce média n\'est pas encore dans le service' });
      }
      const serviceType = getServiceTypeForMedia(mediaType);
      const client = await getArrClient(serviceType);
      await client.searchMedia(serviceId);

      await prisma.media.update({ where: { id: media.id }, data: { lastMissingSearchAt: new Date() } });
      logEvent('info', 'Request', `Recherche des manquants lancée pour "${media.title}"`);
      return reply.send({ ok: true });
    } catch (err) {
      console.error('Search missing failed:', err);
      return reply.status(502).send({ error: 'Erreur lors du lancement de la recherche' });
    }
  });

  // ─── Update request (admin) ────────────────────────────────────────
  app.put('/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', properties: { rootFolder: { type: 'string' }, qualityOptionId: { type: 'number' } } },
    },
  }, async (request, reply) => {
    const requestId = parseId((request.params as { id: string }).id);
    if (!requestId) return reply.status(400).send({ error: 'ID invalide' });
    const { rootFolder, qualityOptionId } = (request.body as { rootFolder?: string; qualityOptionId?: number }) || {};

    const data: Record<string, unknown> = {};
    if (rootFolder !== undefined) data.rootFolder = rootFolder || null;
    if (qualityOptionId !== undefined) data.qualityOptionId = qualityOptionId || null;

    if (Object.keys(data).length === 0) return reply.status(400).send({ error: 'Nothing to update' });

    const updated = await prisma.mediaRequest.update({
      where: { id: requestId },
      data,
      include: { media: true, qualityOption: { select: { id: true, label: true } } },
    });
    return reply.send(updated);
  });

  // ─── Bulk cleanup requests (admin) ─────────────────────────────────
  app.post('/cleanup', {
    schema: {
      body: {
        type: 'object',
        required: ['statuses'],
        properties: {
          statuses: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (request, reply) => {
    const { statuses } = request.body as { statuses: string[] };
    const valid = statuses.filter(s => ['available', 'approved', 'declined', 'failed'].includes(s));
    if (valid.length === 0) return reply.status(400).send({ error: 'No valid statuses to cleanup' });

    const result = await prisma.mediaRequest.deleteMany({
      where: { status: { in: valid } },
    });

    logEvent('info', 'Request', `Cleanup: ${result.count} requests deleted (${valid.join(', ')})`);
    return { deleted: result.count, statuses: valid };
  });

  // ─── Delete request ───────────────────────────────────────────────
  app.delete('/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const user = request.user as { id: number };
    const requestId = parseId((request.params as { id: string }).id);
    if (!requestId) return reply.status(400).send({ error: 'ID invalide' });

    const mediaRequest = await prisma.mediaRequest.findUnique({ where: { id: requestId } });
    if (!mediaRequest) return reply.status(404).send({ error: 'Demande introuvable' });
    if (request.ownerScoped && mediaRequest.userId !== user.id) return reply.status(403).send({ error: 'Non autorisé' });

    await prisma.mediaRequest.delete({ where: { id: requestId } });
    return reply.send({ ok: true });
  });

  // ─── Request collection ───────────────────────────────────────────
  app.post('/collection', {
    schema: {
      body: {
        type: 'object',
        required: ['collectionId'],
        properties: { collectionId: { type: 'number' } },
      },
    },
  }, async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { collectionId } = request.body as { collectionId: unknown };

    if (typeof collectionId !== 'number' || !Number.isFinite(collectionId) || collectionId < 1) {
      return reply.status(400).send({ error: 'collectionId invalide' });
    }

    if (user.role !== 'admin') {
      const guardResult = await runPluginGuard(user.id);
      if (guardResult?.blocked) return reply.status(guardResult.statusCode || 403).send({ error: guardResult.error });
    }

    const collection = await getCollection(collectionId);
    if (!collection?.parts?.length) return reply.status(404).send({ error: 'Collection introuvable' });

    let requested = 0;
    let skipped = 0;
    for (const movie of collection.parts) {
      const wasRequested = await requestCollectionMovie(movie.id, user);
      if (wasRequested) requested++; else skipped++;
    }

    return reply.status(201).send({
      collection: collection.name,
      total: collection.parts.length,
      requested,
      skipped,
    });
  });
}
