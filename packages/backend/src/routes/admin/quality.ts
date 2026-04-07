import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { parseId } from '../../utils/params.js';

export async function qualityRoutes(app: FastifyInstance) {
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
      return reply.status(409).send({ error: 'Ce mapping existe d\u00e9j\u00e0' });
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
}
