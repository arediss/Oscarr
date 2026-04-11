import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { triggerJob, updateJobSchedule } from '../../services/scheduler.js';
import nodeSchedule from 'node-cron';

export async function jobsRoutes(app: FastifyInstance) {
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
      return reply.status(400).send({ error: 'Invalid CRON expression' });
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
      return reply.status(500).send({ error: 'Job failed', details: String(err) });
    }
  });
}
