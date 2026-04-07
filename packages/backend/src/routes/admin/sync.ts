import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { syncArrService, syncAvailabilityDates } from '../../services/sync.js';
import { triggerJob } from '../../services/scheduler.js';

export async function syncRoutes(app: FastifyInstance) {
  // Keep legacy sync endpoints for backwards compat
  app.get('/sync/status', async (request, reply) => {

    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    return {
      lastRadarrSync: settings?.lastRadarrSync,
      lastSonarrSync: settings?.lastSonarrSync,
      syncIntervalHours: settings?.syncIntervalHours ?? 6,
    };
  });

  app.post('/sync/run', async (request, reply) => {

    return triggerJob('full_sync');
  });

  app.post('/sync/force', async (request, reply) => {

    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { lastRadarrSync: null, lastSonarrSync: null },
      create: { id: 1, lastRadarrSync: null, lastSonarrSync: null, updatedAt: new Date() },
    });
    const radarrResult = await syncArrService('radarr', null);
    const sonarrResult = await syncArrService('sonarr', null);
    await syncAvailabilityDates(null);
    return { radarr: radarrResult, sonarr: sonarrResult };
  });
}
