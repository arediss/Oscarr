import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
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

  // Service schemas — used by wizard to build dynamic forms
  app.get('/service-schemas', async () => {
    const { getServiceSchemas } = await import('../providers/index.js');
    return getServiceSchemas();
  });

  // Plex OAuth for setup — just get a token without creating a user
  app.post('/plex-pin', async (_request, reply) => {
    const { plexCreatePin } = await import('../providers/plex/index.js');
    const result = await plexCreatePin();
    return reply.send(result);
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
    const { plexCheckPin } = await import('../providers/plex/index.js');
    const authToken = await plexCheckPin(pinId);
    if (!authToken) return reply.status(400).send({ error: 'PIN non validé' });
    return reply.send({ token: authToken });
  });

  // Test any service during setup (uses the service registry)
  app.post('/test-service', {
    schema: {
      body: {
        type: 'object',
        required: ['type', 'config'],
        properties: {
          type: { type: 'string', description: 'Service type (radarr, sonarr, plex, etc.)' },
          config: { type: 'object', description: 'Service config fields', additionalProperties: { type: 'string' } },
        },
      },
    },
  }, async (request, reply) => {
    const { type, config } = request.body as { type: string; config: Record<string, string> };
    const { getServiceDefinition } = await import('../providers/index.js');
    const def = getServiceDefinition(type);
    if (!def) return reply.status(400).send({ error: 'Type de service non supporté' });

    try {
      return await def.test(config);
    } catch {
      return reply.status(502).send({ error: 'Impossible de contacter le service' });
    }
  });

  // Add any service during setup
  app.post('/service', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'type', 'config'],
        properties: {
          name: { type: 'string', description: 'Display name for the service' },
          type: { type: 'string', description: 'Service type' },
          config: { type: 'object', description: 'Service config fields', additionalProperties: { type: 'string' } },
        },
      },
    },
  }, async (request, reply) => {
    const { name, type, config } = request.body as { name: string; type: string; config: Record<string, string> };
    if (!name || !type || !config) {
      return reply.status(400).send({ error: 'Tous les champs sont requis' });
    }

    const service = await prisma.service.create({
      data: {
        name,
        type,
        config: JSON.stringify(config),
        isDefault: true,
        enabled: true,
      },
    });

    // If Plex with machineId, store in AppSettings
    if (type === 'plex' && config.machineId) {
      await prisma.appSettings.upsert({
        where: { id: 1 },
        update: { plexMachineId: config.machineId },
        create: { id: 1, plexMachineId: config.machineId, updatedAt: new Date() },
      });
    }

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
