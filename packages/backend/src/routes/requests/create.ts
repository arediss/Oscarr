import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { getCollection } from '../../services/tmdb.js';
import { logEvent } from '../../utils/logEvent.js';
import { safeNotify, safeUserNotify, buildSiteLink } from '../../utils/safeNotify.js';
import { ACTIVE_REQUEST_STATUSES } from '@oscarr/shared';
import {
  validateRequestBody,
  findOrCreateMedia,
  getUserTagName,
  sendToService,
  requestCollectionMovie,
  isBlacklisted,
} from '../../services/requestService.js';
import { pluginEngine } from '../../plugins/engine.js';

async function runPluginGuard(userId: number) {
  return pluginEngine.runGuards('request.create', userId);
}

/** Create-request paths — the hot path for a user asking for a movie/tv (one) and the bulk
 *  collection endpoint that fan-outs one request per movie in a TMDB collection. Both run the
 *  plugin guard + blacklist check + auto-approve decision before writing the request row. */
export async function requestCreateRoutes(app: FastifyInstance) {
  app.post('/', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
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

    if (user.role !== 'admin') {
      const guardResult = await runPluginGuard(user.id);
      if (guardResult?.blocked) return reply.status(guardResult.statusCode || 403).send({ error: guardResult.error });
    }

    const bl = await isBlacklisted(tmdbId, mediaType);
    if (bl.blacklisted) return reply.status(403).send({ error: bl.reason || 'This media has been blocked by an administrator.' });

    const media = await findOrCreateMedia(tmdbId, mediaType);

    const existing = await prisma.mediaRequest.findFirst({
      where: { mediaId: media.id, userId: user.id, status: { in: [...ACTIVE_REQUEST_STATUSES] } },
    });
    if (existing) return reply.status(409).send({ error: 'You already have an active request for this media' });

    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    let shouldAutoApprove = user.role === 'admin' || (settings?.autoApproveRequests ?? false);
    if (body.qualityOptionId != null) {
      const qualityOpt = await prisma.qualityOption.findUnique({ where: { id: body.qualityOptionId as number } });
      if (qualityOpt?.allowedRoles && user.role !== 'admin') {
        try {
          const roles = JSON.parse(qualityOpt.allowedRoles) as string[];
          if (roles.length > 0 && !roles.includes(user.role)) {
            return reply.status(403).send({ error: 'QUALITY_NOT_ALLOWED' });
          }
        } catch { /* malformed JSON — allow, permissive fallback matches historical behavior */ }
      }
      if (qualityOpt?.approvalMode === 'auto') shouldAutoApprove = true;
      else if (qualityOpt?.approvalMode === 'manual') shouldAutoApprove = user.role === 'admin';
    }

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
      if (sent) {
        // Flip to 'searching' so the UI shows progress; preserve 'available' (quality-upgrade
        // request) and 'processing' (TV partial — keep "request rest" CTA visible).
        if (media.status !== 'available' && media.status !== 'processing') {
          await prisma.media.update({
            where: { id: media.id },
            data: { status: 'searching' },
          }).catch((err) => {
            request.log.warn({ err, mediaId: media.id, requestId: mediaRequest.id }, 'status flip to searching failed');
          });
        }
      } else {
        await prisma.mediaRequest.update({ where: { id: mediaRequest.id }, data: { status: 'failed' } });
        sendFailed = true;
      }
    }

    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { displayName: true } });
    const username = dbUser?.displayName || 'User';
    const mediaUrl = await buildSiteLink(`/${mediaType}/${media.tmdbId}`);
    safeNotify('request_new', { title: media.title, mediaType, username, posterPath: media.posterPath, tmdbId: media.tmdbId, url: mediaUrl });
    if (shouldAutoApprove && !sendFailed) {
      safeUserNotify(user.id, { type: 'request_approved', title: media.title, message: 'notifications.msg.request_auto_approved', metadata: { mediaId: media.id, tmdbId: media.tmdbId, mediaType, msgParams: { title: media.title } } });
    }
    logEvent('info', 'Request', `${username} requested "${media.title}"`);

    if (sendFailed) return reply.status(202).send({ ...mediaRequest, status: 'failed', sendError: true });
    return reply.status(201).send(mediaRequest);
  });

  app.post('/collection', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
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
      return reply.status(400).send({ error: 'Invalid collectionId' });
    }

    if (user.role !== 'admin') {
      const guardResult = await runPluginGuard(user.id);
      if (guardResult?.blocked) return reply.status(guardResult.statusCode || 403).send({ error: guardResult.error });
    }

    const collection = await getCollection(collectionId);
    if (!collection?.parts?.length) return reply.status(404).send({ error: 'Collection not found' });

    let requested = 0;
    let skipped = 0;
    for (const movie of collection.parts) {
      const wasRequested = await requestCollectionMovie(movie.id, user);
      if (wasRequested) requested++;
      else skipped++;
    }

    return reply.status(201).send({
      collection: collection.name,
      total: collection.parts.length,
      requested,
      skipped,
    });
  });
}
