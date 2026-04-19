import type { FastifyInstance } from 'fastify';
import { getServiceById } from '../../../utils/services.js';
import { getAuthProvider, getArrClient, createArrClient } from '../../../providers/index.js';
import { parseId } from '../../../utils/params.js';

/** Service-config helpers — Plex token passthrough + quality profile / root folder lookups.
 *
 *  The top-level `/radarr/*` and `/sonarr/*` routes target the current default *arr client
 *  (used by the homepage + quick setup). The `/services/:id/*` variants target a specific
 *  service row (used by the admin's quality-mapping editor, which can map one option across
 *  several *arr installs). Both flavors stay here since they share the same provider layer. */
export async function servicesHelperRoutes(app: FastifyInstance) {
  app.get('/plex-token', async (request, reply) => {
    const provider = getAuthProvider('plex');
    if (!provider?.getToken) return reply.status(404).send({ error: 'Plex provider not available' });
    const adminUser = request.user as { id: number };
    const token = await provider.getToken(adminUser.id);
    if (!token) return reply.status(404).send({ error: 'No Plex token found' });
    return { token };
  });

  app.get('/radarr/profiles', async (_request, reply) => {
    try {
      const radarr = await getArrClient('radarr');
      return await radarr.getQualityProfiles();
    } catch {
      return reply.status(502).send({ error: 'Unable to reach Radarr' });
    }
  });

  app.get('/radarr/rootfolders', async (_request, reply) => {
    try {
      const radarr = await getArrClient('radarr');
      return await radarr.getRootFolders();
    } catch {
      return reply.status(502).send({ error: 'Unable to reach Radarr' });
    }
  });

  app.get('/sonarr/profiles', async (_request, reply) => {
    try {
      const sonarr = await getArrClient('sonarr');
      return await sonarr.getQualityProfiles();
    } catch {
      return reply.status(502).send({ error: 'Unable to reach Sonarr' });
    }
  });

  app.get('/sonarr/rootfolders', async (_request, reply) => {
    try {
      const sonarr = await getArrClient('sonarr');
      return await sonarr.getRootFolders();
    } catch {
      return reply.status(502).send({ error: 'Unable to reach Sonarr' });
    }
  });

  app.get('/services/:id/profiles', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'Service ID' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const serviceId = parseId(id);
    if (!serviceId) return reply.status(400).send({ error: 'Invalid ID' });
    const svc = await getServiceById(serviceId);
    if (!svc) return reply.status(404).send({ error: 'Service not found or disabled' });
    try {
      const client = createArrClient(svc.type, svc.config);
      return await client.getQualityProfiles();
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support client creation')) {
        return reply.status(400).send({ error: 'This service type does not support quality profiles' });
      }
      return reply.status(502).send({ error: 'Unable to reach the service' });
    }
  });

  app.get('/services/:id/rootfolders', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'Service ID' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const serviceId = parseId(id);
    if (!serviceId) return reply.status(400).send({ error: 'Invalid ID' });
    const svc = await getServiceById(serviceId);
    if (!svc) return reply.status(404).send({ error: 'Service not found or disabled' });
    try {
      const client = createArrClient(svc.type, svc.config);
      return await client.getRootFolders();
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support client creation')) {
        return reply.status(400).send({ error: 'This service type does not support root folders' });
      }
      return reply.status(502).send({ error: 'Unable to reach the service' });
    }
  });
}
