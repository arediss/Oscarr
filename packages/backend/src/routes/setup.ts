import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { prisma } from '../utils/prisma.js';
import { logEvent } from '../services/notifications.js';
import { runFullSync } from '../services/sync.js';
import { initScheduler } from '../services/scheduler.js';
import { isInstalled, markInstalled } from '../utils/install.js';

const SETUP_SECRET = process.env.SETUP_SECRET || '';

async function requireNotInstalled(_request: FastifyRequest, reply: FastifyReply) {
  if (isInstalled()) {
    return reply.status(403).send({ error: 'Installation déjà effectuée' });
  }
}

async function requireSetupSecret(request: FastifyRequest, reply: FastifyReply) {
  if (!SETUP_SECRET) {
    return reply.status(500).send({ error: 'SETUP_SECRET non configuré dans le .env' });
  }
  const token = request.headers['x-setup-secret'];
  if (token !== SETUP_SECRET) {
    return reply.status(401).send({ error: 'Secret d\'installation invalide' });
  }
}

export async function setupRoutes(app: FastifyInstance) {
  // install-status is public — frontend needs it before anything else
  app.get('/install-status', async () => {
    return { installed: isInstalled() };
  });

  // All other setup routes require: not installed + valid secret
  app.addHook('preHandler', async (request, reply) => {
    // Skip install-status (already handled above, but hook runs for all routes in this plugin)
    if (request.url.endsWith('/install-status')) return;
    await requireNotInstalled(request, reply);
    await requireSetupSecret(request, reply);
  });

  // Verify setup secret — lightweight check for the frontend
  app.post('/verify-secret', async () => {
    return { ok: true };
  });

  // Plex OAuth for setup — just get a token without creating a user
  app.post('/plex-pin', async (_request, reply) => {
    const { createPlexPin } = await import('../services/plex.js');
    const pin = await createPlexPin('oscarr-client');
    const authUrl = `https://app.plex.tv/auth#?clientID=oscarr-client&code=${pin.code}&context%5Bdevice%5D%5Bproduct%5D=Oscarr`;
    return reply.send({ pin, authUrl });
  });

  app.post('/plex-check', {
    schema: {
      body: {
        type: 'object',
        required: ['pinId'],
        properties: {
          pinId: { type: 'number', description: 'Plex PIN ID to check' },
        },
      },
    },
  }, async (request, reply) => {
    const { pinId } = request.body as { pinId: number };
    if (!pinId) return reply.status(400).send({ error: 'pinId requis' });
    const { checkPlexPin } = await import('../services/plex.js');
    const authToken = await checkPlexPin(pinId, 'oscarr-client');
    if (!authToken) return reply.status(400).send({ error: 'PIN non validé' });
    return reply.send({ token: authToken });
  });

  // Test a Plex URL from the backend (avoids browser CORS issues)
  app.post('/test-url', {
    schema: {
      body: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'Plex server URL to test connectivity' },
        },
      },
    },
  }, async (request, reply) => {
    const { url } = request.body as { url: string };
    if (!url) return reply.status(400).send({ error: 'URL requis' });
    try {
      const { data } = await axios.get(`${url.replace(/\/+$/, '')}/identity`, {
        headers: { Accept: 'application/json' },
        timeout: 5000,
      });
      return { ok: true, machineIdentifier: data?.MediaContainer?.machineIdentifier };
    } catch {
      return reply.status(502).send({ error: 'Impossible de joindre le serveur' });
    }
  });

  // Initial setup — create first Plex service
  app.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['url', 'token'],
        properties: {
          url: { type: 'string', description: 'Plex server URL' },
          token: { type: 'string', description: 'Plex authentication token' },
          machineId: { type: 'string', description: 'Plex server machine identifier' },
          name: { type: 'string', description: 'Display name for the Plex service' },
        },
      },
    },
  }, async (request, reply) => {
    const { url, token, machineId, name } = request.body as {
      url: string; token: string; machineId?: string; name?: string;
    };
    if (!url || !token) return reply.status(400).send({ error: 'URL et Token requis' });

    const service = await prisma.service.create({
      data: {
        name: name || 'Plex',
        type: 'plex',
        config: JSON.stringify({ url, token, machineId: machineId || '' }),
        isDefault: true,
        enabled: true,
      },
    });

    if (machineId) {
      await prisma.appSettings.upsert({
        where: { id: 1 },
        update: { plexMachineId: machineId },
        create: { id: 1, plexMachineId: machineId, updatedAt: new Date() },
      });
    }

    return reply.status(201).send({ ok: true, service: { ...service, config: JSON.parse(service.config) } });
  });

  // Test a Radarr/Sonarr connection during install
  app.post('/test-arr', {
    schema: {
      body: {
        type: 'object',
        required: ['url', 'apiKey'],
        properties: {
          url: { type: 'string', description: 'Radarr/Sonarr service URL' },
          apiKey: { type: 'string', description: 'Radarr/Sonarr API key' },
        },
      },
    },
  }, async (request, reply) => {
    const { url, apiKey } = request.body as { url: string; apiKey: string };
    if (!url || !apiKey) return reply.status(400).send({ error: 'URL et API key requis' });
    try {
      const { data } = await axios.get(`${url.replace(/\/+$/, '')}/api/v3/system/status`, {
        params: { apikey: apiKey },
        timeout: 5000,
      });
      return { ok: true, version: data.version };
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter le service' });
    }
  });

  // Add a Radarr/Sonarr service during install
  app.post('/service', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'type', 'url', 'apiKey'],
        properties: {
          name: { type: 'string', description: 'Display name for the service' },
          type: { type: 'string', enum: ['radarr', 'sonarr'], description: 'Service type' },
          url: { type: 'string', description: 'Service URL' },
          apiKey: { type: 'string', description: 'Service API key' },
        },
      },
    },
  }, async (request, reply) => {
    const { name, type, url, apiKey } = request.body as {
      name: string; type: 'radarr' | 'sonarr'; url: string; apiKey: string;
    };
    if (!name || !type || !url || !apiKey) {
      return reply.status(400).send({ error: 'Tous les champs sont requis' });
    }
    if (!['radarr', 'sonarr'].includes(type)) {
      return reply.status(400).send({ error: 'Type invalide' });
    }

    const service = await prisma.service.create({
      data: {
        name,
        type,
        config: JSON.stringify({ url: url.replace(/\/+$/, ''), apiKey }),
        isDefault: true,
        enabled: true,
      },
    });

    logEvent('info', 'Setup', `Service "${name}" (${type}) ajouté via l'installation`);
    return reply.status(201).send({ ok: true, service: { ...service, config: JSON.parse(service.config) } });
  });

  // Run first full sync during install — marks installation as complete
  app.post('/sync', async (_request, reply) => {
    const arrService = await prisma.service.findFirst({
      where: { type: { in: ['radarr', 'sonarr'] }, enabled: true },
    });
    if (!arrService) {
      return reply.status(400).send({ error: 'Configurez au moins un service Radarr ou Sonarr' });
    }

    try {
      const result = await runFullSync();
      await initScheduler();

      // Mark installation as complete — locks all setup routes
      markInstalled();

      logEvent('info', 'Setup', 'Première synchronisation complète effectuée');
      return { ok: true, result };
    } catch (err) {
      return reply.status(500).send({ error: 'Sync échouée', details: String(err) });
    }
  });
}
