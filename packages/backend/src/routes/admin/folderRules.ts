import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { parseId } from '../../utils/params.js';

export async function folderRulesRoutes(app: FastifyInstance) {
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
    if (!rule) return reply.status(404).send({ error: 'R\u00e8gle introuvable' });
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
    if (!rule) return reply.status(404).send({ error: 'R\u00e8gle introuvable' });
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
}
