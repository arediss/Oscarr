import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';

export async function logsRoutes(app: FastifyInstance) {
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
}
